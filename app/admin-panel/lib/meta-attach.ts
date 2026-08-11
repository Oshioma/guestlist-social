import { metaServiceClient } from "./meta-auth";

// One Facebook Page candidate returned by an OAuth login, with its linked
// Instagram professional account (if any). Stored in pending_meta_connections
// and passed to attachMetaPage once the user picks one. NOTE: `access_token`
// is a Page token — never send this shape to browser code.
export type PageCandidate = {
  id: string;
  name: string;
  access_token: string;
  ig_id: string | null;
  ig_username: string | null;
};

// Attach exactly ONE chosen Page (and its linked Instagram) to a client, and
// pin the client's fb_page / ig_handle to it so the publisher targets exactly
// this account and the wrong-account guard has something to check against.
// Service-role only (connected_meta_accounts has RLS with no policies).
export async function attachMetaPage(
  clientId: number,
  page: PageCandidate,
  tokenExpiresAt: string | null
): Promise<{ fb: number; ig: number; error?: string }> {
  const admin = metaServiceClient();
  const now = new Date().toISOString();

  const { error: fbErr } = await admin.from("connected_meta_accounts").upsert(
    {
      client_id: clientId,
      platform: "facebook",
      account_id: page.id,
      account_name: page.name,
      access_token: page.access_token,
      token_expires_at: tokenExpiresAt,
      updated_at: now,
    },
    { onConflict: "client_id,platform,account_id" }
  );
  if (fbErr) return { fb: 0, ig: 0, error: fbErr.message };

  let ig = 0;
  if (page.ig_id) {
    const { error: igErr } = await admin.from("connected_meta_accounts").upsert(
      {
        client_id: clientId,
        platform: "instagram",
        account_id: page.ig_id,
        account_name: page.ig_username ?? "",
        // Instagram Graph API publishing uses the parent Page's token.
        access_token: page.access_token,
        token_expires_at: tokenExpiresAt,
        updated_at: now,
      },
      { onConflict: "client_id,platform,account_id" }
    );
    if (!igErr) ig = 1;
  }

  // Pin the client's declared Page/handle to what was picked — this is what
  // makes publishing target this account, and it auto-captures the handle so
  // it never has to be set by hand. Defensive: fb_page is a newer column, so
  // fall back to just ig_handle if the update rejects the column.
  const patch: Record<string, unknown> = { fb_page: page.name };
  if (page.ig_username) patch.ig_handle = page.ig_username;
  const upd = await admin.from("clients").update(patch).eq("id", clientId);
  if (upd.error && page.ig_username) {
    await admin.from("clients").update({ ig_handle: page.ig_username }).eq("id", clientId);
  }

  return { fb: 1, ig };
}

// May this user attach/manage this client's account? Staff always; otherwise
// they must own or admin a team the client sits in. Service-role read.
export async function canManageClientAccount(
  userId: string,
  clientId: number,
  isStaff: boolean
): Promise<boolean> {
  if (isStaff) return true;
  const admin = metaServiceClient();
  const { data: teamRows } = await admin
    .from("team_accounts")
    .select("team_id")
    .eq("client_id", clientId);
  const teamIds = (teamRows ?? []).map((r) => r.team_id as string);
  if (teamIds.length === 0) return false;
  const { data: mem } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .in("team_id", teamIds)
    .in("role", ["owner", "admin"])
    .limit(1);
  return (mem?.length ?? 0) > 0;
}

"use server";

// Cleanup for the connected_meta_accounts pollution created by the OAuth
// connect flow attaching a login's whole portfolio under one client. The
// wrong-account guard already makes the strays harmless at publish time, but
// they clutter the UI and store redundant tokens. This action removes every
// connected account for a client EXCEPT the one that matches the client's
// declared handle / Page — i.e. everything the panel doesn't mark with a ✓.
//
// Safety: it keeps exactly what resolveAccountMatch (the same logic the
// publisher uses) would publish to. If nothing matches a platform, all of that
// platform's rows are strays and are removed — the operator can always
// reconnect. The table has RLS with no policies, so writes go through the
// service-role client.

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth/permissions";
import { metaServiceClient } from "./meta-auth";
import { resolveAccountMatch } from "./account-match";

type PruneResult = {
  removed: number;
  kept: string[];
  error?: string;
};

export async function pruneClientMetaStraysAction(
  clientId: string
): Promise<PruneResult> {
  if (!(await isAdmin())) {
    return { removed: 0, kept: [], error: "Not authorized." };
  }
  const idNum = Number(clientId);
  if (!clientId || Number.isNaN(idNum)) {
    return { removed: 0, kept: [], error: "Invalid client." };
  }

  const admin = metaServiceClient();

  // Client's declared targets (defensive: fb_page is a newer column).
  let handle: string | null = null;
  let fbPage: string | null = null;
  const full = await admin
    .from("clients")
    .select("ig_handle, fb_page")
    .eq("id", idNum)
    .maybeSingle();
  if (full.error) {
    const fallback = await admin
      .from("clients")
      .select("ig_handle")
      .eq("id", idNum)
      .maybeSingle();
    handle = (fallback.data?.ig_handle as string | null) ?? null;
  } else {
    handle = (full.data?.ig_handle as string | null) ?? null;
    fbPage = (full.data?.fb_page as string | null) ?? null;
  }

  const { data: rows, error } = await admin
    .from("connected_meta_accounts")
    .select("id, platform, account_id, account_name")
    .eq("client_id", idNum);
  if (error) {
    return { removed: 0, kept: [], error: error.message };
  }
  const all = (rows ?? []).map((r) => ({
    id: r.id as string | number,
    platform: String(r.platform) as "facebook" | "instagram",
    account_id: String(r.account_id),
    account_name: (r.account_name as string | null) ?? null,
  }));

  const fbRows = all.filter((r) => r.platform === "facebook");
  const igRows = all.filter((r) => r.platform === "instagram");

  const fbMatch = resolveAccountMatch({
    accounts: fbRows,
    platform: "facebook",
    handle: null,
    fbPage,
  });
  const igMatch = resolveAccountMatch({
    accounts: igRows,
    platform: "instagram",
    handle,
    fbPage: null,
  });

  const keep = new Set<string>();
  if (fbMatch.ok) keep.add(`facebook|${fbMatch.account.account_id}`);
  if (igMatch.ok) keep.add(`instagram|${igMatch.account.account_id}`);

  const toDelete = all.filter((r) => !keep.has(`${r.platform}|${r.account_id}`));
  const kept = all
    .filter((r) => keep.has(`${r.platform}|${r.account_id}`))
    .map((r) => `${r.platform === "facebook" ? "FB" : "IG"} ${r.account_name || r.account_id}`);

  if (toDelete.length > 0) {
    const del = await admin
      .from("connected_meta_accounts")
      .delete()
      .in(
        "id",
        toDelete.map((r) => r.id)
      );
    if (del.error) {
      return { removed: 0, kept, error: del.error.message };
    }
  }

  revalidatePath("/admin-panel/proofer/publish");
  return { removed: toDelete.length, kept };
}

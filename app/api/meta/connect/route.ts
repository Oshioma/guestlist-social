import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { metaAuthorizeUrl, metaRedirectUriForHost } from "../../../admin-panel/lib/meta-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { socialAccountConnectGate } from "@/lib/billing/team-billing";

// Reaches an external service (OAuth token exchange); the platform default is not a
// safe assumption for it.
export const maxDuration = 30;


type Actor = { userId: string; isStaff: boolean };

// May the signed-in user connect credentials for this account? Connecting is a
// management action, so: agency staff, or an owner/admin of a team that
// contains the account. Anyone else (members, clients, strangers) is refused —
// this is what makes self-serve connect safe, and it closes the previously
// unauthenticated hole where any caller could attach tokens to any client.
//
// Returns the resolved actor on success (so the caller can then apply the plan
// limit) or null when the user may not connect this account.
async function canConnectClient(clientId: number): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (staff) return { userId: user.id, isStaff: true };

  const { data: managed } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"]);
  const teamIds = (managed ?? []).map((r) => r.team_id);
  if (teamIds.length === 0) return null;

  const { data: has } = await admin
    .from("team_accounts")
    .select("client_id")
    .eq("client_id", clientId)
    .in("team_id", teamIds)
    .limit(1)
    .maybeSingle();
  return has ? { userId: user.id, isStaff: false } : null;
}

// GET /api/meta/connect?clientId=<id>
//
// Step 1 of the Meta OAuth flow. Generates a signed state cookie containing
// the client id + random nonce, then redirects the user to Meta's OAuth
// dialog. The callback route verifies the cookie before exchanging the
// code, so we can't be tricked into storing tokens against the wrong client.
//
// All Meta credentials come from META_SOCIAL_APP_ID / META_SOCIAL_APP_SECRET
// / META_SOCIAL_OAUTH_REDIRECT_URI — a dedicated app separate from the
// marketing/ads app that uses META_APP_ID in this same codebase. Do not
// swap back to META_APP_ID or the callback will try to exchange the code
// against a different app's secret and fail.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query param is required" },
      { status: 400 }
    );
  }

  const clientIdNum = Number(clientId);
  if (!Number.isInteger(clientIdNum) || clientIdNum <= 0) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }
  const actor = await canConnectClient(clientIdNum);
  if (!actor) {
    return NextResponse.json(
      { error: "You don't have permission to connect this account." },
      { status: 403 }
    );
  }

  // Plan limit: block new connections once the team is at its social-account
  // cap (a reconnect of an already-connected account is always allowed, and
  // staff bypass the limit). Sending the user to Meta only to reject the tokens
  // in the callback would be a confusing dead end, so gate before OAuth.
  const gate = await socialAccountConnectGate(createAdminClient(), {
    userId: actor.userId,
    isStaff: actor.isStaff,
    clientId: clientIdNum,
  });
  if (!gate.allowed) {
    const reason = gate.reason ?? "Plan limit reached.";
    const returnTo = searchParams.get("returnTo");
    if (returnTo) {
      try {
        const url = new URL(returnTo, new URL(req.url).origin);
        url.searchParams.set("connect_error", reason);
        return NextResponse.redirect(url.toString());
      } catch {
        // Fall through to the JSON response if returnTo isn't a usable URL.
      }
    }
    return NextResponse.json({ error: reason }, { status: 402 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${clientId}:${nonce}`;

  const returnTo = searchParams.get("returnTo") ?? "";

  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  if (returnTo) {
    cookieStore.set("meta_oauth_return", `${returnTo}:${clientId}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

  try {
    // On a standalone Proofer host, keep the whole OAuth on this host so the
    // cookies set here are present when Meta redirects back. Falls back to the
    // configured env redirect URI on the main app.
    const hostRedirect = metaRedirectUriForHost(new URL(req.url).host);
    const authorizeUrl = metaAuthorizeUrl(state, hostRedirect);
    // Dump the exact URL we're sending the user to so it's visible in
    // Vercel Runtime Logs when diagnosing OAuth errors ("Feature
    // Unavailable", "Invalid App ID", "URL Blocked", etc.). Nothing in
    // this URL is sensitive — client_id, redirect_uri and scopes are
    // all plaintext query params that Meta receives anyway.
    console.log(
      `[meta/connect] clientId=${clientId} redirectUri=${process.env.META_SOCIAL_OAUTH_REDIRECT_URI} appId=${process.env.META_SOCIAL_APP_ID} url=${authorizeUrl}`
    );
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[meta/connect] config error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

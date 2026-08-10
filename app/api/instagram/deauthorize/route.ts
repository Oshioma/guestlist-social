import { NextResponse } from "next/server";
import {
  metaServiceClient,
  parseSignedRequest,
} from "../../../admin-panel/lib/meta-auth";

// POST /api/instagram/deauthorize
//
// Meta calls this (the app's "Deauthorize callback URL") when a user removes
// our app from their Instagram account. The body is a form-encoded
// `signed_request` HMAC-signed with our Instagram app secret. We verify it,
// then delete any Instagram-Login rows for that user so we stop trying to
// publish with a now-revoked token. Always answer 200 — Meta retries on
// non-2xx and there's nothing for it to retry.

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const signedRequest = form.get("signed_request");
    if (typeof signedRequest !== "string") {
      return NextResponse.json({ ok: true });
    }
    const payload = parseSignedRequest(signedRequest);
    const userId = payload?.user_id;
    if (typeof userId === "string" || typeof userId === "number") {
      const admin = metaServiceClient();
      await admin
        .from("connected_meta_accounts")
        .delete()
        .eq("platform", "instagram")
        .eq("auth_type", "instagram_login")
        .eq("account_id", String(userId));
    }
  } catch (err) {
    // Best-effort cleanup — never fail the callback.
    console.error("instagram/deauthorize error:", err);
  }
  return NextResponse.json({ ok: true });
}

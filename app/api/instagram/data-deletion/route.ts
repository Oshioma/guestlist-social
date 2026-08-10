import { NextResponse } from "next/server";
import {
  metaServiceClient,
  parseSignedRequest,
} from "../../../admin-panel/lib/meta-auth";

// POST /api/instagram/data-deletion
//
// Meta calls this (the app's "Data Deletion Request URL") when a user
// requests deletion of their data. The body is a form-encoded
// `signed_request` HMAC-signed with our Instagram app secret. Meta REQUIRES a
// JSON response of the shape { url, confirmation_code } — `url` is a page the
// user can visit to check status, `confirmation_code` identifies the request.
//
// We store no personal Instagram data beyond the connection row (user id,
// username, access token), so honouring the request just means deleting that
// row. The confirmation code is the user id, which is enough to look the
// request up in our logs.

export async function POST(req: Request) {
  let confirmationCode = "unknown";
  try {
    const form = await req.formData();
    const signedRequest = form.get("signed_request");
    if (typeof signedRequest === "string") {
      const payload = parseSignedRequest(signedRequest);
      const userId = payload?.user_id;
      if (typeof userId === "string" || typeof userId === "number") {
        confirmationCode = String(userId);
        const admin = metaServiceClient();
        await admin
          .from("connected_meta_accounts")
          .delete()
          .eq("platform", "instagram")
          .eq("auth_type", "instagram_login")
          .eq("account_id", confirmationCode);
      }
    }
  } catch (err) {
    console.error("instagram/data-deletion error:", err);
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    url: `${origin}/api/instagram/data-deletion?code=${encodeURIComponent(confirmationCode)}`,
    confirmation_code: confirmationCode,
  });
}

// A GET on the status URL just confirms the request was received. We delete
// synchronously above, so by the time anyone visits, it's already done.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "unknown";
  return NextResponse.json({
    confirmation_code: code,
    status: "Data deletion request processed.",
  });
}

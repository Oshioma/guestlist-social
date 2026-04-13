import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { metaAuthorizeUrl } from "../../../admin-panel/lib/meta-auth";

// GET /api/meta/connect?clientId=<id>
//
// Step 1 of the Meta OAuth flow. Generates a signed state cookie containing
// the client id + random nonce, then redirects the user to Meta's OAuth
// dialog. The callback route verifies the cookie before exchanging the
// code, so we can't be tricked into storing tokens against the wrong client.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query param is required" },
      { status: 400 }
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${clientId}:${nonce}`;

  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  try {
    const authorizeUrl = metaAuthorizeUrl(state);
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

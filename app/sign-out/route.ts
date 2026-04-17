// POST /sign-out — invalidates the Supabase session and redirects to /sign-in.
//
// POST (not GET) so a third-party page can't log a user out by embedding
// <img src="/sign-out">. The sidebar submits a tiny form to hit this.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL("/sign-in", request.url);
  return NextResponse.redirect(url, { status: 303 });
}

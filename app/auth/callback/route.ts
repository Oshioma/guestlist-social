// Receives the user back from the central auth app, exchanges the code for a
// Supabase session, then redirects internally. No external returnTo validation
// needed here — this site is the destination, not the auth controller.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Validate code is a non-empty alphanumeric string before exchanging
  if (code && /^[\w-]{10,512}$/.test(code)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  // Auth failed or no code — send back to login
  return NextResponse.redirect(`${origin}/login`);
}

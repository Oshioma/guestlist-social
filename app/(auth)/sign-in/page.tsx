import { Suspense } from "react";
import Link from "next/link";
import { SignInForm } from "./SignInForm";
import { publicSignupEnabled } from "@/lib/auth/public-signup";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const error = typeof params.error === "string" ? params.error : null;
  const canSignUp = await publicSignupEnabled();

  // A user bounced here with ?error=not-authorized who is ALREADY signed in is
  // authenticated but admitted to nothing (no team membership / account). Showing
  // them the login form just loops them (sign in → post-login → bounce → here),
  // and "wrong credentials" is the wrong story — their password is fine. Tell
  // them plainly and give them the only useful action: sign out. Getting real
  // access is an admin adding them to a team, which no form here can do.
  if (error === "not-authorized") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return (
        <div className="auth-card">
          <h1 className="auth-title">You&apos;re signed in</h1>
          <p className="auth-subtitle">
            You&apos;re signed in as {user.email ?? "your account"}, but it
            isn&apos;t a member of any workspace yet. Ask an admin to add you to
            a team, then sign in again.
          </p>
          <form action={signOut}>
            <button type="submit" className="auth-submit">
              Sign out
            </button>
          </form>
        </div>
      );
    }
  }

  return (
    <div className="auth-card">
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-subtitle">Welcome back.</p>
      {error === "not-authorized" && (
        <p className="auth-alert auth-alert-error">
          This account isn&apos;t authorized. Access is invite-only — ask an
          admin to invite you.
        </p>
      )}
      <Suspense fallback={null}>
        <SignInForm next={next} />
      </Suspense>
      {canSignUp && (
        <p className="auth-subtitle" style={{ marginTop: 16, textAlign: "center" }}>
          <Link href="/sign-up">New here? Create an account</Link>
        </p>
      )}
    </div>
  );
}

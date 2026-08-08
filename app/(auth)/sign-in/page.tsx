import { Suspense } from "react";
import Link from "next/link";
import { SignInForm } from "./SignInForm";
import { publicSignupEnabled } from "@/lib/auth/public-signup";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const error = typeof params.error === "string" ? params.error : null;

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
      {publicSignupEnabled() && (
        <p className="auth-subtitle" style={{ marginTop: 16, textAlign: "center" }}>
          <Link href="/sign-up">New here? Create an account</Link>
        </p>
      )}
    </div>
  );
}

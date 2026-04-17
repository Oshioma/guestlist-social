import { Suspense } from "react";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;

  return (
    <div className="auth-card">
      <h1 className="auth-title">Forgot password</h1>
      <p className="auth-subtitle">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <Suspense fallback={null}>
        <ForgotPasswordForm next={next} />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;

  return (
    <div className="auth-card">
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-subtitle">Welcome back.</p>
      <Suspense fallback={null}>
        <SignInForm next={next} />
      </Suspense>
    </div>
  );
}

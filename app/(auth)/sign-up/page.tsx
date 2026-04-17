import { Suspense } from "react";
import { SignUpForm } from "./SignUpForm";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignUpPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;

  return (
    <div className="auth-card">
      <h1 className="auth-title">Create account</h1>
      <p className="auth-subtitle">Join Guestlist Social.</p>
      <Suspense fallback={null}>
        <SignUpForm next={next} />
      </Suspense>
    </div>
  );
}

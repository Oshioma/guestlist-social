import { redirect } from "next/navigation";
import { publicSignupEnabled } from "@/lib/auth/public-signup";
import { SignUpForm } from "./SignUpForm";

export default async function SignUpPage() {
  // Invite-only unless the flag is set. Bounce to sign-in so there's no
  // dangling public form when self-serve sign-up is off.
  if (!publicSignupEnabled()) {
    redirect("/sign-in");
  }

  return (
    <div className="auth-card">
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">
        Sign up and you&apos;ll get your own team — add your social accounts and
        start posting.
      </p>
      <SignUpForm />
    </div>
  );
}

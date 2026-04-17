import { Suspense } from "react";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="auth-card">
      <h1 className="auth-title">Reset password</h1>
      <p className="auth-subtitle">Choose a new password for your account.</p>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

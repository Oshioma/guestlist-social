import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./AcceptInviteForm";

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // No session = invite link wasn't verified; send them back through sign-in.
    redirect("/sign-in?error=Invite+link+expired");
  }

  return (
    <div className="auth-card">
      <h1 className="auth-title">Welcome</h1>
      <p className="auth-subtitle">
        Set a password to finish creating your account.
      </p>
      <AcceptInviteForm email={user.email ?? ""} />
    </div>
  );
}

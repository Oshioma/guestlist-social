import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteMemberForm } from "./InviteMemberForm";
import { MemberRow } from "./MemberRow";

export const dynamic = "force-dynamic";

type MemberRecord = {
  userId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  canRunAds: boolean;
  createdAt: string;
  isSelf: boolean;
};

export default async function MembersPage() {
  const actor = await requireAdmin();

  const admin = createAdminClient();

  // List every Supabase user, then pull each one's user_roles row. We hide
  // portal/client users (those with a client_user_links row) so this page
  // stays focused on the team that runs the agency.
  const [{ data: usersResp, error: usersErr }, { data: linkRows }, { data: roleRows }] =
    await Promise.all([
      admin.auth.admin.listUsers({ perPage: 200 }),
      admin.from("client_user_links").select("auth_user_id"),
      admin.from("user_roles").select("user_id, role, can_run_ads"),
    ]);

  if (usersErr) {
    throw new Error(`Could not load members: ${usersErr.message}`);
  }

  const clientUserIds = new Set(
    (linkRows ?? []).map((r: { auth_user_id: string }) => r.auth_user_id)
  );
  const roleByUser = new Map(
    (roleRows ?? []).map((r: { user_id: string; role: string; can_run_ads: boolean }) => [
      r.user_id,
      { role: r.role as "admin" | "member", canRunAds: r.can_run_ads },
    ])
  );

  const members: MemberRecord[] = (usersResp?.users ?? [])
    .filter((u) => !clientUserIds.has(u.id))
    .map((u) => {
      const role = roleByUser.get(u.id);
      const fullName =
        (u.user_metadata as { full_name?: string } | null)?.full_name ?? null;
      return {
        userId: u.id,
        email: u.email ?? "(no email)",
        fullName,
        role: role?.role ?? "member",
        canRunAds: role?.canRunAds ?? false,
        createdAt: u.created_at ?? "",
        isSelf: u.id === actor.userId,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link
          href="/app/settings"
          style={{
            display: "inline-block",
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            marginBottom: 8,
          }}
        >
          &larr; Settings
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Members</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Invite your team and decide who can run ads.
        </p>
      </div>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Invite a member</h3>
        <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#71717a" }}>
          They'll get an email, set a password, and land in the admin panel.
        </p>
        <InviteMemberForm />
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
          Team ({members.length})
        </h3>
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
            No members yet. Invite someone above.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => (
              <MemberRow key={m.userId} member={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

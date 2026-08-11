import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { MembersManager, type MemberRecord } from "./MembersManager";

export const dynamic = "force-dynamic";

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
    .sort((a, b) => {
      // You first, then admins, then alphabetical — mirrors the Teams list.
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.email.localeCompare(b.email);
    });

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24, background: "#f3f3f5" }}>
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <Link href="/app/settings" style={backLinkStyle}>
            &larr; Settings
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Members</h2>
          <p style={subtitleStyle}>
            The people on your agency team and what they can do. Admins manage
            everything; members handle day-to-day work. The ads toggle controls
            who can create and edit ad campaigns. To manage who works on a
            specific client&rsquo;s accounts, use{" "}
            <Link href="/proofer/teams" style={{ color: "#4451b8", fontWeight: 600 }}>
              Teams
            </Link>
            .
          </p>
        </div>

        <section style={teamCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Agency team</span>
            <span style={countTag}>{members.length}</span>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#71717a" }}>
            Invited members get an email, set a password, and land in the admin
            panel.
          </p>
          <MembersManager members={members} />
        </section>
      </div>
    </main>
  );
}

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 13,
  color: "#71717a",
  textDecoration: "none",
  marginBottom: 8,
};

const subtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  color: "#71717a",
  maxWidth: 640,
  lineHeight: 1.5,
};

const teamCard: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const countTag: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#71717a",
  background: "#f4f4f5",
  border: "1px solid #e4e4e7",
  borderRadius: 999,
  padding: "1px 9px",
};

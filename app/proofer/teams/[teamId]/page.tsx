import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../../base";
import { TeamSettingsForm } from "@/app/admin-panel/settings/teams/[teamId]/TeamSettingsForm";
import { InviteToTeamForm } from "@/app/admin-panel/settings/teams/[teamId]/InviteToTeamForm";
import { TeamMemberRow } from "@/app/admin-panel/settings/teams/[teamId]/TeamMemberRow";
import { TeamAccountsManager } from "@/app/admin-panel/settings/teams/[teamId]/TeamAccountsManager";
import type { Role, TeamMember, AccountOption } from "@/app/admin-panel/settings/teams/[teamId]/types";

export const dynamic = "force-dynamic";

export default async function ProoferTeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");
  const { teamId } = await params;

  const admin = createAdminClient();
  const { base } = await getProoferBase();

  const { data: team, error: teamErr } = await admin
    .from("teams")
    .select("id, name, plan, owner_user_id")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new Error(`Could not load team: ${teamErr.message}`);
  if (!team) notFound();

  const [{ data: memberRows }, { data: clientRows }, { data: teamAccountRows }, { data: usersResp }] =
    await Promise.all([
      admin.from("team_members").select("user_id, role").eq("team_id", teamId),
      admin.from("clients").select("id, name, archived").order("name", { ascending: true }),
      admin.from("team_accounts").select("client_id").eq("team_id", teamId),
      admin.auth.admin.listUsers({ perPage: 200 }),
    ]);

  // Authorize: staff see any team; otherwise you must be a member of it.
  const myMembership = (memberRows ?? []).find((m) => m.user_id === access.userId);
  const isStaff = access.kind === "staff";
  if (!isStaff && !myMembership) notFound();

  // Manage = staff, or this team's owner/admin. Members/clients get read-only.
  const canManage =
    isStaff || myMembership?.role === "owner" || myMembership?.role === "admin";

  const userById = new Map(
    (usersResp?.users ?? []).map((u) => [
      u.id,
      {
        email: u.email ?? "(no email)",
        fullName: (u.user_metadata as { full_name?: string } | null)?.full_name ?? null,
      },
    ])
  );

  const roleRank: Record<Role, number> = { owner: 0, admin: 1, member: 2, client: 3 };
  const members: TeamMember[] = (memberRows ?? [])
    .map((m) => {
      const u = userById.get(m.user_id);
      return {
        userId: m.user_id as string,
        email: u?.email ?? "(unknown)",
        fullName: u?.fullName ?? null,
        role: (m.role as Role) ?? "member",
        isOwner: m.user_id === team.owner_user_id,
      };
    })
    .sort((a, b) => roleRank[a.role] - roleRank[b.role] || a.email.localeCompare(b.email));

  const inTeam = new Set((teamAccountRows ?? []).map((r) => Number(r.client_id)));

  // Which accounts a non-staff manager may even see in the picker: only the
  // ones they already control (in a team they own/admin), plus the ones
  // already in this team. Staff see every account. Without this, a non-staff
  // owner would see every agency client's name in "available to add".
  let controlledClientIds: Set<number> | null = null;
  if (!isStaff) {
    const { data: managed } = await admin
      .from("team_members")
      .select("team_id")
      .eq("user_id", access.userId)
      .in("role", ["owner", "admin"]);
    const managedTeamIds = (managed ?? []).map((r) => r.team_id);
    const { data: controlledRows } = managedTeamIds.length
      ? await admin.from("team_accounts").select("client_id").in("team_id", managedTeamIds)
      : { data: [] as { client_id: number }[] };
    controlledClientIds = new Set((controlledRows ?? []).map((r) => Number(r.client_id)));
  }

  const accounts: AccountOption[] = (clientRows ?? [])
    .filter((c) => !c.archived)
    .filter(
      (c) =>
        controlledClientIds === null ||
        controlledClientIds.has(Number(c.id)) ||
        inTeam.has(Number(c.id))
    )
    .map((c) => ({
      clientId: Number(c.id),
      name: (c.name as string) ?? `Client ${c.id}`,
      inTeam: inTeam.has(Number(c.id)),
    }));

  const plan = (team.plan as "free" | "pro") ?? "free";
  const accountsInTeam = accounts.filter((a) => a.inTeam);

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Link href={`${base}/teams`} style={backLinkStyle}>
            &larr; Teams
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{team.name as string}</h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
            {plan === "pro" ? "Pro team" : "Free team"} · {accountsInTeam.length} account(s) ·{" "}
            {members.length} {members.length === 1 ? "person" : "people"}
            {!canManage && " · you have view access"}
          </p>
        </div>

        {canManage ? (
          <>
            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Team settings</h3>
              <TeamSettingsForm teamId={teamId} name={team.name as string} plan={plan} />
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Accounts in this team</h3>
              <p style={sectionSubStyle}>
                Add a client&rsquo;s account here, then invite them as a client
                below. They&rsquo;ll see only the accounts in this team. An
                account can live in more than one team.
              </p>
              <TeamAccountsManager teamId={teamId} accounts={accounts} />
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Invite someone</h3>
              <p style={sectionSubStyle}>
                Invite a client to give them a view of just this team&rsquo;s
                content. Members and admins (a Pro feature) can work the board —
                draft, caption, schedule and proof — but never see stored
                passwords, and only agency staff push posts live to Meta.
              </p>
              <InviteToTeamForm teamId={teamId} plan={plan} />
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>People ({members.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {members.map((m) => (
                  <TeamMemberRow key={m.userId} teamId={teamId} member={m} plan={plan} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Accounts ({accountsInTeam.length})</h3>
              {accountsInTeam.length === 0 ? (
                <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>No accounts yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {accountsInTeam.map((a) => (
                    <div key={a.clientId} style={readRowStyle}>{a.name}</div>
                  ))}
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>People ({members.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {members.map((m) => (
                  <div key={m.userId} style={{ ...readRowStyle, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{m.fullName || m.email}</span>
                    <span style={{ color: "#a1a1aa", fontSize: 12, textTransform: "capitalize" }}>{m.role}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "#a1a1aa", margin: "12px 0 0" }}>
                Only this team&rsquo;s owner or an admin can invite people or
                change accounts.
              </p>
            </section>
          </>
        )}
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

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  padding: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 15,
  fontWeight: 600,
};

const sectionSubStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 13,
  color: "#71717a",
  maxWidth: 620,
};

const readRowStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fff",
  fontSize: 14,
};

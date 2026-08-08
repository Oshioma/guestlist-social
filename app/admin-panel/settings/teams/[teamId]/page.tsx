import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamSettingsForm } from "./TeamSettingsForm";
import { InviteToTeamForm } from "./InviteToTeamForm";
import { TeamMemberRow } from "./TeamMemberRow";
import { TeamAccountsManager } from "./TeamAccountsManager";

export const dynamic = "force-dynamic";

type Role = "owner" | "admin" | "member" | "client";

export type TeamMember = {
  userId: string;
  email: string;
  fullName: string | null;
  role: Role;
  isOwner: boolean;
};

export type AccountOption = {
  clientId: number;
  name: string;
  inTeam: boolean;
};

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireAdmin();
  const { teamId } = await params;

  const admin = createAdminClient();

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
  const accounts: AccountOption[] = (clientRows ?? [])
    .filter((c) => !c.archived)
    .map((c) => ({
      clientId: Number(c.id),
      name: (c.name as string) ?? `Client ${c.id}`,
      inTeam: inTeam.has(Number(c.id)),
    }));

  const plan = (team.plan as "free" | "pro") ?? "free";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link href="/app/settings/teams" style={backLinkStyle}>
          &larr; Teams
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{team.name as string}</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          {plan === "pro" ? "Pro team" : "Free team"} · {accounts.filter((a) => a.inTeam).length}{" "}
          account(s) · {members.length} {members.length === 1 ? "person" : "people"}
        </p>
      </div>

      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>Team settings</h3>
        <TeamSettingsForm teamId={teamId} name={team.name as string} plan={plan} />
      </section>

      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>Accounts in this team</h3>
        <p style={sectionSubStyle}>
          Add a client&rsquo;s account here, then invite them as a client below.
          They&rsquo;ll see only the accounts in this team. An account can live
          in more than one team, so adding it here doesn&rsquo;t remove it from
          Guestlist Social.
        </p>
        <TeamAccountsManager teamId={teamId} accounts={accounts} />
      </section>

      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>Invite someone</h3>
        <p style={sectionSubStyle}>
          Invite a client to give them a view of just this team&rsquo;s content —
          they can view and approve, nothing else. Collaborator roles
          (member/admin) that can post without ever seeing stored passwords are a
          Pro feature arriving with team workspaces.
        </p>
        <InviteToTeamForm teamId={teamId} plan={plan} />
      </section>

      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>People ({members.length})</h3>
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>No one yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => (
              <TeamMemberRow key={m.userId} teamId={teamId} member={m} />
            ))}
          </div>
        )}
      </section>
    </div>
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

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
import { CreateAccountForm } from "./CreateAccountForm";

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

  // Which platforms each in-team account has connected (for the connect UI).
  const connectedByClient = new Map<number, Set<string>>();
  if (canManage && accountsInTeam.length > 0) {
    const { data: connectedRows } = await admin
      .from("connected_meta_accounts")
      .select("client_id, platform")
      .in("client_id", accountsInTeam.map((a) => a.clientId));
    for (const r of connectedRows ?? []) {
      const set = connectedByClient.get(Number(r.client_id)) ?? new Set<string>();
      set.add(r.platform as string);
      connectedByClient.set(Number(r.client_id), set);
    }
  }
  // Where Meta should send the user back after the OAuth round-trip.
  const connectReturnTo = `${base}/teams/${teamId}`;

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
              <h3 style={sectionTitleStyle}>Add &amp; connect an account</h3>
              <p style={sectionSubStyle}>
                Create a brand-new account in this team, then connect its
                Instagram / Facebook. Connecting opens Meta&rsquo;s secure login —
                the tokens are stored server-side and no one on the team ever sees
                them.
              </p>
              <CreateAccountForm teamId={teamId} />

              {accountsInTeam.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                  {accountsInTeam.map((a) => {
                    const connected = connectedByClient.get(a.clientId) ?? new Set<string>();
                    const ig = connected.has("instagram");
                    const fb = connected.has("facebook");
                    const anyConnected = ig || fb;
                    const href = `/api/meta/connect?clientId=${a.clientId}&returnTo=${encodeURIComponent(connectReturnTo)}`;
                    return (
                      <div key={a.clientId} style={connectRowStyle}>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 140 }}>
                          {a.name}
                        </span>
                        <span style={{ display: "flex", gap: 6 }}>
                          <StatusPill on={ig} label="Instagram" />
                          <StatusPill on={fb} label="Facebook" />
                        </span>
                        <a href={href} style={connectBtnStyle}>
                          {anyConnected ? "Reconnect" : "Connect"}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Accounts in this team</h3>
              <p style={sectionSubStyle}>
                Move an existing account into this team, or remove one. An
                account can live in more than one team, so adding it here
                doesn&rsquo;t remove it elsewhere.
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
              <InviteToTeamForm
                teamId={teamId}
                teamName={team.name as string}
                plan={plan}
                accountNames={accountsInTeam.map((a) => a.name)}
              />
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

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 999,
        background: on ? "#e4f1ea" : "#f4f4f5",
        color: on ? "#2f7d5b" : "#a1a1aa",
        border: `1px solid ${on ? "#bfe0cd" : "#e4e4e7"}`,
        whiteSpace: "nowrap",
      }}
    >
      {on ? "✓ " : ""}
      {label}
    </span>
  );
}

const connectRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fff",
  flexWrap: "wrap",
};

const connectBtnStyle: React.CSSProperties = {
  background: "#18181b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  padding: "7px 12px",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

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

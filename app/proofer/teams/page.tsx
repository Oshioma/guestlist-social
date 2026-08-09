import Link from "next/link";
import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../base";
import { CreateTeamForm } from "@/app/admin-panel/settings/teams/CreateTeamForm";
import { AddAccountWizard } from "./AddAccountWizard";
import { planConfig, type Plan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

type AccountLite = { id: number; name: string; ig: boolean; fb: boolean };
type TeamRow = {
  id: string;
  name: string;
  plan: Plan;
  memberCount: number;
  accounts: AccountLite[];
};

export default async function ProoferTeamsPage() {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");

  const admin = createAdminClient();
  const { base } = await getProoferBase();
  const isStaff = access.kind === "staff";

  // This is "your teams" for EVERYONE, including the super admin — only the
  // teams you actually belong to. The platform-wide view of every user's teams
  // lives on the Super admin → Users tab, not here.
  const { data: myMemberships } = await admin
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", access.userId);
  const myRoleByTeam = new Map(
    (myMemberships ?? []).map((r) => [r.team_id as string, r.role as string])
  );
  const visibleTeamIds: string[] = Array.from(myRoleByTeam.keys());

  let rows: TeamRow[] = [];
  if (visibleTeamIds.length > 0) {
    const teamsQuery = admin
      .from("teams")
      .select("id, name, plan")
      .in("id", visibleTeamIds)
      .order("name", { ascending: true });

    const [{ data: teams, error }, { data: memberRows }, { data: accountRows }] =
      await Promise.all([
        teamsQuery,
        admin.from("team_members").select("team_id"),
        admin.from("team_accounts").select("team_id, client_id"),
      ]);
    if (error) throw new Error(`Could not load teams: ${error.message}`);

    const teamIdSet = new Set((teams ?? []).map((t) => t.id as string));

    // Member counts per team.
    const memberCounts = new Map<string, number>();
    for (const r of memberRows ?? [])
      memberCounts.set(r.team_id, (memberCounts.get(r.team_id) ?? 0) + 1);

    // Accounts per (visible) team, plus the set of all client ids we need
    // connection status for.
    const clientIdsByTeam = new Map<string, number[]>();
    const allClientIds = new Set<number>();
    for (const r of accountRows ?? []) {
      const tid = r.team_id as string;
      if (!teamIdSet.has(tid)) continue;
      const cid = Number(r.client_id);
      const list = clientIdsByTeam.get(tid) ?? [];
      list.push(cid);
      clientIdsByTeam.set(tid, list);
      allClientIds.add(cid);
    }

    // Names + connection status for those accounts.
    const nameById = new Map<number, string>();
    const igByClient = new Set<number>();
    const fbByClient = new Set<number>();
    if (allClientIds.size > 0) {
      const ids = Array.from(allClientIds);
      const [{ data: clientRows }, { data: connectedRows }] = await Promise.all([
        admin.from("clients").select("id, name, archived").in("id", ids),
        admin
          .from("connected_meta_accounts")
          .select("client_id, platform")
          .in("client_id", ids),
      ]);
      for (const c of clientRows ?? []) {
        if (c.archived) continue;
        nameById.set(Number(c.id), (c.name as string) ?? `Account ${c.id}`);
      }
      for (const r of connectedRows ?? []) {
        const cid = Number(r.client_id);
        if (r.platform === "instagram") igByClient.add(cid);
        if (r.platform === "facebook") fbByClient.add(cid);
      }
    }

    rows = (teams ?? []).map((t) => {
      const tid = t.id as string;
      const accounts: AccountLite[] = (clientIdsByTeam.get(tid) ?? [])
        .filter((cid) => nameById.has(cid)) // drop archived / missing
        .map((cid) => ({
          id: cid,
          name: nameById.get(cid)!,
          ig: igByClient.has(cid),
          fb: fbByClient.has(cid),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: tid,
        name: t.name as string,
        plan: (t.plan as Plan) ?? "free",
        memberCount: memberCounts.get(tid) ?? 0,
        accounts,
      };
    });
  }

  // Teams the viewer may add an account to (staff → all visible; otherwise the
  // ones they own or admin). Drives the wizard's team picker.
  const manageableTeams = rows
    .filter(
      (t) =>
        isStaff ||
        myRoleByTeam.get(t.id) === "owner" ||
        myRoleByTeam.get(t.id) === "admin"
    )
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
      <div style={{ maxWidth: 780, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <Link href={base || "/"} style={backLinkStyle}>
            &larr; Board
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Teams &amp; accounts</h2>
        </div>

        {/* Plain-language explainer */}
        <section style={{ ...cardStyle, background: "#fbfbfa" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>
            How this works
          </h3>
          <ul style={explainerList}>
            <li>
              <strong>Account</strong> = one Instagram/Facebook you post to (a
              brand or business).
            </li>
            <li>
              <strong>Team</strong> = a folder that holds accounts and the people
              allowed to work on them.
            </li>
            <li>
              <strong>Connect</strong> = link the account to Meta. This is the
              step that lets posts actually go live. Until it&rsquo;s connected
              you&rsquo;ll see <Badge kind="off">Not connected</Badge>.
            </li>
          </ul>
        </section>

        {/* Add an account */}
        <section style={cardStyle}>
          <h3 style={sectionTitleStyle}>Add an account</h3>
          <p style={sectionSubStyle}>
            Create a new Instagram/Facebook account, choose which team it belongs
            to, then connect it — in three quick steps.
          </p>
          {manageableTeams.length > 0 ? (
            <AddAccountWizard teams={manageableTeams} base={base} />
          ) : (
            <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
              Create a team below first — every account lives inside a team.
            </p>
          )}
        </section>

        {/* The map: each team and the accounts inside it */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>
            Your teams ({rows.length})
          </h3>
          <p style={sectionSubStyle}>
            The teams you belong to and the accounts inside them. A badge shows
            whether each account is connected to Instagram and Facebook.
          </p>
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
              No teams yet. Create one below.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {rows.map((t) => {
                const canManage =
                  isStaff ||
                  myRoleByTeam.get(t.id) === "owner" ||
                  myRoleByTeam.get(t.id) === "admin";
                const connectHref = (clientId: number) =>
                  `/api/meta/connect?clientId=${clientId}&returnTo=${encodeURIComponent(
                    `${base}/teams`
                  )}`;
                return (
                <div key={t.id} style={teamCard}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</span>
                    {myRoleByTeam.get(t.id) && <RoleBadge role={myRoleByTeam.get(t.id)!} />}
                    <PlanBadge plan={t.plan} />
                    <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                      {t.memberCount} {t.memberCount === 1 ? "person" : "people"}
                    </span>
                    <Link
                      href={`${base}/teams/${t.id}`}
                      style={{ marginLeft: "auto", fontSize: 13, color: "#3f3f46", fontWeight: 600, textDecoration: "none" }}
                    >
                      Manage &rarr;
                    </Link>
                  </div>

                  {t.accounts.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#a1a1aa", margin: "10px 0 0" }}>
                      No accounts in this team yet.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {t.accounts.map((a) => {
                        const connected = a.ig || a.fb;
                        return (
                        <div key={a.id} style={accountRow}>
                          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 120 }}>
                            {a.name}
                          </span>
                          <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {connected ? (
                              <>
                                {a.ig && <Badge kind="on">✓ Instagram</Badge>}
                                {a.fb && <Badge kind="on">✓ Facebook</Badge>}
                                {canManage && (
                                  <a href={connectHref(a.id)} style={reconnectLink}>
                                    Reconnect
                                  </a>
                                )}
                              </>
                            ) : (
                              <>
                                <Badge kind="off">⚠ Not connected</Badge>
                                {canManage && (
                                  <a href={connectHref(a.id)} style={connectNowLink}>
                                    Connect now →
                                  </a>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Create a team */}
        <section style={cardStyle}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Create a team</h3>
          <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#71717a" }}>
            A team is a folder for a set of accounts and the people who work on
            them. You&rsquo;ll be its owner. Add accounts to it above.
          </p>
          <CreateTeamForm />
        </section>
      </div>
    </main>
  );
}

function Badge({ kind, children }: { kind: "on" | "off"; children: React.ReactNode }) {
  const on = kind === "on";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        background: on ? "#e4f1ea" : "#fef3c7",
        color: on ? "#2f7d5b" : "#92600a",
        border: `1px solid ${on ? "#bfe0cd" : "#fde68a"}`,
      }}
    >
      {children}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: "#eef2ff",
        border: "1px solid #dbe2fb",
        color: "#4451b8",
      }}
    >
      {role === "owner" ? "You own this" : `You: ${role}`}
    </span>
  );
}

function PlanBadge({ plan }: { plan: Plan }) {
  const palette: Record<Plan, { bg: string; border: string; fg: string }> = {
    free: { bg: "#f4f4f5", border: "#e4e4e7", fg: "#71717a" },
    pro: { bg: "#faf0f4", border: "#eccdd9", fg: "#9d2b5b" },
    agency: { bg: "#eef0fb", border: "#cdd3f2", fg: "#3b3f9d" },
  };
  const c = palette[plan] ?? palette.free;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.fg,
      }}
    >
      {planConfig(plan).name}
    </span>
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

const teamCard: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const connectNowLink: React.CSSProperties = {
  background: "#18181b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  padding: "6px 11px",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const reconnectLink: React.CSSProperties = {
  color: "#71717a",
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const accountRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  border: "1px solid #f0f0f2",
  borderRadius: 9,
  background: "#fafafa",
  flexWrap: "wrap",
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
  maxWidth: 640,
  lineHeight: 1.5,
};

const explainerList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13.5,
  color: "#3f3f46",
  lineHeight: 1.55,
};

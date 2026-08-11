import Link from "next/link";
import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../base";
import { CreateTeamForm } from "@/app/admin-panel/settings/teams/CreateTeamForm";
import { AddAccountInline } from "./AddAccountInline";
import { DisconnectButton } from "./[teamId]/DisconnectButton";
import { TeamMembersInline } from "./TeamMembersInline";
import { planConfig, type Plan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

// Connection health from a stored Meta token's expiry. Meta tokens last ~60
// days; surface amber a week or so out and red once lapsed so an operator
// knows to reconnect before publishing silently breaks.
type Health = "ok" | "soon" | "expired";
function tokenHealth(expiresAt: string | null | undefined): Health {
  if (!expiresAt) return "ok";
  const t = new Date(expiresAt).getTime();
  const now = Date.now();
  if (Number.isNaN(t)) return "ok";
  if (t <= now) return "expired";
  if (t <= now + 10 * 24 * 60 * 60 * 1000) return "soon";
  return "ok";
}

type Conn = { handle: string; health: Health } | null;
type AccountLite = { id: number; name: string; ig: Conn; fb: Conn };
type Member = { userId: string; name: string; role: string; isOwner: boolean };
type TeamRow = {
  id: string;
  name: string;
  plan: Plan;
  memberCount: number;
  accounts: AccountLite[];
  members: Member[];
};

export default async function ProoferTeamsPage() {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");

  const admin = createAdminClient();
  const { base } = await getProoferBase();
  const isStaff = access.kind === "staff";
  const igConfigured = !!process.env.INSTAGRAM_APP_ID;

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
      .select("id, name, plan, owner_user_id")
      .in("id", visibleTeamIds)
      .order("name", { ascending: true });

    const [{ data: teams, error }, { data: memberRows }, { data: accountRows }, usersResp] =
      await Promise.all([
        teamsQuery,
        admin
          .from("team_members")
          .select("team_id, user_id, role")
          .in("team_id", visibleTeamIds),
        admin.from("team_accounts").select("team_id, client_id"),
        admin.auth.admin.listUsers({ perPage: 200 }),
      ]);
    if (error) throw new Error(`Could not load teams: ${error.message}`);

    const teamIdSet = new Set((teams ?? []).map((t) => t.id as string));
    const ownerByTeam = new Map<string, string>();
    for (const t of teams ?? [])
      ownerByTeam.set(t.id as string, (t.owner_user_id as string) ?? "");

    // Resolve member display names.
    const userById = new Map<string, string>();
    for (const u of usersResp?.data?.users ?? []) {
      const fullName = (u.user_metadata as { full_name?: string } | null)?.full_name ?? null;
      userById.set(u.id, fullName || u.email || "(unknown)");
    }

    // Members per team (+ counts), owner first then by name.
    const membersByTeam = new Map<string, Member[]>();
    const memberCounts = new Map<string, number>();
    for (const r of memberRows ?? []) {
      const tid = r.team_id as string;
      const uid = r.user_id as string;
      memberCounts.set(tid, (memberCounts.get(tid) ?? 0) + 1);
      const list = membersByTeam.get(tid) ?? [];
      list.push({
        userId: uid,
        name: userById.get(uid) ?? "(unknown)",
        role: (r.role as string) ?? "member",
        isOwner: uid === ownerByTeam.get(tid),
      });
      membersByTeam.set(tid, list);
    }
    for (const [, list] of membersByTeam) {
      list.sort((a, b) =>
        a.isOwner ? -1 : b.isOwner ? 1 : a.name.localeCompare(b.name)
      );
    }

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

    // Names + connection status (with handle + token health) for those accounts.
    const nameById = new Map<number, string>();
    const igByClient = new Map<number, Conn>();
    const fbByClient = new Map<number, Conn>();
    if (allClientIds.size > 0) {
      const ids = Array.from(allClientIds);
      const [{ data: clientRows }, { data: connectedRows }] = await Promise.all([
        admin.from("clients").select("id, name, archived").in("id", ids),
        admin
          .from("connected_meta_accounts")
          .select("client_id, platform, account_name, token_expires_at")
          .in("client_id", ids),
      ]);
      for (const c of clientRows ?? []) {
        if (c.archived) continue;
        nameById.set(Number(c.id), (c.name as string) ?? `Account ${c.id}`);
      }
      for (const r of connectedRows ?? []) {
        const cid = Number(r.client_id);
        const conn: Conn = {
          handle: (r.account_name as string | null) ?? "",
          health: tokenHealth(r.token_expires_at as string | null),
        };
        if (r.platform === "instagram") igByClient.set(cid, conn);
        if (r.platform === "facebook") fbByClient.set(cid, conn);
      }
    }

    rows = (teams ?? []).map((t) => {
      const tid = t.id as string;
      const accounts: AccountLite[] = (clientIdsByTeam.get(tid) ?? [])
        .filter((cid) => nameById.has(cid)) // drop archived / missing
        .map((cid) => ({
          id: cid,
          name: nameById.get(cid)!,
          ig: igByClient.get(cid) ?? null,
          fb: fbByClient.get(cid) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: tid,
        name: t.name as string,
        plan: (t.plan as Plan) ?? "free",
        memberCount: memberCounts.get(tid) ?? 0,
        accounts,
        members: membersByTeam.get(tid) ?? [],
      };
    });
  }

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24, background: "#f3f3f5" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <Link href={base || "/"} style={backLinkStyle}>
            &larr; Board
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Teams &amp; accounts</h2>
        </div>

        {/* The map: each team and the accounts inside it */}
        <section style={{ background: "transparent" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {rows.map((t) => {
                const canManage =
                  isStaff ||
                  myRoleByTeam.get(t.id) === "owner" ||
                  myRoleByTeam.get(t.id) === "admin";
                const returnTo = encodeURIComponent(`${base}/teams`);
                return (
                <div key={t.id} style={teamCard}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</span>
                    <PlanBadge plan={t.plan} />
                    <Link
                      href={`${base}/teams/${t.id}`}
                      style={{ marginLeft: "auto", fontSize: 13, color: "#3f3f46", fontWeight: 600, textDecoration: "none" }}
                    >
                      Settings &rarr;
                    </Link>
                  </div>

                  <div style={teamBody}>
                    <div style={colAccounts}>
                      <h4 style={colHead}>Accounts</h4>
                      {t.accounts.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
                          No accounts in this team yet.
                        </p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <div style={acctHeadRow}>
                            <span>Facebook</span>
                            <span>Instagram</span>
                          </div>
                          {t.accounts.map((a) => (
                            <div key={a.id} style={acctBlock}>
                              <div style={acctNameStyle}>{a.name}</div>
                              <div style={acctConns}>
                                <ConnCell
                                  platform="facebook"
                                  conn={a.fb}
                                  teamId={t.id}
                                  clientId={a.id}
                                  canManage={canManage}
                                  returnTo={returnTo}
                                  igConfigured={igConfigured}
                                />
                                <ConnCell
                                  platform="instagram"
                                  conn={a.ig}
                                  teamId={t.id}
                                  clientId={a.id}
                                  canManage={canManage}
                                  returnTo={returnTo}
                                  igConfigured={igConfigured}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {canManage && <AddAccountInline teamId={t.id} />}
                    </div>
                    <div style={colMembers}>
                      <h4 style={colHead}>Members</h4>
                      <TeamMembersInline teamId={t.id} members={t.members} canManage={canManage} />
                    </div>
                  </div>
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
      {role === "owner" ? "You own this" : `You: ${role === "member" ? "creator" : role}`}
    </span>
  );
}

function ConnCell({
  platform,
  conn,
  teamId,
  clientId,
  canManage,
  returnTo,
  igConfigured,
}: {
  platform: "facebook" | "instagram";
  conn: Conn;
  teamId: string;
  clientId: number;
  canManage: boolean;
  returnTo: string;
  igConfigured: boolean;
}) {
  const isFb = platform === "facebook";
  const label = isFb ? "Facebook" : "Instagram";
  const handleColor = isFb ? "#1877F2" : "#c1358a";

  if (conn) {
    const dot =
      conn.health === "expired" ? "#dc2626" : conn.health === "soon" ? "#d97706" : "#16a34a";
    const tag =
      conn.health === "expired" ? "reconnect" : conn.health === "soon" ? "expiring" : "";
    return (
      <div style={connCellStyle}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: handleColor }}>
          {conn.handle ? `@${conn.handle}` : label}
        </span>
        {tag && (
          <span style={{ fontSize: 11, fontWeight: 600, color: conn.health === "expired" ? "#dc2626" : "#b45309" }}>
            · {tag}
          </span>
        )}
        {canManage && (
          <span style={{ marginLeft: "auto" }}>
            <DisconnectButton
              teamId={teamId}
              clientId={clientId}
              platform={platform}
              label={label}
              iconOnly
            />
          </span>
        )}
      </div>
    );
  }

  // Instagram connects via its own login when configured; otherwise it comes in
  // through the Facebook Page flow (which brings the linked Instagram).
  const href =
    isFb || !igConfigured
      ? `/api/meta/connect?clientId=${clientId}&returnTo=${returnTo}`
      : `/api/instagram/connect?clientId=${clientId}&returnTo=${returnTo}`;
  return (
    <div style={connCellStyle}>
      <span style={{ fontSize: 13, color: "#a1a1aa" }}>— not connected</span>
      {canManage && (
        <a href={href} style={connectMini}>
          Connect
        </a>
      )}
    </div>
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

const teamBody: React.CSSProperties = {
  display: "flex",
  gap: 20,
  marginTop: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const colAccounts: React.CSSProperties = { flex: "2 1 300px", minWidth: 0 };
const colMembers: React.CSSProperties = { flex: "1 1 240px", minWidth: 0 };

const colHead: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#a1a1aa",
  fontWeight: 700,
  margin: "0 0 8px",
};

const acctHeadRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: "0 0 6px",
  fontSize: 11,
  fontWeight: 700,
  color: "#a1a1aa",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const acctBlock: React.CSSProperties = {
  padding: "9px 0",
  borderTop: "1px dashed #ececef",
};

const acctNameStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  marginBottom: 5,
};

const acctConns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  alignItems: "center",
};

const connCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  minHeight: 26,
  flexWrap: "wrap",
};

const connectMini: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 12,
  fontWeight: 700,
  color: "#3f3f46",
  background: "#f4f4f5",
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  padding: "3px 9px",
  textDecoration: "none",
  whiteSpace: "nowrap",
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

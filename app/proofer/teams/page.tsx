import Link from "next/link";
import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../base";
import { CreateTeamForm } from "@/app/admin-panel/settings/teams/CreateTeamForm";
import { AddAccountInline } from "./AddAccountInline";
import { AccountRemoveButton } from "./AccountRemoveButton";
import { DisconnectButton } from "./[teamId]/DisconnectButton";
import { TeamHeaderActions } from "./TeamHeaderActions";
import { TeamMembersInline } from "./TeamMembersInline";
import { ConnectHelp } from "./ConnectHelp";
import { BillingPanel, type BillingInfo } from "@/app/admin-panel/settings/teams/[teamId]/BillingPanel";
import { countTeamSocialAccounts } from "@/lib/billing/team-billing";
import { stripeConfigured } from "@/lib/stripe";
import { planConfig, maxOwnedTeams, type Plan } from "@/lib/billing/plans";

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
  isPersonal: boolean;
};

export default async function ProoferTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");

  const { billing: billingParam } = await searchParams;

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

  // Plan gate for "Create a team": Free includes exactly one team (your own);
  // more needs Pro/Agency. The allowance is the best plan among teams you own.
  let canCreateTeam = true;

  // Owner-level billing shown at the foot of the page, anchored on the "best"
  // team you own (highest plan, personal on a tie). Billing lives here now that
  // the per-team detail page is retired.
  let billing: BillingInfo | null = null;
  let billingTeamId: string | null = null;

  let rows: TeamRow[] = [];
  if (visibleTeamIds.length > 0) {
    // `is_personal` is a newer column (see 20260814_personal_team_flag). Read it
    // when present, and fall back to the old "earliest owned team" guess if the
    // migration hasn't run yet, so the page never hard-fails on a missing column.
    // The billing columns are older and always safe to select — the owner
    // billing card at the top needs them.
    type TeamQueryRow = {
      id: string;
      name: string;
      plan: Plan;
      owner_user_id: string;
      created_at: string;
      is_personal?: boolean;
      stripe_customer_id?: string | null;
      subscription_status?: string | null;
      trial_ends_at?: string | null;
      current_period_end?: string | null;
    };
    const BILLING_COLS =
      "stripe_customer_id, subscription_status, trial_ends_at, current_period_end";
    let teams: TeamQueryRow[] | null = null;
    let teamsError: { message: string } | null = null;
    let hasPersonalFlag = true;
    {
      const withFlag = await admin
        .from("teams")
        .select(`id, name, plan, owner_user_id, created_at, is_personal, ${BILLING_COLS}`)
        .in("id", visibleTeamIds)
        .order("name", { ascending: true });
      if (withFlag.error) {
        hasPersonalFlag = false;
        const without = await admin
          .from("teams")
          .select(`id, name, plan, owner_user_id, created_at, ${BILLING_COLS}`)
          .in("id", visibleTeamIds)
          .order("name", { ascending: true });
        teams = (without.data as TeamQueryRow[] | null) ?? null;
        teamsError = without.error;
      } else {
        teams = (withFlag.data as TeamQueryRow[] | null) ?? null;
      }
    }

    const [{ data: memberRows }, { data: accountRows }, usersResp] =
      await Promise.all([
        admin
          .from("team_members")
          .select("team_id, user_id, role")
          .in("team_id", visibleTeamIds),
        admin.from("team_accounts").select("team_id, client_id"),
        admin.auth.admin.listUsers({ perPage: 200 }),
      ]);
    if (teamsError) throw new Error(`Could not load teams: ${teamsError.message}`);

    const teamIdSet = new Set((teams ?? []).map((t) => t.id as string));
    const ownerByTeam = new Map<string, string>();
    // Personal team: prefer the explicit is_personal flag. Until the migration
    // runs we fall back to the viewer's earliest-created owned team. It sorts to
    // the top of the list either way.
    let personalTeamId: string | null = null;
    let earliestOwned = Infinity;
    for (const t of teams ?? []) {
      ownerByTeam.set(t.id as string, (t.owner_user_id as string) ?? "");
      if (hasPersonalFlag) {
        // Only YOUR own personal team counts — you may be a member of someone
        // else's personal team, which shouldn't steal the tag / top slot.
        if (
          (t as { is_personal?: boolean }).is_personal &&
          (t.owner_user_id as string) === access.userId
        ) {
          personalTeamId = t.id as string;
        }
      } else if ((t.owner_user_id as string) === access.userId) {
        const c = new Date((t.created_at as string) ?? 0).getTime();
        if (!Number.isNaN(c) && c < earliestOwned) {
          earliestOwned = c;
          personalTeamId = t.id as string;
        }
      }
    }

    // Work out the viewer's team allowance from the teams they OWN (being
    // invited to a team doesn't count). Free = 1 team; paid = unlimited.
    const ownedTeams = (teams ?? []).filter(
      (t) => (t.owner_user_id as string) === access.userId
    );
    const rank: Record<string, number> = { free: 0, pro: 1, agency: 2 };
    const bestOwnedPlan = ownedTeams.reduce<Plan>((acc, t) => {
      const p = ((t.plan as Plan) ?? "free");
      return (rank[p] ?? 0) > (rank[acc] ?? 0) ? p : acc;
    }, "free");
    const cap = maxOwnedTeams(bestOwnedPlan);
    canCreateTeam = cap === null || ownedTeams.length < cap;

    // Billing anchor = the team you own with the highest plan; on a tie prefer
    // your personal team, then the earliest created. This is "your plan".
    const anchor = [...ownedTeams].sort((a, b) => {
      const pr = (rank[(b.plan as Plan) ?? "free"] ?? 0) - (rank[(a.plan as Plan) ?? "free"] ?? 0);
      if (pr !== 0) return pr;
      const aPersonal = a.id === personalTeamId ? 0 : 1;
      const bPersonal = b.id === personalTeamId ? 0 : 1;
      if (aPersonal !== bPersonal) return aPersonal - bPersonal;
      return new Date((a.created_at as string) ?? 0).getTime() -
        new Date((b.created_at as string) ?? 0).getTime();
    })[0];
    if (anchor) {
      billingTeamId = anchor.id as string;
      const used = await countTeamSocialAccounts(admin, anchor.id as string);
      billing = {
        plan: (anchor.plan as Plan) ?? "free",
        used,
        subscriptionStatus: (anchor.subscription_status as string | null) ?? null,
        trialEndsAt: (anchor.trial_ends_at as string | null) ?? null,
        currentPeriodEnd: (anchor.current_period_end as string | null) ?? null,
        hasCustomer: Boolean(anchor.stripe_customer_id),
        canManageBilling: true, // you own the anchor team
        isStaff,
        stripeConfigured: stripeConfigured(),
      };
    }

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
        isPersonal: tid === personalTeamId,
      };
    });
    // Personal team first, then the rest alphabetically.
    rows.sort((a, b) =>
      a.isPersonal ? -1 : b.isPersonal ? 1 : a.name.localeCompare(b.name)
    );
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

        <ConnectHelp igConfigured={igConfigured} />

        {billingParam === "success" && (
          <div style={bannerOk}>
            Subscription started — your new plan is active. Your {`30`}-day free
            trial has begun.
          </div>
        )}
        {billingParam === "cancelled" && (
          <div style={bannerNeutral}>Checkout cancelled — your plan is unchanged.</div>
        )}

        {/* The map: each team and the accounts inside it */}
        <section style={{ background: "transparent" }}>
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
                    <TeamHeaderActions teamId={t.id} name={t.name} canManage={canManage} />
                    {t.isPersonal && <span style={personalTag}>Personal</span>}
                    <PlanBadge plan={t.plan} />
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
                            <span aria-hidden="true" />
                          </div>
                          {t.accounts.map((a) => (
                            // No company name: a connected account is identified
                            // by its handle; an unconnected one just shows Connect
                            // buttons, and the Meta picker names the company when
                            // you connect. Facebook + Instagram for one account
                            // stay grouped in the same row.
                            <div key={a.id} style={acctBlock}>
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
                                {canManage ? (
                                  <AccountRemoveButton teamId={t.id} clientId={a.id} name={a.name} />
                                ) : (
                                  <span aria-hidden="true" />
                                )}
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
          {canCreateTeam ? (
            <>
              <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#71717a" }}>
                A team is a folder for a set of accounts and the people who work
                on them. You&rsquo;ll be its owner. Add accounts to it above.
              </p>
              <CreateTeamForm />
            </>
          ) : (
            <>
              <p style={{ margin: "4px 0 14px", fontSize: 13, color: "#71717a" }}>
                The Free plan includes one team — this one. Upgrade to Pro to
                create more teams for your clients and projects. Teams
                you&rsquo;re invited to don&rsquo;t count.
              </p>
              <Link href={billing ? "#plan-billing" : "/pricing"} style={upgradeCta}>
                Upgrade to Pro
              </Link>
            </>
          )}
        </section>

        {/* Owner-level plan & billing, at the foot of the page */}
        {billing && billingTeamId && (
          <section id="plan-billing" style={cardStyle}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>
              Plan &amp; billing
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#71717a" }}>
              Your plan covers the teams you own. Every paid plan starts with a
              30-day free trial.
            </p>
            <BillingPanel teamId={billingTeamId} info={billing} />
          </section>
        )}
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

  // Guard: don't fall the Instagram button back to Facebook login when
  // Instagram Business Login isn't wired up. That fallback dead-ends
  // Instagram-only accounts (they have no Facebook to log into) — which is
  // exactly where people got stuck. Show a tip instead. An account that DOES
  // have a Facebook Page still connects its Instagram via the Facebook button
  // (the linked Instagram comes with it).
  if (!isFb && !igConfigured) {
    return (
      <div style={connCellStyle}>
        <span style={{ fontSize: 13, color: "#a1a1aa" }}>— not connected</span>
        {canManage && (
          <span
            style={connectDisabled}
            title="Instagram-only login isn't set up on this deployment yet (INSTAGRAM_APP_ID / SECRET / OAUTH_REDIRECT_URI). If this account has a Facebook Page, use Connect Facebook — its linked Instagram comes with it."
          >
            Setup needed
          </span>
        )}
      </div>
    );
  }

  // Facebook uses Facebook login; Instagram uses its own login (Instagram
  // Business Login) when configured.
  const href = isFb
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

const upgradeCta: React.CSSProperties = {
  display: "inline-block",
  background: "#4f46e5",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 8,
  padding: "9px 16px",
  textDecoration: "none",
};

const bannerOk: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 13,
};

const bannerNeutral: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  color: "#4b5563",
  fontSize: 13,
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

const personalTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  border: "1px solid #dbe2fb",
  color: "#4451b8",
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
  gridTemplateColumns: "1fr 1fr 24px",
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

const acctConns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 24px",
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

const connectDisabled: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 12,
  fontWeight: 700,
  color: "#a1a1aa",
  background: "#fafafa",
  border: "1px dashed #e4e4e7",
  borderRadius: 7,
  padding: "3px 9px",
  whiteSpace: "nowrap",
  cursor: "help",
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

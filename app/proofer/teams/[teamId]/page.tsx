import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../../base";
import { TeamSettingsForm } from "@/app/admin-panel/settings/teams/[teamId]/TeamSettingsForm";
import { InviteToTeamForm } from "@/app/admin-panel/settings/teams/[teamId]/InviteToTeamForm";
import { TeamMemberRow } from "@/app/admin-panel/settings/teams/[teamId]/TeamMemberRow";
import { TeamAccountsManager } from "@/app/admin-panel/settings/teams/[teamId]/TeamAccountsManager";
import { BillingPanel } from "@/app/admin-panel/settings/teams/[teamId]/BillingPanel";
import type { Role, TeamMember, AccountOption } from "@/app/admin-panel/settings/teams/[teamId]/types";
import { planConfig, type Plan } from "@/lib/billing/plans";
import { countTeamSocialAccounts } from "@/lib/billing/team-billing";
import { stripeConfigured } from "@/lib/stripe";
import { CreateAccountForm } from "./CreateAccountForm";
import { DisconnectButton } from "./DisconnectButton";
import { TeamDangerZone } from "./TeamDangerZone";

export const dynamic = "force-dynamic";

export default async function ProoferTeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{
    connect_error?: string;
    meta_error?: string;
    billing?: string;
  }>;
}) {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");
  const { teamId } = await params;
  const {
    connect_error: connectErrorParam,
    meta_error: metaError,
    billing,
  } = await searchParams;
  // The Meta/Instagram OAuth callbacks report failures via `meta_error`; older
  // links use `connect_error`. Accept either so a failed connect (e.g. "no
  // Facebook Page") actually shows here instead of vanishing.
  const connectError = connectErrorParam || metaError;

  const admin = createAdminClient();
  const { base } = await getProoferBase();

  const { data: team, error: teamErr } = await admin
    .from("teams")
    .select(
      "id, name, plan, owner_user_id, stripe_customer_id, subscription_status, trial_ends_at, current_period_end"
    )
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

  const plan = (team.plan as Plan) ?? "free";
  const accountsInTeam = accounts.filter((a) => a.inTeam);

  // Billing context for the panel: current usage + subscription state. Only the
  // owner (or staff) may act on billing; everyone else sees it read-only.
  const isOwner = myMembership?.role === "owner";
  const usedSocialAccounts = await countTeamSocialAccounts(admin, teamId);

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
  // Instagram Business Login (no Facebook Page) is a separate app config, so
  // only surface its button when it's actually set up.
  const isInstagramLoginConfigured = !!process.env.INSTAGRAM_APP_ID;

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Link href={`${base}/teams`} style={backLinkStyle}>
            &larr; Teams
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{team.name as string}</h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
            {planConfig(plan).name} team · {accountsInTeam.length} account(s) ·{" "}
            {members.length} {members.length === 1 ? "person" : "people"}
            {!canManage && " · you have view access"}
          </p>
        </div>

        {connectError && (
          <div style={bannerStyle("#fef2f2", "#fecaca", "#b91c1c")}>{connectError}</div>
        )}
        {billing === "success" && (
          <div style={bannerStyle("#ecfdf5", "#bbf7d0", "#166534")}>
            Subscription started — your new plan is active. Your 30-day free trial
            has begun.
          </div>
        )}
        {billing === "cancelled" && (
          <div style={bannerStyle("#f9fafb", "#e5e7eb", "#4b5563")}>
            Checkout cancelled — your plan is unchanged.
          </div>
        )}

        {canManage ? (
          <>
            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Team settings</h3>
              <TeamSettingsForm teamId={teamId} name={team.name as string} showDelete={false} />
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Plan &amp; billing</h3>
              <p style={sectionSubStyle}>
                Every paid plan starts with a 30-day free trial. Upgrade to lift
                the social-account limit and unlock team collaborators.
              </p>
              <BillingPanel
                teamId={teamId}
                info={{
                  plan,
                  used: usedSocialAccounts,
                  subscriptionStatus: (team.subscription_status as string | null) ?? null,
                  trialEndsAt: (team.trial_ends_at as string | null) ?? null,
                  currentPeriodEnd: (team.current_period_end as string | null) ?? null,
                  hasCustomer: Boolean(team.stripe_customer_id),
                  canManageBilling: isStaff || isOwner,
                  isStaff,
                  stripeConfigured: stripeConfigured(),
                }}
              />
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Add &amp; connect an account</h3>
              <p style={sectionSubStyle}>
                Create a brand-new account in this team, then connect its
                Instagram / Facebook. Connecting opens Meta&rsquo;s secure login —
                the tokens are stored server-side and no one on the team ever sees
                them.
              </p>
              {isInstagramLoginConfigured && (
                <p style={{ ...sectionSubStyle, marginTop: -4 }}>
                  No Facebook Page? Use <strong>Instagram only</strong> to connect
                  an Instagram professional account (Business or Creator) on its
                  own — no Facebook account required.
                </p>
              )}
              <CreateAccountForm teamId={teamId} />

              {accountsInTeam.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                  {accountsInTeam.map((a) => {
                    const connected = connectedByClient.get(a.clientId) ?? new Set<string>();
                    const ig = connected.has("instagram");
                    const fb = connected.has("facebook");
                    const href = `/api/meta/connect?clientId=${a.clientId}&returnTo=${encodeURIComponent(connectReturnTo)}`;
                    const igHref = `/api/instagram/connect?clientId=${a.clientId}&returnTo=${encodeURIComponent(connectReturnTo)}`;
                    return (
                      <div key={a.clientId} style={connectRowStyle}>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 140 }}>
                          {a.name}
                        </span>
                        <span style={{ display: "flex", gap: 6 }}>
                          <StatusPill on={ig} label="Instagram" />
                          <StatusPill on={fb} label="Facebook" />
                        </span>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <a
                            href={href}
                            style={connectBtnFacebookStyle}
                            title="Log in with Facebook (needs a Facebook Page linked to the Instagram account)"
                          >
                            {fb ? "Reconnect Facebook" : "Connect Facebook"}
                          </a>
                          {isInstagramLoginConfigured && (
                            <a
                              href={igHref}
                              style={connectBtnInstagramStyle}
                              title="Log in with Instagram directly — no Facebook account needed"
                            >
                              {ig ? "Reconnect Instagram" : "Connect Instagram"}
                            </a>
                          )}
                          {fb && (
                            <DisconnectButton
                              teamId={teamId}
                              clientId={a.clientId}
                              platform="facebook"
                              label="Facebook"
                            />
                          )}
                          {ig && (
                            <DisconnectButton
                              teamId={teamId}
                              clientId={a.clientId}
                              platform="instagram"
                              label="Instagram"
                            />
                          )}
                        </span>
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
              <TeamAccountsManager teamId={teamId} accounts={accounts} teamName={team.name as string} />
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

            <section style={{ ...cardStyle, borderColor: "#fecaca" }}>
              <h3 style={{ ...sectionTitleStyle, color: "#b91c1c" }}>Danger zone</h3>
              <p style={sectionSubStyle}>
                Irreversible actions, grouped here so they&rsquo;re easy to find
                and hard to hit by accident.
              </p>
              <TeamDangerZone
                teamId={teamId}
                accounts={accountsInTeam.map((a) => ({ clientId: a.clientId, name: a.name }))}
                isStaff={isStaff}
                backTo={connectReturnTo}
              />
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

const connectBtnFacebookStyle: React.CSSProperties = {
  ...connectBtnStyle,
  background: "#1877F2",
};

const connectBtnInstagramStyle: React.CSSProperties = {
  ...connectBtnStyle,
  background: "#c13584",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 13,
  color: "#71717a",
  textDecoration: "none",
  marginBottom: 8,
};

function bannerStyle(bg: string, border: string, fg: string): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    background: bg,
    border: `1px solid ${border}`,
    color: fg,
    fontSize: 13,
  };
}

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

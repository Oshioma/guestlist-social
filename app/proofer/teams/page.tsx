import Link from "next/link";
import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../base";
import { CreateTeamForm } from "@/app/admin-panel/settings/teams/CreateTeamForm";
import { InviteOwnerForm } from "./InviteOwnerForm";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  plan: "free" | "pro";
  memberCount: number;
  accountCount: number;
};

export default async function ProoferTeamsPage() {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");

  const admin = createAdminClient();
  const { base } = await getProoferBase();

  // Staff see every team; everyone else sees only the teams they belong to.
  let visibleTeamIds: string[] | null = null;
  if (access.kind !== "staff") {
    const { data: mine } = await admin
      .from("team_members")
      .select("team_id")
      .eq("user_id", access.userId);
    visibleTeamIds = Array.from(new Set((mine ?? []).map((r) => r.team_id as string)));
  }

  let rows: TeamRow[] = [];
  if (visibleTeamIds === null || visibleTeamIds.length > 0) {
    let teamsQuery = admin.from("teams").select("id, name, plan").order("name", { ascending: true });
    if (visibleTeamIds !== null) teamsQuery = teamsQuery.in("id", visibleTeamIds);

    const [{ data: teams, error }, { data: memberRows }, { data: accountRows }] = await Promise.all([
      teamsQuery,
      admin.from("team_members").select("team_id"),
      admin.from("team_accounts").select("team_id"),
    ]);
    if (error) throw new Error(`Could not load teams: ${error.message}`);

    const memberCounts = new Map<string, number>();
    for (const r of memberRows ?? []) memberCounts.set(r.team_id, (memberCounts.get(r.team_id) ?? 0) + 1);
    const accountCounts = new Map<string, number>();
    for (const r of accountRows ?? []) accountCounts.set(r.team_id, (accountCounts.get(r.team_id) ?? 0) + 1);

    rows = (teams ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      plan: (t.plan as "free" | "pro") ?? "free",
      memberCount: memberCounts.get(t.id as string) ?? 0,
      accountCount: accountCounts.get(t.id as string) ?? 0,
    }));
  }

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Link href={base || "/"} style={backLinkStyle}>
            &larr; Board
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Teams</h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0", maxWidth: 640 }}>
            A team is a workspace: a set of accounts plus the people who can work
            on them. Put a client&rsquo;s accounts in their own team and invite
            them as a client to give them a view of only their content.
          </p>
        </div>

        <section style={cardStyle}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Create a team</h3>
          <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#71717a" }}>
            Name it now — you can add accounts and invite people next. You&rsquo;ll
            be its owner.
          </p>
          <CreateTeamForm />
        </section>

        {access.kind === "staff" && (
          <section style={cardStyle}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              Invite someone to their own team
            </h3>
            <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#71717a" }}>
              Onboard an independent user: they get their own workspace as owner
              (not added to any of your teams) and can add and connect their own
              accounts after signing in.
            </p>
            <InviteOwnerForm />
          </section>
        )}

        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
            {access.kind === "staff" ? "All teams" : "Your teams"} ({rows.length})
          </h3>
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
              No teams yet. Create one above.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((t) => (
                <Link key={t.id} href={`${base}/teams/${t.id}`} style={teamRowStyle}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                      <PlanBadge plan={t.plan} />
                    </div>
                    <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
                      {t.accountCount} account{t.accountCount === 1 ? "" : "s"} ·{" "}
                      {t.memberCount} {t.memberCount === 1 ? "person" : "people"}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: "#a1a1aa" }}>Open &rarr;</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PlanBadge({ plan }: { plan: "free" | "pro" }) {
  const pro = plan === "pro";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: pro ? "#faf0f4" : "#f4f4f5",
        border: `1px solid ${pro ? "#eccdd9" : "#e4e4e7"}`,
        color: pro ? "#9d2b5b" : "#71717a",
      }}
    >
      {pro ? "Pro" : "Free"}
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

const teamRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #e4e4e7",
  background: "#fff",
  textDecoration: "none",
  color: "#18181b",
  flexWrap: "wrap",
};

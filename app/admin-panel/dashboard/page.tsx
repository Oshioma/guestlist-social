import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayTimezone } from "@/lib/app-settings";
import { getMemberAccess } from "@/lib/auth/permissions";
import { zonedDateKey, zonedTimeToUtcIso, zoneAbbrev } from "@/lib/timezone";
import SectionCard from "../components/SectionCard";
import EmptyState from "../components/EmptyState";
import ClientCard from "../components/ClientCard";
import { mapDbClientToUiClient } from "../lib/mappers";
import { getActiveClientRetainers } from "../lib/cashflow-actions";
import { normalizeAmounts, normalizeOverrides, MONTHS } from "../lib/cashflow-shared";
import TokenExpiryBanner from "../components/TokenExpiryBanner";
import TodayPublishingCard, {
  type TodayPublishingStats,
  type TodayAccountRow,
} from "./TodayPublishingCard";
import FinanceThisMonthCard, {
  type FinanceThisMonthStats,
} from "./FinanceThisMonthCard";
import TeamPriorityCard, {
  type TeamPriorityStats,
  type TeamPriorityRow,
} from "./TeamPriorityCard";

export const dynamic = "force-dynamic";

// Counts of posts scheduled to go out today and posts already published
// today, broken down per account (client + Instagram handle). "Today" is
// the current calendar day in the agency's display timezone, so it lines up
// with the times operators see everywhere else in the app.
async function getTodayPublishingStats(): Promise<TodayPublishingStats> {
  const admin = createAdminClient();

  let timeZone = "Etc/GMT";
  try {
    timeZone = await getDisplayTimezone(admin);
  } catch {
    // fall back to GMT
  }

  const now = new Date();
  const todayKey = zonedDateKey(now, timeZone);
  const startUtc = zonedTimeToUtcIso(todayKey, "00:00", timeZone);
  // Re-zone an instant ~26h later to land on tomorrow's calendar day (DST-safe),
  // then take that day's midnight as the exclusive upper bound.
  const tomorrowKey = zonedDateKey(
    new Date(new Date(startUtc).getTime() + 26 * 60 * 60 * 1000),
    timeZone
  );
  const endUtc = zonedTimeToUtcIso(tomorrowKey, "00:00", timeZone);

  const empty: TodayPublishingStats = {
    scheduledToday: 0,
    postedToday: 0,
    zoneAbbrev: zoneAbbrev(timeZone, now),
    byAccount: [],
  };
  if (!startUtc || !endUtc) return empty;

  const [scheduledRes, postedRes] = await Promise.all([
    admin
      .from("proofer_publish_queue")
      .select("id, post_id")
      .in("status", ["scheduled", "queued"])
      .gte("scheduled_for", startUtc)
      .lt("scheduled_for", endUtc),
    admin
      .from("proofer_publish_queue")
      .select("id, post_id")
      .eq("status", "published")
      .gte("published_at", startUtc)
      .lt("published_at", endUtc),
  ]);

  const scheduledRows = scheduledRes.data ?? [];
  const postedRows = postedRes.data ?? [];

  const postIds = Array.from(
    new Set(
      [...scheduledRows, ...postedRows]
        .map((r) => (r.post_id != null ? String(r.post_id) : null))
        .filter((v): v is string => !!v)
    )
  );

  // post_id -> client_id, then client_id -> { name, handle }
  const postClient = new Map<string, string>();
  const clientInfo = new Map<string, { name: string; handle: string | null }>();
  if (postIds.length > 0) {
    const { data: posts } = await admin
      .from("proofer_posts")
      .select("id, client_id")
      .in("id", postIds);
    for (const p of posts ?? []) {
      if (p.client_id != null) postClient.set(String(p.id), String(p.client_id));
    }
    const clientIds = Array.from(new Set([...postClient.values()]));
    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from("clients")
        .select("id, name, ig_handle")
        .in("id", clientIds);
      for (const c of clients ?? []) {
        clientInfo.set(String(c.id), {
          name: (c.name as string | null) || "Unknown client",
          handle: (c.ig_handle as string | null) ?? null,
        });
      }
    }
  }

  const byAccount = new Map<string, TodayAccountRow>();
  const bucketFor = (postId: string | null): TodayAccountRow => {
    const clientId = postId ? postClient.get(postId) ?? "unknown" : "unknown";
    let row = byAccount.get(clientId);
    if (!row) {
      const info = clientId !== "unknown" ? clientInfo.get(clientId) : undefined;
      row = {
        clientId,
        name: info?.name ?? "Unknown client",
        handle: info?.handle ?? null,
        scheduled: 0,
        posted: 0,
      };
      byAccount.set(clientId, row);
    }
    return row;
  };

  for (const r of scheduledRows) {
    bucketFor(r.post_id != null ? String(r.post_id) : null).scheduled += 1;
  }
  for (const r of postedRows) {
    bucketFor(r.post_id != null ? String(r.post_id) : null).posted += 1;
  }

  return {
    scheduledToday: scheduledRows.length,
    postedToday: postedRows.length,
    zoneAbbrev: zoneAbbrev(timeZone, now),
    byAccount: Array.from(byAccount.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}

async function getActivityStats(timeZone: string) {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Today's calendar day in the agency's display timezone. A task is overdue
  // when its due day is strictly before this — same rule the tasks board uses.
  const todayKey = zonedDateKey(new Date(), timeZone);

  const [
    clientsRes,
    adsRes,
    actionsRes,
    completedActionsRes,
    postsProofedRes,
    postsPublishedRes,
    videoIdeasRes,
    carouselIdeasRes,
    storyIdeasRes,
    campaignsRes,
    decisionsRes,
    tasksRes,
    liveCampaignsRes,
    activeAdsRes,
    overdueTasksRes,
    clientCommentsRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("archived", false).order("created_at", { ascending: false }),
    supabase.from("ads").select("id, client_id, spend, clicks, impressions, ctr, status").order("created_at", { ascending: false }).limit(500),
    supabase.from("ad_actions").select("id, status, created_at").gte("created_at", thirtyDaysAgo),
    supabase.from("ad_actions").select("id").eq("status", "completed").gte("created_at", thirtyDaysAgo),
    supabase.from("proofer_posts").select("id, created_at").in("status", ["proofed", "approved"]).gte("created_at", thirtyDaysAgo),
    supabase.from("proofer_publish_queue").select("id").eq("status", "published").gte("created_at", thirtyDaysAgo),
    supabase.from("video_ideas").select("id").gte("created_at", thirtyDaysAgo),
    supabase.from("carousel_ideas").select("id").gte("created_at", thirtyDaysAgo),
    supabase.from("story_ideas").select("id").gte("created_at", thirtyDaysAgo),
    supabase.from("campaigns").select("id, status, created_at").gte("created_at", thirtyDaysAgo),
    supabase.from("ad_decisions").select("id, status, created_at").gte("created_at", thirtyDaysAgo),
    supabase.from("tasks").select("id, status").in("status", ["todo", "in_progress"]),
    supabase.from("campaigns").select("id").in("status", ["live", "testing"]),
    // Ads currently running across all clients.
    supabase.from("ads").select("id", { count: "exact", head: true }).eq("status", "active"),
    // Open tasks that carry a due date, so we can flag the ones now overdue.
    supabase.from("tasks").select("id, due_date").neq("status", "completed").not("due_date", "is", null),
    // Comments authored by clients (not the agency) on their posts.
    supabase.from("proofer_comments").select("id, resolved").eq("author_role", "client"),
  ]);

  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = (adsRes.data ?? []).filter((a) => String(a.client_id) === String(row.id)).length;
    return mapDbClientToUiClient(row, adCount);
  });

  const totalActions = actionsRes.data?.length ?? 0;
  const completedActions = completedActionsRes.data?.length ?? 0;
  const postsProofed = postsProofedRes.data?.length ?? 0;
  const postsPublished = postsPublishedRes.data?.length ?? 0;
  const ideasCreated = (videoIdeasRes.data?.length ?? 0)
    + (carouselIdeasRes.data?.length ?? 0)
    + (storyIdeasRes.data?.length ?? 0);
  const campaignsCreated = campaignsRes.data?.length ?? 0;
  const decisionsGenerated = decisionsRes.data?.length ?? 0;
  const tasksOutstanding = tasksRes.error ? 0 : (tasksRes.data?.length ?? 0);
  const liveCampaigns = liveCampaignsRes.error ? 0 : (liveCampaignsRes.data?.length ?? 0);
  const activeAds = activeAdsRes.error ? 0 : (activeAdsRes.count ?? 0);
  const overdueTasks = overdueTasksRes.error
    ? 0
    : (overdueTasksRes.data ?? []).filter((t) => {
        const due = t.due_date ? String(t.due_date).slice(0, 10) : "";
        return due !== "" && due < todayKey;
      }).length;
  // Default to "needs attention": client comments not yet marked resolved.
  const clientComments = clientCommentsRes.error
    ? 0
    : (clientCommentsRes.data ?? []).filter((c) => c.resolved !== true).length;

  return {
    clients,
    totalActions,
    completedActions,
    postsProofed,
    postsPublished,
    ideasCreated,
    campaignsCreated,
    decisionsGenerated,
    tasksOutstanding,
    liveCampaigns,
    activeAds,
    overdueTasks,
    clientComments,
  };
}

// Finance snapshot for the current calendar month, read live from the
// cashflow forecast (admins only — the cashflow tables are admin-RLS). Revenue
// mirrors the forecast's own definition: the month's revenue lines plus the
// client-retainers row (a per-month override if pinned, else the live active-
// client total). Costs is the month's cost lines; "salaries coming up" is each
// person's Crew pay plus any Rooms cost billed under the same name, itemised
// per person (salary + room) for the breakdown.
async function getFinanceThisMonth(
  timeZone: string
): Promise<FinanceThisMonthStats | null> {
  const supabase = await createClient();

  const now = new Date();
  const todayKey = zonedDateKey(now, timeZone); // "YYYY-MM-DD"
  const year = Number(todayKey.slice(0, 4));
  const monthIndex = Number(todayKey.slice(5, 7)) - 1; // 0 = Jan
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;

  const [{ data: lineRows, error: linesErr }, { data: settingRow }, retainer] =
    await Promise.all([
      supabase
        .from("cashflow_lines")
        .select("section, label, kind, sort_order, amounts")
        .eq("year", year)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cashflow_settings")
        .select("retainer_overrides")
        .eq("year", year)
        .maybeSingle<{ retainer_overrides: unknown }>(),
      getActiveClientRetainers(),
    ]);

  // No rows (or blocked by RLS for a non-admin) → nothing to show.
  if (linesErr || !lineRows || lineRows.length === 0) return null;

  const overrides = normalizeOverrides(settingRow?.retainer_overrides);
  const retainerThisMonth =
    overrides[monthIndex] != null ? (overrides[monthIndex] as number) : retainer;

  let costs = 0;
  let revenue = 0;
  // Per-person totals, keyed by name. Crew lines set the salary; Rooms lines
  // add a room cost to whoever shares that name (so a person's row shows both).
  const people = new Map<string, { label: string; salary: number; room: number }>();
  const personFor = (label: string) => {
    let p = people.get(label);
    if (!p) {
      p = { label, salary: 0, room: 0 };
      people.set(label, p);
    }
    return p;
  };

  for (const row of lineRows) {
    const amounts = normalizeAmounts(row.amounts);
    const amount = amounts[monthIndex] || 0;
    const kind = (row.kind as string) === "revenue" ? "revenue" : "cost";
    const section = row.section as string;
    if (kind === "revenue") {
      revenue += amount;
    } else {
      costs += amount;
      if (section === "Crew") {
        personFor((row.label as string) || "Crew").salary += amount;
      } else if (section === "Rooms") {
        personFor((row.label as string) || "Rooms").room += amount;
      }
    }
  }

  // Revenue includes the auto client-retainers row, matching the forecast.
  revenue += retainerThisMonth;

  const salaryRows = Array.from(people.values())
    .map((p) => ({
      label: p.label,
      salary: p.salary,
      room: p.room,
      amount: p.salary + p.room,
    }))
    // Drop people who cost nothing this month (e.g. a room-only name with a 0).
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const salaries = salaryRows.reduce((t, r) => t + r.amount, 0);

  return {
    monthLabel: `${MONTHS[monthIndex]} ${year}`,
    revenue,
    costs,
    salaries,
    salaryRows,
  };
}

// One row per team member showing the most recent high-priority task assigned
// to them — but only for people who were given a high-priority task in the last
// three weeks. Someone whose latest high-priority task is older than that (or
// who has none) is left off entirely. Completed tasks are ignored so the row
// always reflects live, outstanding work.
async function getTeamPriorityTasks(): Promise<TeamPriorityStats> {
  const supabase = await createClient();

  const threeWeeksAgo = new Date(
    Date.now() - 21 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, assignee, due_date, created_at")
    .eq("priority", "high")
    .neq("status", "completed")
    .gte("created_at", threeWeeksAgo)
    .order("created_at", { ascending: false });

  if (error || !data) return { rows: [] };

  // Rows come newest-first, so the first one seen for each assignee is their
  // most recently assigned high-priority task.
  const seen = new Set<string>();
  const rows: TeamPriorityRow[] = [];
  for (const t of data) {
    const assignee = (t.assignee as string | null)?.trim();
    if (!assignee || seen.has(assignee)) continue;
    seen.add(assignee);
    rows.push({
      assignee,
      title: (t.title as string | null) ?? "",
      taskId: String(t.id),
      dueDate: (t.due_date as string | null) ?? null,
      createdAt: (t.created_at as string | null) ?? "",
    });
  }

  // Alphabetical by display order keeps the list stable between renders.
  rows.sort((a, b) => a.assignee.localeCompare(b.assignee));

  return { rows };
}

export default async function DashboardPage() {
  try {
    const access = await getMemberAccess();
    const isAdmin = access?.role === "admin";

    // Display timezone drives "today" for the overdue-tasks and finance-month
    // calculations. Fall back to GMT if the setting can't be read.
    let timeZone = "Etc/GMT";
    try {
      timeZone = await getDisplayTimezone(await createClient());
    } catch {
      // keep GMT
    }

    const [stats, todayPublishing, finance, teamPriority] = await Promise.all([
      getActivityStats(timeZone),
      getTodayPublishingStats().catch((err) => {
        console.error("Today publishing stats error:", err);
        return {
          scheduledToday: 0,
          postedToday: 0,
          zoneAbbrev: "",
          byAccount: [],
        } as TodayPublishingStats;
      }),
      // Finance is owner-level data (admin-only RLS). Only fetch it for admins;
      // other members simply don't see the card.
      isAdmin
        ? getFinanceThisMonth(timeZone).catch((err) => {
            console.error("Finance stats error:", err);
            return null;
          })
        : Promise.resolve(null),
      getTeamPriorityTasks().catch((err) => {
        console.error("Team priority tasks error:", err);
        return { rows: [] } as TeamPriorityStats;
      }),
    ]);
    const activeClients = stats.clients.filter((c) => c.status === "active");

    const cards = [
      { label: "Clients", value: String(activeClients.length), sub: `${stats.clients.length} total`, href: "/app/clients" },
      { label: "Posts Proofed", value: String(stats.postsProofed), sub: `${stats.postsPublished} published`, color: stats.postsPublished > 0 ? "#166534" : undefined, href: "/app/proofer/publish" },
      { label: "Ideas Created", value: String(stats.ideasCreated), sub: "video + carousel + story", href: "/app/ideas" },
      { label: "Active ad campaigns", value: String(stats.activeAds), sub: "ads running now", color: stats.activeAds > 0 ? "#166534" : undefined },
      { label: "Campaigns Live", value: String(stats.liveCampaigns), sub: "active right now", color: stats.liveCampaigns > 0 ? "#166534" : undefined },
      { label: "Decisions", value: String(stats.decisionsGenerated), sub: "generated this month" },
      { label: "Tasks Outstanding", value: String(stats.tasksOutstanding), sub: "to do + in progress", color: stats.tasksOutstanding > 0 ? "#b45309" : undefined, href: "/app/tasks" },
      { label: "Overdue tasks", value: String(stats.overdueTasks), sub: "past their due date", color: stats.overdueTasks > 0 ? "#b91c1c" : undefined, href: "/app/tasks" },
      { label: "Client comments", value: String(stats.clientComments), sub: "unresolved on posts", color: stats.clientComments > 0 ? "#b45309" : undefined, href: "/app/proofer" },
    ];

    // Placeholders for metrics we plan to track but don't collect yet.
    const comingSoon = [
      { label: "Hooks tested", sub: "coming soon" },
      { label: "Reel concepts tested", sub: "coming soon" },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <TokenExpiryBanner />

        <TodayPublishingCard stats={todayPublishing} />

        {finance && <FinanceThisMonthCard stats={finance} />}

        <TeamPriorityCard stats={teamPriority} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {cards.map((c) => {
            const inner = (
              <>
                <div style={{ fontSize: 12, color: c.href ? "#18181b" : "#71717a", fontWeight: c.href ? 600 : 400, marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color ?? "#18181b", letterSpacing: "-0.02em" }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{c.sub}</div>
              </>
            );
            const style = {
              padding: "16px 18px",
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #e4e4e7",
              textDecoration: "none" as const,
              color: "inherit" as const,
              display: "block" as const,
            };
            return c.href ? (
              <Link key={c.label} href={c.href} style={style}>{inner}</Link>
            ) : (
              <div key={c.label} style={style}>{inner}</div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {comingSoon.map((c) => (
            <div
              key={c.label}
              style={{
                padding: "16px 18px",
                borderRadius: 14,
                background: "#fafafa",
                border: "1px dashed #e4e4e7",
              }}
            >
              <div style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#d4d4d8", letterSpacing: "-0.02em" }}>—</div>
              <div style={{ fontSize: 12, color: "#c4c4cc", marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Link
            href="/proofer"
            target="_blank"
            rel="noopener"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#effaf6",
              border: "1px solid #99e2d0",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1f6b5c" }}>Proofer ↗</div>
          </Link>
          <Link
            href="/app/proofer"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#fdf2f8",
              border: "1px solid #f9a8d4",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Social Publisher</div>
          </Link>
          <Link
            href="/app/content"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Content Dashboard</div>
          </Link>
          <Link
            href="/app/engine"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#eef2ff",
              border: "1px solid #c7d2fe",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Engine Dashboard</div>
          </Link>
        </div>

        <div>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#18181b" }}>
            Active clients ({activeClients.length})
          </h2>
          {activeClients.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {activeClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active clients"
              description="Set a client to active to see them here."
            />
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error("Dashboard page error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <EmptyState
        title="Dashboard failed to load"
        description={message}
      />
    );
  }
}

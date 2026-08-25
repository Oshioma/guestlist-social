import "server-only";

// ---------------------------------------------------------------------------
// Daily admin report.
//
// One email a day to the configured admin recipients, pulling together the
// four things the operator wants on their desk each morning:
//
//   1. This week's tasks   — overdue, due this week (per employee), and how
//                            many were completed so far this week.
//   2. Posts queued        — upcoming scheduled/queued publish-queue items,
//                            grouped per client.
//   3. This month's money  — revenue vs costs from the cashflow forecast.
//   4. Salaries coming up  — this month's Crew lines from the cashflow
//                            forecast (why recipients are an explicit list,
//                            not "all admins" — see app-settings).
//   5. Client comments     — unresolved comments clients left on posts.
//   6. Sales               — this week's calls / opps / deals so far (and
//                            yesterday's), who to call today (Capsule's
//                            calendar + due pipeline follow-ups), new
//                            opportunities logged since yesterday, and deals
//                            booked this month.
//
// Scheduling is deliberately cron-free: maybeSendDailyReport() runs after
// every admin-panel page load and sends at most once per calendar day (agency
// timezone), claimed atomically through an app_settings marker so concurrent
// page loads can't double-send. The /api/cron/daily-admin-report route stays
// as an optional manual/external trigger. Everything runs on the service role
// (no session), so reads are deliberately agency-wide — same posture as the
// admin dashboard. Fail-soft everywhere: a broken section renders as empty
// rather than blocking the whole email.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { sendEmail, type SendEmailResult } from "@/lib/email";
import {
  getDailyReportRecipients,
  getDisplayTimezone,
} from "@/lib/app-settings";
import {
  formatInstantClockInZone,
  zonedDateKey,
  zonedTimeToUtcIso,
} from "@/lib/timezone";
import {
  normalizeAmounts,
  normalizeOverrides,
} from "@/app/admin-panel/lib/cashflow-shared";
import {
  OPP_STATUS_LABELS,
  normalizeDays,
  normalizeStatus,
  type OppStatus,
} from "@/app/admin-panel/lib/sales-shared";
import { getCapsuleOpenTasks, getCapsulePartyPhones } from "@/lib/capsule";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  );
}

// ── Small date helpers (all keyed off the agency display timezone) ─────────

// Monday of the week containing dayKey (YYYY-MM-DD), as a day key.
function mondayOf(dayKey: string): string {
  const d = new Date(dayKey + "T00:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

function addDays(dayKey: string, days: number): string {
  const d = new Date(dayKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(dayKey: string): string {
  const d = new Date(dayKey + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

// ── Report data shape ──────────────────────────────────────────────────────

type TaskLine = {
  title: string;
  assignee: string;
  dueKey: string; // YYYY-MM-DD or ""
  status: string;
  priority: string;
};

type QueuedPost = {
  clientName: string;
  platform: string;
  caption: string;
  scheduledFor: string | null; // ISO
};

type SalaryLine = { name: string; amount: number };

type ClientComment = {
  clientName: string;
  author: string;
  comment: string;
  createdAt: string;
  postCaption: string;
};

export type SalesSummary = {
  // Current week's day cells summed across every rep, Monday → today.
  weekCalls: number;
  weekOpps: number;
  weekDeals: number;
  hasWeekRows: boolean;
  // Yesterday's counts — only meaningful when yesterday was a logged Mon–Fri.
  yesterdayCalls: number;
  yesterdayOpps: number;
  yesterdayDeals: number;
  hasYesterday: boolean;
  // Opportunities logged since the start of yesterday (agency timezone).
  newOpps: { company: string; amount: number | null; status: OppStatus }[];
  // Opportunities marked booked in the current month's bucket.
  bookedThisMonth: { company: string; amount: number | null }[];
  // Today's call agenda: Capsule open tasks due today or overdue, plus
  // pending pipeline follow-ups that have come due.
  callsToday: {
    who: string;
    what: string;
    phone: string | null;
    dueOn: string | null;
    overdue: boolean;
    source: "capsule" | "pipeline";
  }[];
};

export type DailyReportData = {
  dateLabel: string;
  weekLabel: string;
  overdueTasks: TaskLine[];
  dueThisWeek: TaskLine[];
  completedThisWeekByPerson: { person: string; count: number }[];
  queuedPosts: QueuedPost[];
  queuedTotal: number;
  salaryMonthLabel: string;
  salaries: SalaryLine[];
  monthlyRevenue: number;
  monthlyCosts: number;
  clientComments: ClientComment[];
  sales: SalesSummary;
  timeZone: string;
};

// ── Data collection ────────────────────────────────────────────────────────

export async function buildDailyReportData(): Promise<DailyReportData> {
  const supabase = admin();

  let timeZone = "Europe/London";
  try {
    timeZone = await getDisplayTimezone(supabase);
  } catch {
    // keep default
  }

  const now = new Date();
  const todayKey = zonedDateKey(now, timeZone);
  const mondayKey = mondayOf(todayKey);
  const nextMondayKey = addDays(mondayKey, 7);
  const sundayKey = addDays(mondayKey, 6);
  const weekStartUtc = zonedTimeToUtcIso(mondayKey, "00:00", timeZone);

  const year = Number(todayKey.slice(0, 4));
  const monthIdx = Number(todayKey.slice(5, 7)) - 1;
  const salaryMonthLabel = new Date(
    Date.UTC(year, monthIdx, 1)
  ).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const yesterdayKey = addDays(todayKey, -1);
  const yesterdayMondayKey = mondayOf(yesterdayKey);
  const monthStartKey = todayKey.slice(0, 7) + "-01";
  const yesterdayStartUtc = zonedTimeToUtcIso(yesterdayKey, "00:00", timeZone);

  const [
    tasksRes,
    completionsRes,
    queueRes,
    crewRes,
    commentsRes,
    salesWeeksRes,
    newOppsRes,
    bookedOppsRes,
    dueFollowUpsRes,
    capsuleRes,
  ] = await Promise.all([
      supabase.from("tasks").select("title, assignee, due_date, status, priority"),
      supabase
        .from("task_completions")
        .select("assignee, completed_by")
        .gte("completed_at", weekStartUtc || now.toISOString()),
      supabase
        .from("proofer_publish_queue")
        .select("post_id, platform, status, scheduled_for")
        .in("status", ["scheduled", "queued"])
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("cashflow_lines")
        .select("section, label, kind, amounts")
        .eq("year", year)
        .order("sort_order", { ascending: true }),
      supabase
        .from("proofer_comments")
        .select("post_id, comment, created_by, created_at")
        .eq("author_role", "client")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("sales_weeks")
        .select("week_start, rep, calls, opps, deals")
        .in("week_start", [mondayKey, yesterdayMondayKey]),
      supabase
        .from("sales_opportunities")
        .select("company, amount, status, created_at")
        .gte("created_at", yesterdayStartUtc || now.toISOString())
        .order("created_at", { ascending: true })
        .limit(30),
      supabase
        .from("sales_opportunities")
        .select("company, amount")
        .eq("month_start", monthStartKey)
        .eq("status", "booked")
        .order("sort_order", { ascending: true })
        .limit(30),
      supabase
        .from("sales_opportunities")
        .select("company, amount, follow_up")
        .eq("status", "pending")
        .not("follow_up", "is", null)
        .lte("follow_up", todayKey)
        .gte("follow_up", addDays(todayKey, -31))
        .order("follow_up", { ascending: true })
        .limit(15),
      getCapsuleOpenTasks(),
    ]);

  // 1. Tasks — overdue and due this week, current (non-completed) only.
  const overdueTasks: TaskLine[] = [];
  const dueThisWeek: TaskLine[] = [];
  for (const row of (tasksRes.data ?? []) as {
    title: string | null;
    assignee: string | null;
    due_date: string | null;
    status: string | null;
    priority: string | null;
  }[]) {
    if ((row.status ?? "open") === "completed") continue;
    const dueKey = (row.due_date ?? "").slice(0, 10);
    const line: TaskLine = {
      title: row.title ?? "",
      assignee: row.assignee || "Unassigned",
      dueKey,
      status: row.status ?? "open",
      priority: row.priority ?? "normal",
    };
    if (dueKey && dueKey < todayKey) overdueTasks.push(line);
    else if (dueKey && dueKey >= todayKey && dueKey < nextMondayKey)
      dueThisWeek.push(line);
  }
  overdueTasks.sort((a, b) => a.dueKey.localeCompare(b.dueKey));
  dueThisWeek.sort(
    (a, b) =>
      a.dueKey.localeCompare(b.dueKey) || a.assignee.localeCompare(b.assignee)
  );

  // Completed so far this week, counted per person. task_completions may not
  // exist yet in an environment — treat that as "none".
  const completedCounts = new Map<string, number>();
  if (!completionsRes.error) {
    for (const row of (completionsRes.data ?? []) as {
      assignee: string | null;
      completed_by: string | null;
    }[]) {
      const person = row.assignee || row.completed_by || "Unassigned";
      completedCounts.set(person, (completedCounts.get(person) ?? 0) + 1);
    }
  }
  const completedThisWeekByPerson = Array.from(completedCounts.entries())
    .map(([person, count]) => ({ person, count }))
    .sort((a, b) => b.count - a.count || a.person.localeCompare(b.person));

  // 2. Posts queued — upcoming (or unscheduled) items, joined to client names.
  const queueRows = ((queueRes.data ?? []) as {
    post_id: string | number | null;
    platform: string | null;
    status: string | null;
    scheduled_for: string | null;
  }[]).filter(
    (r) =>
      !r.scheduled_for ||
      new Date(r.scheduled_for).getTime() >= now.getTime() - 60 * 60 * 1000
  );

  const postIds = Array.from(
    new Set(
      queueRows
        .concat([]) // keep types happy
        .map((r) => (r.post_id != null ? String(r.post_id) : null))
        .filter((v): v is string => !!v)
    )
  );
  const commentPostIds = Array.from(
    new Set(
      ((commentsRes.data ?? []) as { post_id: string | number | null }[])
        .map((r) => (r.post_id != null ? String(r.post_id) : null))
        .filter((v): v is string => !!v)
    )
  );
  const allPostIds = Array.from(new Set([...postIds, ...commentPostIds]));

  const postInfo = new Map<
    string,
    { clientId: string | null; caption: string }
  >();
  const clientNames = new Map<string, string>();
  if (allPostIds.length > 0) {
    const { data: posts } = await supabase
      .from("proofer_posts")
      .select("id, client_id, caption")
      .in("id", allPostIds);
    for (const p of (posts ?? []) as {
      id: string | number;
      client_id: string | number | null;
      caption: string | null;
    }[]) {
      postInfo.set(String(p.id), {
        clientId: p.client_id != null ? String(p.client_id) : null,
        caption: p.caption ?? "",
      });
    }
    const clientIds = Array.from(
      new Set(
        Array.from(postInfo.values())
          .map((p) => p.clientId)
          .filter((v): v is string => !!v)
      )
    );
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      for (const c of (clients ?? []) as {
        id: string | number;
        name: string | null;
      }[]) {
        clientNames.set(String(c.id), c.name || "Unknown client");
      }
    }
  }

  const clientNameFor = (postId: string | number | null): string => {
    if (postId == null) return "Unknown client";
    const info = postInfo.get(String(postId));
    if (!info?.clientId) return "Unknown client";
    return clientNames.get(info.clientId) ?? "Unknown client";
  };

  const queuedPosts: QueuedPost[] = queueRows.slice(0, 25).map((r) => ({
    clientName: clientNameFor(r.post_id),
    platform: r.platform ?? "",
    caption: truncate(
      r.post_id != null ? postInfo.get(String(r.post_id))?.caption ?? "" : "",
      90
    ),
    scheduledFor: r.scheduled_for,
  }));

  // 3. This month's money + salaries, from the cashflow forecast. Same maths
  // as the dashboard's "Finance this month" card: costs/revenue are the
  // month's column across every line, salaries are the Crew section, and
  // revenue additionally includes the auto client-retainers row (live sum of
  // active clients' monthly price, unless that month is pinned by an
  // override in cashflow_settings).
  const salaries: SalaryLine[] = [];
  let monthlyRevenue = 0;
  let monthlyCosts = 0;
  if (!crewRes.error) {
    for (const row of (crewRes.data ?? []) as {
      section: string | null;
      label: string | null;
      kind: string | null;
      amounts: unknown;
    }[]) {
      const amount = normalizeAmounts(row.amounts)[monthIdx] || 0;
      if ((row.kind ?? "cost") === "revenue") {
        monthlyRevenue += amount;
      } else {
        monthlyCosts += amount;
        if (row.section === "Crew" && amount > 0) {
          salaries.push({ name: row.label || "—", amount });
        }
      }
    }

    try {
      const [{ data: settingRow }, { data: activeClients }] = await Promise.all(
        [
          supabase
            .from("cashflow_settings")
            .select("retainer_overrides")
            .eq("year", year)
            .maybeSingle<{ retainer_overrides: unknown }>(),
          supabase
            .from("clients")
            .select("id")
            .in("status", ["active", "growing"])
            .eq("archived", false),
        ]
      );
      const overrides = normalizeOverrides(settingRow?.retainer_overrides);
      let retainer = 0;
      const clientIds = (activeClients ?? []).map((r) => (r as { id: number }).id);
      if (clientIds.length > 0) {
        const { data: billing } = await supabase
          .from("client_billing")
          .select("monthly_price")
          .in("client_id", clientIds);
        retainer = (billing ?? []).reduce((total, row) => {
          const price = Number((row as { monthly_price: unknown }).monthly_price);
          return total + (Number.isFinite(price) ? price : 0);
        }, 0);
      }
      monthlyRevenue +=
        overrides[monthIdx] != null ? (overrides[monthIdx] as number) : retainer;
    } catch (e) {
      console.warn("[daily-report] retainer revenue unavailable:", e);
    }
  }

  // 4. Unresolved client comments.
  const clientComments: ClientComment[] = (
    (commentsRes.data ?? []) as {
      post_id: string | number | null;
      comment: string | null;
      created_by: string | null;
      created_at: string | null;
    }[]
  ).map((r) => ({
    clientName: clientNameFor(r.post_id),
    author: r.created_by || "Client",
    comment: truncate(r.comment ?? "", 160),
    createdAt: r.created_at ?? "",
    postCaption: truncate(
      r.post_id != null ? postInfo.get(String(r.post_id))?.caption ?? "" : "",
      60
    ),
  }));

  // 6. Sales — this week's activity (summed across reps), yesterday's
  // counts, new opportunities and this month's bookings. The tables may not
  // exist yet in an environment — fail soft to an empty section.
  const sumDays = (a: number[]) => a.reduce((t, n) => t + (n || 0), 0);
  const sales: SalesSummary = {
    weekCalls: 0,
    weekOpps: 0,
    weekDeals: 0,
    hasWeekRows: false,
    yesterdayCalls: 0,
    yesterdayOpps: 0,
    yesterdayDeals: 0,
    hasYesterday: false,
    newOpps: [],
    bookedThisMonth: [],
    callsToday: [],
  };
  // Mon=0 … Sun=6; only Mon–Fri exist in the grid.
  const yDayIdx =
    (new Date(yesterdayKey + "T00:00:00Z").getUTCDay() + 6) % 7;
  if (!salesWeeksRes.error) {
    for (const row of (salesWeeksRes.data ?? []) as {
      week_start: string | null;
      calls: unknown;
      opps: unknown;
      deals: unknown;
    }[]) {
      const calls = normalizeDays(row.calls);
      const opps = normalizeDays(row.opps);
      const deals = normalizeDays(row.deals);
      if (row.week_start === mondayKey) {
        sales.hasWeekRows = true;
        sales.weekCalls += sumDays(calls);
        sales.weekOpps += sumDays(opps);
        sales.weekDeals += sumDays(deals);
      }
      if (yDayIdx < 5 && row.week_start === yesterdayMondayKey) {
        sales.hasYesterday = true;
        sales.yesterdayCalls += calls[yDayIdx];
        sales.yesterdayOpps += opps[yDayIdx];
        sales.yesterdayDeals += deals[yDayIdx];
      }
    }
  }
  if (!newOppsRes.error) {
    sales.newOpps = ((newOppsRes.data ?? []) as {
      company: string | null;
      amount: unknown;
      status: unknown;
    }[]).map((r) => ({
      company: r.company || "(unnamed)",
      amount: r.amount == null ? null : Number(r.amount),
      status: normalizeStatus(r.status),
    }));
  }
  if (!bookedOppsRes.error) {
    sales.bookedThisMonth = ((bookedOppsRes.data ?? []) as {
      company: string | null;
      amount: unknown;
    }[]).map((r) => ({
      company: r.company || "(unnamed)",
      amount: r.amount == null ? null : Number(r.amount),
    }));
  }
  // Who to call today: Capsule's calendar (open tasks due today or overdue)
  // merged with pipeline follow-ups that have come due. Overdue counts only
  // within the last month — the account carries a backlog of ancient open
  // tasks that would otherwise flood the list (mirrors the calendar tab).
  // Capsule not being configured or reachable just leaves its half out.
  const overdueCutoffKey = addDays(todayKey, -31);
  const callsRaw: (SalesSummary["callsToday"][number] & {
    partyId: number | null;
  })[] = [];
  if (capsuleRes.ok) {
    for (const t of capsuleRes.tasks) {
      if (!t.dueOn || t.dueOn > todayKey || t.dueOn < overdueCutoffKey) continue;
      callsRaw.push({
        who: t.partyName || t.opportunityName || "(no contact)",
        what: t.description || t.detail || "Task",
        phone: null,
        dueOn: t.dueOn,
        overdue: t.dueOn < todayKey,
        source: "capsule",
        partyId: t.partyId,
      });
    }
  }
  if (!dueFollowUpsRes.error) {
    for (const r of (dueFollowUpsRes.data ?? []) as {
      company: string | null;
      amount: unknown;
      follow_up: string | null;
    }[]) {
      const amount = r.amount == null ? null : Number(r.amount);
      callsRaw.push({
        who: r.company || "(unnamed)",
        what:
          "Follow up on the pitch" +
          (amount != null && Number.isFinite(amount) ? ` (${gbp(amount)})` : ""),
        phone: null,
        dueOn: r.follow_up,
        overdue: (r.follow_up ?? todayKey) < todayKey,
        source: "pipeline",
        partyId: null,
      });
    }
  }
  callsRaw.sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const callsCut = callsRaw.slice(0, 15);
  // Phone numbers for the Capsule contacts on today's list, so the email is
  // dialable on its own. Fail-soft: lookup errors just leave numbers off.
  try {
    const phones = await getCapsulePartyPhones(
      callsCut
        .map((c) => c.partyId)
        .filter((id): id is number => id != null)
    );
    for (const c of callsCut) {
      if (c.partyId != null) c.phone = phones[c.partyId] ?? null;
    }
  } catch (e) {
    console.warn("[daily-report] phone lookup failed:", e);
  }
  sales.callsToday = callsCut.map(({ partyId: _partyId, ...c }) => c);

  const dateLabel = new Date(todayKey + "T00:00:00Z").toLocaleDateString(
    "en-GB",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  );

  return {
    dateLabel,
    weekLabel: `${dayLabel(mondayKey)} – ${dayLabel(sundayKey)}`,
    overdueTasks,
    dueThisWeek,
    completedThisWeekByPerson,
    queuedPosts,
    queuedTotal: queueRows.length,
    salaryMonthLabel,
    salaries,
    monthlyRevenue,
    monthlyCosts,
    clientComments,
    sales,
    timeZone,
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────

function shortName(email: string): string {
  return email.includes("@") ? email.split("@")[0] : email;
}

function gbp(n: number): string {
  return (
    "£" +
    n.toLocaleString("en-GB", {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

export function renderDailyReport(data: DailyReportData): {
  subject: string;
  html: string;
  text: string;
} {
  const baseUrl = getAppBaseUrl();
  const subject = `Daily report — ${data.dateLabel}`;

  const sectionTitle = (label: string) =>
    `<h2 style="margin:28px 0 10px;font-size:15px;font-weight:700;color:#18181b;">${label}</h2>`;
  const muted = (s: string) =>
    `<p style="margin:0;font-size:13px;color:#71717a;">${s}</p>`;
  const row = (left: string, right: string) =>
    `<tr><td style="padding:6px 0;font-size:13px;color:#18181b;border-bottom:1px solid #f4f4f5;">${left}</td><td style="padding:6px 0 6px 12px;font-size:12px;color:#71717a;border-bottom:1px solid #f4f4f5;text-align:right;white-space:nowrap;">${right}</td></tr>`;
  const table = (rows: string) =>
    `<table style="width:100%;border-collapse:collapse;">${rows}</table>`;

  const textLines: string[] = [`Daily report — ${data.dateLabel}`, ""];
  const htmlParts: string[] = [];

  // 1. This week's tasks
  htmlParts.push(sectionTitle(`This week's tasks (${data.weekLabel})`));
  textLines.push(`THIS WEEK'S TASKS (${data.weekLabel})`);
  if (data.overdueTasks.length > 0) {
    htmlParts.push(
      `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#991b1b;">Overdue (${data.overdueTasks.length})</p>`
    );
    htmlParts.push(
      table(
        data.overdueTasks
          .map((t) =>
            row(
              `${escapeHtml(truncate(t.title, 70))} <span style="color:#71717a;">— ${escapeHtml(shortName(t.assignee))}</span>`,
              `was due ${dayLabel(t.dueKey)}`
            )
          )
          .join("")
      )
    );
    textLines.push(`  Overdue (${data.overdueTasks.length}):`);
    data.overdueTasks.forEach((t) =>
      textLines.push(`    - ${t.title} — ${shortName(t.assignee)} (was due ${dayLabel(t.dueKey)})`)
    );
  }
  if (data.dueThisWeek.length > 0) {
    htmlParts.push(
      `<p style="margin:12px 0 6px;font-size:13px;font-weight:700;color:#18181b;">Due this week (${data.dueThisWeek.length})</p>`
    );
    htmlParts.push(
      table(
        data.dueThisWeek
          .map((t) =>
            row(
              `${escapeHtml(truncate(t.title, 70))} <span style="color:#71717a;">— ${escapeHtml(shortName(t.assignee))}</span>${t.priority === "high" ? ' <span style="color:#b91c1c;font-weight:700;">HIGH</span>' : ""}`,
              dayLabel(t.dueKey)
            )
          )
          .join("")
      )
    );
    textLines.push(`  Due this week (${data.dueThisWeek.length}):`);
    data.dueThisWeek.forEach((t) =>
      textLines.push(`    - ${t.title} — ${shortName(t.assignee)} (${dayLabel(t.dueKey)})`)
    );
  }
  if (data.overdueTasks.length === 0 && data.dueThisWeek.length === 0) {
    htmlParts.push(muted("No open tasks due this week."));
    textLines.push("  No open tasks due this week.");
  }
  if (data.completedThisWeekByPerson.length > 0) {
    const summary = data.completedThisWeekByPerson
      .map((c) => `${shortName(c.person)} ${c.count}`)
      .join(" · ");
    htmlParts.push(
      `<p style="margin:10px 0 0;font-size:12px;color:#166534;">Completed so far this week: ${escapeHtml(summary)}</p>`
    );
    textLines.push(`  Completed so far this week: ${summary}`);
  }
  textLines.push("");

  // 2. Posts queued
  htmlParts.push(sectionTitle(`Posts queued (${data.queuedTotal})`));
  textLines.push(`POSTS QUEUED (${data.queuedTotal})`);
  if (data.queuedPosts.length === 0) {
    htmlParts.push(muted("Nothing in the publish queue."));
    textLines.push("  Nothing in the publish queue.");
  } else {
    htmlParts.push(
      table(
        data.queuedPosts
          .map((p) => {
            const when = p.scheduledFor
              ? `${dayLabel(zonedDateKey(p.scheduledFor, data.timeZone))} ${formatInstantClockInZone(p.scheduledFor, data.timeZone)}`
              : "no time set";
            return row(
              `<strong>${escapeHtml(p.clientName)}</strong>${p.platform ? ` <span style="color:#71717a;">· ${escapeHtml(p.platform)}</span>` : ""}${p.caption ? `<br/><span style="color:#71717a;">${escapeHtml(p.caption)}</span>` : ""}`,
              when
            );
          })
          .join("")
      )
    );
    if (data.queuedTotal > data.queuedPosts.length) {
      htmlParts.push(
        muted(`…and ${data.queuedTotal - data.queuedPosts.length} more in the queue.`)
      );
    }
    data.queuedPosts.forEach((p) => {
      const when = p.scheduledFor
        ? `${dayLabel(zonedDateKey(p.scheduledFor, data.timeZone))} ${formatInstantClockInZone(p.scheduledFor, data.timeZone)}`
        : "no time set";
      textLines.push(`  - ${p.clientName}${p.platform ? ` (${p.platform})` : ""} — ${when}`);
    });
  }
  textLines.push("");

  // 3. Sales
  const sales = data.sales;
  const statusColor: Record<OppStatus, string> = {
    pending: "#71717a",
    booked: "#166534",
    not_booked: "#b91c1c",
  };
  const oppAmount = (n: number | null) => (n == null ? "—" : gbp(n));
  htmlParts.push(sectionTitle("Sales"));
  textLines.push("SALES");
  const salesRows: string[] = [];
  if (sales.hasWeekRows) {
    salesRows.push(
      row(
        "This week so far",
        `<strong>${sales.weekCalls}</strong> calls · <strong>${sales.weekOpps}</strong> opps · <strong>${sales.weekDeals}</strong> deals`
      )
    );
    textLines.push(
      `  This week so far: ${sales.weekCalls} calls, ${sales.weekOpps} opps, ${sales.weekDeals} deals`
    );
  }
  if (sales.hasYesterday) {
    salesRows.push(
      row(
        "Yesterday",
        `${sales.yesterdayCalls} calls · ${sales.yesterdayOpps} opps · ${sales.yesterdayDeals} deals`
      )
    );
    textLines.push(
      `  Yesterday: ${sales.yesterdayCalls} calls, ${sales.yesterdayOpps} opps, ${sales.yesterdayDeals} deals`
    );
  }
  if (salesRows.length > 0) htmlParts.push(table(salesRows.join("")));
  if (!sales.hasWeekRows && !sales.hasYesterday) {
    htmlParts.push(muted("No call activity logged for this week yet."));
    textLines.push("  No call activity logged for this week yet.");
  }

  htmlParts.push(
    `<p style="margin:12px 0 6px;font-size:13px;font-weight:700;color:#18181b;">Who to call today (${sales.callsToday.length})</p>`
  );
  textLines.push(`  Who to call today (${sales.callsToday.length}):`);
  if (sales.callsToday.length === 0) {
    htmlParts.push(muted("No calls due today."));
    textLines.push("    (no calls due today)");
  } else {
    htmlParts.push(
      table(
        sales.callsToday
          .map((c) =>
            row(
              `<strong>${escapeHtml(truncate(c.who, 50))}</strong>${c.phone ? ` <span style="color:#0369a1;font-weight:600;white-space:nowrap;">${escapeHtml(c.phone)}</span>` : ""} <span style="color:#71717a;">— ${escapeHtml(truncate(c.what, 70))}</span>`,
              c.overdue
                ? `<span style="color:#b91c1c;font-weight:700;">overdue${c.dueOn ? ` (${dayLabel(c.dueOn)})` : ""}</span>`
                : "today"
            )
          )
          .join("")
      )
    );
    sales.callsToday.forEach((c) =>
      textLines.push(
        `    - ${c.who}${c.phone ? ` (${c.phone})` : ""} — ${c.what}${c.overdue ? ` (overdue${c.dueOn ? `, ${dayLabel(c.dueOn)}` : ""})` : ""}`
      )
    );
  }

  htmlParts.push(
    `<p style="margin:12px 0 6px;font-size:13px;font-weight:700;color:#18181b;">New opportunities since yesterday (${sales.newOpps.length})</p>`
  );
  textLines.push(`  New opportunities since yesterday (${sales.newOpps.length}):`);
  if (sales.newOpps.length === 0) {
    htmlParts.push(muted("None logged."));
    textLines.push("    (none logged)");
  } else {
    htmlParts.push(
      table(
        sales.newOpps
          .map((o) =>
            row(
              `${escapeHtml(truncate(o.company, 60))} <span style="color:${statusColor[o.status]};font-weight:600;">· ${OPP_STATUS_LABELS[o.status]}</span>`,
              oppAmount(o.amount)
            )
          )
          .join("")
      )
    );
    sales.newOpps.forEach((o) =>
      textLines.push(
        `    - ${o.company} — ${oppAmount(o.amount)} (${OPP_STATUS_LABELS[o.status]})`
      )
    );
  }

  const bookedTotal = sales.bookedThisMonth.reduce(
    (t, o) => t + (o.amount ?? 0),
    0
  );
  htmlParts.push(
    `<p style="margin:12px 0 6px;font-size:13px;font-weight:700;color:#166534;">Deals booked this month (${sales.bookedThisMonth.length}${sales.bookedThisMonth.length > 0 ? ` · ${gbp(bookedTotal)}` : ""})</p>`
  );
  textLines.push(
    `  Deals booked this month (${sales.bookedThisMonth.length}${sales.bookedThisMonth.length > 0 ? ` · ${gbp(bookedTotal)}` : ""}):`
  );
  if (sales.bookedThisMonth.length === 0) {
    htmlParts.push(muted("Nothing booked yet this month."));
    textLines.push("    (nothing booked yet this month)");
  } else {
    htmlParts.push(
      table(
        sales.bookedThisMonth
          .map((o) => row(escapeHtml(truncate(o.company, 60)), oppAmount(o.amount)))
          .join("")
      )
    );
    sales.bookedThisMonth.forEach((o) =>
      textLines.push(`    - ${o.company} — ${oppAmount(o.amount)}`)
    );
  }
  textLines.push("");

  // 4. This month's money
  const net = data.monthlyRevenue - data.monthlyCosts;
  htmlParts.push(sectionTitle(`This month's money (${data.salaryMonthLabel})`));
  htmlParts.push(
    table(
      row(`Monthly revenue`, `<strong style="color:#166534;">${gbp(data.monthlyRevenue)}</strong>`) +
        row(`Monthly costs`, `<strong>${gbp(data.monthlyCosts)}</strong>`) +
        row(
          `<strong>Net</strong>`,
          `<strong style="color:${net >= 0 ? "#166534" : "#b91c1c"};">${net < 0 ? "-" : ""}${gbp(Math.abs(net))}</strong>`
        )
    )
  );
  textLines.push(`THIS MONTH'S MONEY (${data.salaryMonthLabel})`);
  textLines.push(`  Revenue: ${gbp(data.monthlyRevenue)}`);
  textLines.push(`  Costs: ${gbp(data.monthlyCosts)}`);
  textLines.push(`  Net: ${net < 0 ? "-" : ""}${gbp(Math.abs(net))}`);
  textLines.push("");

  // 5. Staff salaries coming up
  htmlParts.push(sectionTitle(`Staff salaries coming up (${data.salaryMonthLabel})`));
  textLines.push(`STAFF SALARIES COMING UP (${data.salaryMonthLabel})`);
  if (data.salaries.length === 0) {
    htmlParts.push(muted("No crew salaries in the forecast for this month."));
    textLines.push("  No crew salaries in the forecast for this month.");
  } else {
    const total = data.salaries.reduce((s, l) => s + l.amount, 0);
    htmlParts.push(
      table(
        data.salaries
          .map((s) => row(escapeHtml(s.name), gbp(s.amount)))
          .join("") +
          row(`<strong>Total</strong>`, `<strong>${gbp(total)}</strong>`)
      )
    );
    data.salaries.forEach((s) => textLines.push(`  - ${s.name}: ${gbp(s.amount)}`));
    textLines.push(`  Total: ${gbp(total)}`);
  }
  textLines.push("");

  // 6. Client comments
  htmlParts.push(
    sectionTitle(`Client comments on posts (${data.clientComments.length} unresolved)`)
  );
  textLines.push(`CLIENT COMMENTS ON POSTS (${data.clientComments.length} unresolved)`);
  if (data.clientComments.length === 0) {
    htmlParts.push(muted("No unresolved client comments. All caught up."));
    textLines.push("  No unresolved client comments.");
  } else {
    htmlParts.push(
      table(
        data.clientComments
          .map((c) =>
            row(
              `<strong>${escapeHtml(c.clientName)}</strong> <span style="color:#71717a;">· ${escapeHtml(shortName(c.author))}</span><br/>“${escapeHtml(c.comment)}”${c.postCaption ? `<br/><span style="color:#a1a1aa;">on: ${escapeHtml(c.postCaption)}</span>` : ""}`,
              c.createdAt ? dayLabel(zonedDateKey(c.createdAt, data.timeZone)) : ""
            )
          )
          .join("")
      )
    );
    data.clientComments.forEach((c) =>
      textLines.push(`  - ${c.clientName} (${shortName(c.author)}): "${c.comment}"`)
    );
  }
  textLines.push("");
  textLines.push(`Open the admin panel: ${baseUrl}/admin-panel/dashboard`);

  const html = `
<div style="max-width:640px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Daily report</h1>
  <p style="margin:4px 0 0;font-size:13px;color:#71717a;">${escapeHtml(data.dateLabel)}</p>
  ${htmlParts.join("\n")}
  <p style="margin:28px 0 0;">
    <a href="${baseUrl}/admin-panel/dashboard" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#18181b;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Open the admin panel</a>
  </p>
  <p style="margin:18px 0 0;font-size:11px;color:#a1a1aa;">Sent automatically by Guestlist Social. Manage recipients in Settings → Daily admin report.</p>
</div>`;

  return { subject, html, text: textLines.join("\n") };
}

// ── Send ───────────────────────────────────────────────────────────────────

export type SendDailyReportResult = {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
  details: SendEmailResult[];
};

export async function sendDailyAdminReport(): Promise<SendDailyReportResult> {
  const supabase = admin();
  const recipients = await getDailyReportRecipients(supabase);
  if (recipients.length === 0) {
    return {
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: "No recipients configured (Settings → Daily admin report).",
      details: [],
    };
  }

  const data = await buildDailyReportData();
  const { subject, html, text } = renderDailyReport(data);

  // One send per recipient so a single bad address doesn't poison the rest —
  // same posture as the review digest.
  const details: SendEmailResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const to of recipients) {
    const result = await sendEmail({ to, subject, html, text });
    details.push(result);
    if (result.ok) sent += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  }

  return { recipients: recipients.length, sent, skipped, failed, details };
}

// ── Cron-free daily trigger ────────────────────────────────────────────────
//
// Called (fire-and-forget, via next/server `after`) on every admin-panel page
// load. The first visit of each calendar day (agency timezone) sends the
// report; every other visit is a cheap no-op. The day is claimed atomically
// in app_settings BEFORE sending, so two simultaneous page loads can't both
// send; if the send then fails outright, the claim is released so the next
// visit retries.

const DAILY_REPORT_LAST_SENT_KEY = "daily_report_last_sent";

// Returns true if this call won the claim for `todayKey`. The marker value
// is `{ day: "YYYY-MM-DD" }` so the guard can filter on the `value->>day`
// text path (raw jsonb equality filters are unreliable through PostgREST).
async function claimDay(
  supabase: ReturnType<typeof admin>,
  todayKey: string
): Promise<boolean> {
  // Fast path: fresh key, no row yet.
  const { error: insertErr } = await supabase
    .from("app_settings")
    .insert({ key: DAILY_REPORT_LAST_SENT_KEY, value: { day: todayKey } });
  if (!insertErr) return true;

  // Row exists — flip it to today only if it isn't today already. The guard
  // makes the update itself the mutex: exactly one concurrent caller sees a
  // changed row. The is.null arm self-heals a malformed marker value.
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      value: { day: todayKey },
      updated_at: new Date().toISOString(),
    })
    .eq("key", DAILY_REPORT_LAST_SENT_KEY)
    .or(`value->>day.neq.${todayKey},value->>day.is.null`)
    .select("key");
  if (error) {
    console.error("[daily-report] claim failed:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

async function releaseDay(supabase: ReturnType<typeof admin>): Promise<void> {
  await supabase
    .from("app_settings")
    .delete()
    .eq("key", DAILY_REPORT_LAST_SENT_KEY);
}

export type MaybeSendResult = {
  triggered: boolean;
  reason: string;
  result?: SendDailyReportResult;
};

export async function maybeSendDailyReport(): Promise<MaybeSendResult> {
  try {
    const supabase = admin();

    // No recipients → nothing to do, and deliberately no claim either, so
    // adding recipients mid-day still gets a report on the next trigger.
    const recipients = await getDailyReportRecipients(supabase);
    if (recipients.length === 0) {
      return { triggered: false, reason: "no recipients configured" };
    }

    let timeZone = "Europe/London";
    try {
      timeZone = await getDisplayTimezone(supabase);
    } catch {
      // keep default
    }
    const todayKey = zonedDateKey(new Date(), timeZone);

    // Cheap read before the claim: already sent today → done.
    const { data: markerRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", DAILY_REPORT_LAST_SENT_KEY)
      .maybeSingle<{ value: { day?: unknown } | null }>();
    if (markerRow?.value?.day === todayKey) {
      return { triggered: false, reason: "already sent today" };
    }

    if (!(await claimDay(supabase, todayKey))) {
      return { triggered: false, reason: "another trigger claimed today" };
    }

    const result = await sendDailyAdminReport();
    console.log(
      `[daily-report] daily send for ${todayKey}: sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`
    );
    // Nothing went out at all (provider down / not configured) — release the
    // claim so a later trigger today retries instead of silently losing a day.
    if (result.sent === 0) await releaseDay(supabase);
    return { triggered: true, reason: "sent", result };
  } catch (e) {
    console.error("[daily-report] maybeSendDailyReport failed:", e);
    return { triggered: false, reason: "error" };
  }
}

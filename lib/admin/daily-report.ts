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
//   3. Salaries coming up  — this month's Crew lines from the cashflow
//                            forecast (why recipients are an explicit list,
//                            not "all admins" — see app-settings).
//   4. Client comments     — unresolved comments clients left on posts.
//
// Runs from /api/cron/daily-admin-report (service role, no session), so every
// read here is deliberately agency-wide — same posture as the admin dashboard.
// Fail-soft everywhere: a broken section renders as empty rather than
// blocking the whole email.
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
  clientComments: ClientComment[];
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

  const [tasksRes, completionsRes, queueRes, crewRes, commentsRes] =
    await Promise.all([
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
        .select("label, amounts")
        .eq("year", year)
        .eq("section", "Crew")
        .order("sort_order", { ascending: true }),
      supabase
        .from("proofer_comments")
        .select("post_id, comment, created_by, created_at")
        .eq("author_role", "client")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20),
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

  // 3. Salaries — this month's Crew amounts from the cashflow forecast.
  const salaries: SalaryLine[] = [];
  if (!crewRes.error) {
    for (const row of (crewRes.data ?? []) as {
      label: string | null;
      amounts: unknown;
    }[]) {
      const amounts = Array.isArray(row.amounts) ? row.amounts : [];
      const amount = Number(amounts[monthIdx] ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        salaries.push({ name: row.label || "—", amount });
      }
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
    clientComments,
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

  // 3. Staff salaries coming up
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

  // 4. Client comments
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

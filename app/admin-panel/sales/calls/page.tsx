import { createClient } from "@/lib/supabase/server";
import { getDisplayTimezone } from "@/lib/app-settings";
import {
  capsulePartyUrl,
  getCapsuleOpenTasks,
  getCapsulePartyPhones,
  type CapsuleTask,
} from "@/lib/capsule";
import SalesTaskCalendar, {
  type TaskItem,
} from "@/app/admin-panel/components/SalesTaskCalendar";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Calendar tab — the sales tasks laid out like Capsule's own calendar.
//
// Merges two sources into one month grid (rendered by SalesTaskCalendar):
//   - Capsule CRM's calendar: every open task (each linked to a contact),
//     pulled live from the Capsule API. Needs CAPSULE_API_TOKEN configured;
//     without it the page still works and explains how to connect.
//   - The pipeline's own follow-up dates: pending opportunities from the
//     Opportunities tab that have a follow-up set.
//
// Membership is enforced by the sales layout (and RLS underneath for the
// pipeline rows).
// ---------------------------------------------------------------------------

function gbp(n: number): string {
  return "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function addDays(dayKey: string, days: number): string {
  const d = new Date(dayKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function capsuleItem(
  t: CapsuleTask,
  phones: Record<number, string>
): TaskItem {
  const extras = [t.categoryName, t.opportunityName, t.ownerName].filter(Boolean);
  return {
    key: `capsule-${t.id}`,
    source: "capsule",
    dueOn: t.dueOn,
    dueTime: t.dueTime,
    who: t.partyName || t.opportunityName || "(no contact)",
    what: t.description || t.detail || "Task",
    extra: extras.join(" · "),
    href: capsulePartyUrl(t.partyId),
    capsuleId: t.id,
    phone: t.partyId != null ? (phones[t.partyId] ?? null) : null,
  };
}

export default async function SalesCallsPage() {
  const supabase = await createClient();

  const tz = await getDisplayTimezone(supabase);
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Pipeline follow-ups: pending opportunities with a follow-up date. RLS
  // scopes this to admitted staff.
  const [capsuleRes, { data: followUpRows }] = await Promise.all([
    getCapsuleOpenTasks(),
    supabase
      .from("sales_opportunities")
      .select("id, company, amount, follow_up, notes")
      .eq("status", "pending")
      .not("follow_up", "is", null)
      .order("follow_up", { ascending: true })
      .limit(200),
  ]);

  // Phone numbers for the contacts on tasks near today (a month either way)
  // — the actionable window; further-out tasks just show the name.
  let phones: Record<number, string> = {};
  if (capsuleRes.ok) {
    const windowLo = addDays(todayKey, -31);
    const windowHi = addDays(todayKey, 31);
    phones = await getCapsulePartyPhones(
      capsuleRes.tasks
        .filter(
          (t) =>
            t.partyId != null &&
            t.dueOn != null &&
            t.dueOn >= windowLo &&
            t.dueOn <= windowHi
        )
        .map((t) => t.partyId as number)
    );
  }

  const items: TaskItem[] = [];
  if (capsuleRes.ok) {
    items.push(...capsuleRes.tasks.map((t) => capsuleItem(t, phones)));
  }
  for (const r of (followUpRows ?? []) as {
    id: number;
    company: string | null;
    amount: unknown;
    follow_up: string | null;
    notes: string | null;
  }[]) {
    const amount = r.amount == null ? null : Number(r.amount);
    items.push({
      key: `pipeline-${r.id}`,
      source: "pipeline",
      dueOn: r.follow_up,
      dueTime: null,
      who: r.company || "(unnamed)",
      what: "Follow up on the pitch",
      extra: [
        amount != null && Number.isFinite(amount) ? gbp(amount) : "",
        r.notes || "",
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/app/sales/opportunities",
      capsuleId: null,
      phone: null,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!capsuleRes.ok && !capsuleRes.configured && (
        <div
          style={{
            border: "1px dashed #d4d4d8",
            borderRadius: 12,
            padding: "14px 16px",
            background: "#fafafa",
            fontSize: 13,
            color: "#52525b",
            lineHeight: 1.5,
          }}
        >
          <strong>Capsule isn&apos;t connected yet.</strong> The calendar
          currently shows only the pipeline&apos;s follow-up dates. To bring in
          the Capsule tasks: in Capsule go to <em>My Preferences → API
          Authentication Tokens</em>, generate a token, and set it as the{" "}
          <code>CAPSULE_API_TOKEN</code> environment variable (plus{" "}
          <code>CAPSULE_SITE</code> — your Capsule subdomain — to make names
          link back to Capsule). Open Capsule tasks will then appear here
          automatically.
        </div>
      )}
      {!capsuleRes.ok && capsuleRes.configured && (
        <div
          style={{
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "12px 16px",
            background: "#fef2f2",
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          Couldn&apos;t load the Capsule tasks: {capsuleRes.error} Showing
          pipeline follow-ups only.
        </div>
      )}

      <SalesTaskCalendar items={items} todayKey={todayKey} />
    </div>
  );
}

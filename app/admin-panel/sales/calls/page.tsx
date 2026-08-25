import { createClient } from "@/lib/supabase/server";
import { getDisplayTimezone } from "@/lib/app-settings";
import {
  capsulePartyUrl,
  getCapsuleOpenTasks,
  type CapsuleTask,
} from "@/lib/capsule";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Call list tab — who to call, in date order.
//
// Merges two sources into one agenda:
//   - Capsule CRM's calendar: every open task (each linked to a contact),
//     pulled live from the Capsule API. Needs CAPSULE_API_TOKEN configured;
//     without it the page still works and explains how to connect.
//   - The pipeline's own follow-up dates: pending opportunities from the
//     Opportunities tab that have a follow-up set.
//
// Grouped Overdue / Today / Next 7 days / Later so the morning question —
// "who do I call today?" — is the top of the page. Membership is enforced by
// the sales layout (and RLS underneath for the pipeline rows).
// ---------------------------------------------------------------------------

type CallItem = {
  key: string;
  source: "capsule" | "pipeline";
  dueOn: string | null; // YYYY-MM-DD
  dueTime: string | null;
  who: string; // contact / company
  what: string; // task description / "Follow up on the pitch"
  extra: string; // opportunity, category, amount…
  href: string | null;
};

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

function gbp(n: number): string {
  return "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function capsuleItem(t: CapsuleTask): CallItem {
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
  const weekAheadKey = addDays(todayKey, 7);

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
      .limit(100),
  ]);

  const items: CallItem[] = [];
  if (capsuleRes.ok) items.push(...capsuleRes.tasks.map(capsuleItem));
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
      href: `/app/sales/opportunities`,
    });
  }

  items.sort((a, b) => {
    if (a.dueOn == null && b.dueOn == null) return a.key.localeCompare(b.key);
    if (a.dueOn == null) return 1;
    if (b.dueOn == null) return -1;
    return (
      a.dueOn.localeCompare(b.dueOn) ||
      (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99")
    );
  });

  const overdue = items.filter((i) => i.dueOn != null && i.dueOn < todayKey);
  const today = items.filter((i) => i.dueOn === todayKey);
  const thisWeek = items.filter(
    (i) => i.dueOn != null && i.dueOn > todayKey && i.dueOn <= weekAheadKey
  );
  const later = items.filter(
    (i) => i.dueOn == null || i.dueOn > weekAheadKey
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
          <strong>Capsule isn&apos;t connected yet.</strong> This list currently
          shows only the pipeline&apos;s follow-up dates. To bring in the Capsule
          calendar: in Capsule go to <em>My Preferences → API Authentication
          Tokens</em>, generate a token, and set it as the{" "}
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
          Couldn&apos;t load the Capsule calendar: {capsuleRes.error} Showing
          pipeline follow-ups only.
        </div>
      )}

      <Section
        title={`Overdue (${overdue.length})`}
        tone="#991b1b"
        items={overdue}
        showDate
        empty="Nothing overdue."
      />
      <Section
        title={`Today (${today.length})`}
        tone="#92400e"
        items={today}
        empty="No calls scheduled for today."
      />
      <Section
        title={`Next 7 days (${thisWeek.length})`}
        tone="#18181b"
        items={thisWeek}
        showDate
        empty="Nothing scheduled this week."
      />
      <Section
        title={`Later & undated (${later.length})`}
        tone="#71717a"
        items={later.slice(0, 25)}
        showDate
        empty="Nothing further out."
        note={
          later.length > 25
            ? `…and ${later.length - 25} more further out.`
            : undefined
        }
      />
    </div>
  );
}

function Section({
  title,
  tone,
  items,
  showDate,
  empty,
  note,
}: {
  title: string;
  tone: string;
  items: CallItem[];
  showDate?: boolean;
  empty: string;
  note?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          background: "#fafafa",
          borderBottom: "1px solid #e4e4e7",
          fontSize: 14,
          fontWeight: 700,
          color: tone,
        }}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "12px 16px", fontSize: 13, color: "#a1a1aa" }}>
          {empty}
        </div>
      ) : (
        <table
          style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}
        >
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td
                  style={{
                    padding: "8px 16px",
                    borderBottom: "1px solid #f4f4f5",
                  }}
                >
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.source === "capsule" ? "_blank" : undefined}
                      rel={item.source === "capsule" ? "noopener" : undefined}
                      style={{ fontWeight: 600, color: "#18181b", textDecoration: "none" }}
                    >
                      {item.who}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{item.who}</span>
                  )}
                  <span style={{ color: "#71717a" }}> — {item.what}</span>
                  {item.extra && (
                    <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>
                      {item.extra}
                    </div>
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 16px",
                    borderBottom: "1px solid #f4f4f5",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                    fontSize: 12,
                    color: "#71717a",
                  }}
                >
                  {showDate && item.dueOn ? dayLabel(item.dueOn) : ""}
                  {!item.dueOn && showDate ? "no date" : ""}
                  {item.dueTime ? ` ${item.dueTime}` : ""}
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: 8,
                      padding: "1px 7px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      color: item.source === "capsule" ? "#3730a3" : "#52525b",
                      background: item.source === "capsule" ? "#eef2ff" : "#f4f4f5",
                    }}
                  >
                    {item.source === "capsule" ? "CAPSULE" : "PIPELINE"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note && (
        <div style={{ padding: "8px 16px", fontSize: 12, color: "#a1a1aa" }}>
          {note}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// /portal/[clientId] — client dashboard.
//
// This is the room a client walks into. Three things, in order:
//   1. A short status sentence — "We're testing 4 ads, 2 are winning."
//   2. Top priorities for *this* client — what's pending, why it matters,
//      everything read-only.
//   3. Latest sent review (if any) — one-tap into the narrative.
//
// We deliberately keep counts and dollar amounts soft. The portal is for trust,
// not operating, so the visual hierarchy is "narrative first, numbers second".
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../admin-panel/lib/viewer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ad = {
  id: number;
  name: string;
  status: string | null;
  meta_status: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
};

type Action = {
  id: string;
  ad_id: number | null;
  problem: string | null;
  action: string | null;
  priority: string | null;
  created_at: string;
};

type Decision = {
  id: number;
  ad_id: number | null;
  type: string | null;
  reason: string | null;
  action: string | null;
  confidence: string | null;
  created_at: string;
};

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default async function PortalClientDashboard({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const supabase = await createClient();

  // Fetch ads first — we need their ids to scope ad_actions (ad_actions has
  // no client_id column, so the only way to scope is via ad_id IN (...)).
  const adsRes = await supabase
    .from("ads")
    .select("id, name, status, meta_status, spend, impressions, clicks, conversions")
    .eq("client_id", clientId);
  const ads = (adsRes.data ?? []) as Ad[];
  const adIds = ads.map((a) => a.id);

  const [actionsRes, decisionsRes, reviewsRes] = await Promise.all([
    adIds.length === 0
      ? Promise.resolve({ data: [] as Action[] })
      : supabase
          .from("ad_actions")
          .select("id, ad_id, problem, action, priority, created_at")
          .eq("status", "pending")
          .in("ad_id", adIds)
          .order("created_at", { ascending: false }),
    supabase
      .from("ad_decisions")
      .select("id, ad_id, type, reason, action, confidence, created_at")
      .eq("client_id", clientId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("id, period_label, headline, status, sent_at, approved_at")
      .eq("client_id", clientId)
      .in("status", ["sent", "approved"])
      .order("period_end", { ascending: false })
      .limit(1),
  ]);

  const actions = (actionsRes.data ?? []) as Action[];
  const decisions = (decisionsRes.data ?? []) as Decision[];
  const latestReview = ((reviewsRes.data ?? [])[0] ?? null) as
    | {
        id: number;
        period_label: string;
        headline: string | null;
        status: string;
        sent_at: string | null;
        approved_at: string | null;
      }
    | null;

  // ── Soft "what's happening" line ────────────────────────────────────────
  const activeAds = ads.filter(
    (a) => (a.status ?? "").toLowerCase() === "active"
  );
  const totalSpend = ads.reduce((s, a) => s + Number(a.spend ?? 0), 0);
  const totalConversions = ads.reduce(
    (s, a) => s + Number(a.conversions ?? 0),
    0
  );

  // Score the top three pending items the same way the admin dashboard does:
  // priority dominates, newest breaks ties.
  type Priority = {
    kind: "action" | "decision";
    rank: number;
    label: string;
    why: string | null;
    detail: string | null;
    adId: number | null;
    confidenceOrPriority: string;
    createdAt: string;
  };
  const priorities: Priority[] = [];
  for (const a of actions) {
    priorities.push({
      kind: "action",
      rank: PRIORITY_RANK[a.priority ?? "low"] ?? 1,
      label: a.problem ?? a.action ?? "Action proposed",
      why: a.problem ?? null,
      detail: a.action ?? null,
      adId: a.ad_id,
      confidenceOrPriority: a.priority ?? "low",
      createdAt: a.created_at,
    });
  }
  for (const d of decisions) {
    const conf = (d.confidence ?? "medium").toLowerCase();
    const rank = conf === "high" ? 3 : conf === "low" ? 1 : 2;
    priorities.push({
      kind: "decision",
      rank,
      label: d.reason ?? d.action ?? "Decision proposed",
      why: d.reason ?? null,
      detail: d.action ?? null,
      adId: d.ad_id,
      confidenceOrPriority: conf,
      createdAt: d.created_at,
    });
  }
  priorities.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const top = priorities.slice(0, 3);
  const remaining = priorities.length - top.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── Hero status line ───────────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#64748b",
          }}
        >
          Today
        </div>
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: 28,
            fontWeight: 700,
            color: "#0f172a",
            lineHeight: 1.25,
          }}
        >
          {activeAds.length === 0
            ? "No ads are running right now."
            : `${activeAds.length} ad${activeAds.length === 1 ? "" : "s"} running, ${totalConversions} conversion${totalConversions === 1 ? "" : "s"} this period.`}
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "#475569",
            lineHeight: 1.6,
            maxWidth: 680,
          }}
        >
          This is your read-only view. Everything you see here is the same data
          your operator works from — just without the editing controls. Open
          any ad to see the full audit trail of what we&rsquo;ve done and why.
        </p>
      </div>

      {/* ── Soft stat row ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {[
          { label: "Active ads", value: String(activeAds.length) },
          { label: "Total ads", value: String(ads.length) },
          {
            label: "Spend",
            value: `$${totalSpend.toFixed(0)}`,
          },
          { label: "Conversions", value: String(totalConversions) },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "16px 18px",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {stat.label}
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Top priorities ─────────────────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
            Top priorities
          </h2>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {priorities.length} pending
          </span>
        </div>
        <p style={{ margin: "4px 0 16px", fontSize: 12, color: "#64748b" }}>
          The three things on your operator&rsquo;s desk right now, ranked by
          priority. These are read-only — nothing here moves until your
          operator makes a call.
        </p>

        {top.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            Nothing pending. The room is calm.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {top.map((p, i) => (
              <div
                key={`${p.kind}-${i}`}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: 16,
                  background: "#f8fafc",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#0f172a",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {p.label}
                  </div>
                  {p.detail && p.detail !== p.label && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: "#475569",
                        lineHeight: 1.5,
                      }}
                    >
                      {p.detail}
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        background: p.kind === "action" ? "#fef3c7" : "#dbeafe",
                        color: p.kind === "action" ? "#92400e" : "#1e40af",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {p.kind}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {p.confidenceOrPriority}
                    </span>
                    {p.adId && (
                      <Link
                        href={`/portal/${clientId}/ads/${p.adId}`}
                        style={{
                          fontSize: 12,
                          color: "#1e40af",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Open audit trail →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {remaining > 0 && (
              <div style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 4 }}>
                + {remaining} more pending {remaining === 1 ? "item is" : "items are"} hidden.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Latest review ──────────────────────────────────────────────── */}
      {latestReview && (
        <section
          style={{
            background: "linear-gradient(135deg,#0f172a,#1e293b)",
            color: "#fff",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#94a3b8",
            }}
          >
            Latest review · {latestReview.period_label}
          </div>
          <h2
            style={{
              margin: "8px 0 0",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.25,
            }}
          >
            {latestReview.headline ?? "Review available"}
          </h2>
          <Link
            href={`/portal/${clientId}/reviews/${latestReview.id}`}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "10px 18px",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Read the full review →
          </Link>
        </section>
      )}
    </div>
  );
}

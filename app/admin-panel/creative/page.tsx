// ---------------------------------------------------------------------------
// /app/creative — cross-client creative library.
//
// One surface that pairs every ad's creative (thumbnail, hook, headline,
// CTA) with its outcome (status, key metrics, reason) and the system's
// suggested next move. The point is intelligence, not gallery: the top of
// the page surfaces aggregate "what's working" patterns so a strategist
// can think across creatives instead of one ad at a time.
//
// All filtering / sorting happens in the client wrapper — server just
// fetches, computes the summary, and ships.
// ---------------------------------------------------------------------------

import { createClient } from "@/lib/supabase/server";
import { capitalizeFirst } from "@/app/admin-panel/lib/utils";
import CreativeLibrary, { type CreativeCard } from "./CreativeLibrary";
import EngineNav from "@/app/admin-panel/components/EngineNav";
import CreativeLabPageClient, {
  type WeakAd,
} from "./CreativeLabPageClient";

export const dynamic = "force-dynamic";

type AdRow = {
  id: number;
  client_id: number;
  name: string;
  status: string | null;
  performance_status: string | null;
  performance_score: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  creative_image_url: string | null;
  creative_video_url: string | null;
  creative_body: string | null;
  creative_headline: string | null;
  creative_cta: string | null;
  creative_type: string | null;
  hook_type: string | null;
  format_style: string | null;
  created_at: string;
  clients: { id: number; name: string } | { id: number; name: string }[] | null;
};

type ActionRow = {
  ad_id: number | null;
  problem: string | null;
  action: string | null;
  status: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Reason / confidence / suggestion logic.
//
// These are intentionally rule-based and inspectable — the operator should
// always be able to look at the metrics and see why the system landed
// where it did. No black-box scoring here.
// ---------------------------------------------------------------------------

function computeMetrics(ad: AdRow) {
  const spend = Number(ad.spend ?? 0);
  const impressions = Number(ad.impressions ?? 0);
  const clicks = Number(ad.clicks ?? 0);
  const conversions = Number(ad.conversions ?? 0);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  return { spend, impressions, clicks, conversions, ctr, cpc };
}

function computeReason(
  ad: AdRow,
  m: ReturnType<typeof computeMetrics>
): string {
  const status = (ad.status ?? "").toLowerCase();
  const parts: string[] = [];
  if (m.ctr >= 1.5) parts.push(`strong CTR (${m.ctr.toFixed(2)}%)`);
  else if (m.ctr > 0 && m.ctr < 0.6 && m.impressions > 1000)
    parts.push(`weak CTR (${m.ctr.toFixed(2)}%)`);
  if (m.cpc > 0 && m.cpc < 1) parts.push(`low CPC ($${m.cpc.toFixed(2)})`);
  else if (m.cpc > 3) parts.push(`high CPC ($${m.cpc.toFixed(2)})`);
  if (m.conversions > 0) parts.push(`${m.conversions} conversions`);
  else if (m.spend > 50 && m.conversions === 0)
    parts.push("no conversions after meaningful spend");

  if (parts.length === 0) {
    if (m.spend < 5) return "Not enough spend to judge yet.";
    return status === "winner"
      ? "Holding steady with no clear weak signal."
      : "No standout signals one way or the other.";
  }
  return parts.join(", ");
}

function computeConfidence(
  m: ReturnType<typeof computeMetrics>
): "low" | "medium" | "high" {
  // Confidence is a function of spend depth + conversion volume — we don't
  // want to call something a winner after $3 of impressions.
  if (m.spend < 25 || m.impressions < 2000) return "low";
  if (m.spend > 200 && m.conversions >= 5) return "high";
  return "medium";
}

function computeSuggestion(
  ad: AdRow,
  m: ReturnType<typeof computeMetrics>
): { reuseLabel: string | null; suggestion: string | null } {
  const status = (ad.status ?? "").toLowerCase();
  const conf = computeConfidence(m);
  const hook = ad.hook_type;
  const format = ad.format_style;

  // Strong winners get a "reuse" label so the operator can move them into
  // playbook-style scaling next.
  if (status === "winner" && conf !== "low") {
    if (m.ctr >= 1.5 && m.cpc < 1) {
      return {
        reuseLabel: "Scale concept",
        suggestion: `Push budget on this concept and test variants of the ${
          hook?.replace(/_/g, " ") ?? "current"
        } hook.`,
      };
    }
    return { reuseLabel: "Reuse hook", suggestion: null };
  }

  // Losing creatives get a concrete next-test suggestion based on their
  // current variables, so the failed creative section is actionable rather
  // than decorative.
  if (status === "losing" || (m.ctr > 0 && m.ctr < 0.5 && m.spend > 30)) {
    if (format === "product_shot")
      return {
        reuseLabel: null,
        suggestion: "Static product shot underperforming — test a UGC video with a how-to hook.",
      };
    if (format === "text_heavy")
      return {
        reuseLabel: null,
        suggestion: "Text-heavy graphic underperforming — test a cleaner image with a curiosity hook.",
      };
    if (hook === "direct_offer")
      return {
        reuseLabel: null,
        suggestion: "Direct-offer hook isn't landing — test a problem-solution opener.",
      };
    return {
      reuseLabel: null,
      suggestion: "Underperforming — test a new hook variant before pausing.",
    };
  }

  return { reuseLabel: null, suggestion: null };
}

// Pull out the first 1–2 lines of body copy as the "hook" — the user's
// instinct that the opening phrase is where the real signal sits. We split
// on newlines first, then on punctuation if the body is one long run-on.
function extractHook(body: string | null): string | null {
  if (!body) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  const firstChunk = trimmed.split(/\n+/)[0];
  if (firstChunk.length <= 120) return firstChunk;
  // Punctuation fallback for run-on copy.
  const m = firstChunk.match(/^(.{20,140}?[.!?])\s/);
  return m ? m[1] : firstChunk.slice(0, 120) + "…";
}

export default async function CreativePage() {
  const supabase = await createClient();

  const { data: adsData } = await supabase
    .from("ads")
    .select(
      `id, client_id, name, status, performance_status, performance_score,
       spend, impressions, clicks, conversions,
       creative_image_url, creative_video_url, creative_body, creative_headline,
       creative_cta, creative_type, hook_type, format_style, created_at,
       clients(id, name)`
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const ads = (adsData ?? []) as AdRow[];

  // Pending action lookup so each card can show "what's already on the
  // operator's plate" before falling back to a system-generated suggestion.
  const adIds = ads.map((a) => a.id);
  let pendingByAd = new Map<number, string>();
  if (adIds.length > 0) {
    const { data: actionRows } = await supabase
      .from("ad_actions")
      .select("ad_id, problem, action, status, created_at")
      .eq("status", "pending")
      .in("ad_id", adIds)
      .order("created_at", { ascending: false });
    for (const a of (actionRows ?? []) as ActionRow[]) {
      if (!a.ad_id || pendingByAd.has(a.ad_id)) continue;
      pendingByAd.set(a.ad_id, a.action ?? a.problem ?? "Action pending");
    }
  }

  // Build cards.
  const cards: CreativeCard[] = ads.map((ad) => {
    const m = computeMetrics(ad);
    const reason = computeReason(ad, m);
    const confidence = computeConfidence(m);
    const { reuseLabel, suggestion } = computeSuggestion(ad, m);
    const hook = extractHook(ad.creative_body);
    const clientObj = Array.isArray(ad.clients) ? ad.clients[0] : ad.clients;

    return {
      id: ad.id,
      clientId: ad.client_id,
      clientName: clientObj?.name ?? "—",
      name: ad.name,
      status: ad.status,
      performanceStatus: ad.performance_status,
      performanceScore: ad.performance_score,
      imageUrl: ad.creative_image_url,
      videoUrl: ad.creative_video_url,
      body: ad.creative_body,
      headline: ad.creative_headline,
      hook,
      cta: ad.creative_cta,
      creativeType: ad.creative_type,
      hookType: ad.hook_type,
      formatStyle: ad.format_style,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      ctr: m.ctr,
      cpc: m.cpc,
      reason,
      pendingAction: pendingByAd.get(ad.id) ?? null,
      suggestedNextMove: suggestion,
      confidence,
      reuseLabel,
      createdAt: ad.created_at,
    };
  });

  // ── Intelligence summary ──────────────────────────────────────────────
  // Strategist-grade aggregates over the dataset. We only emit a finding
  // when there's a real gap between groups — no "video edges out image by
  // 2%" filler.
  const summary = computeIntelligenceSummary(cards);

  // Filter universes — only show options that actually exist in the data.
  const filterUniverse = {
    clients: dedupeClients(cards),
    formats: dedupeFormats(cards),
    hooks: dedupeHooks(cards),
  };

  // Weak-ad feed for the new Creative Lab surface.
  const weakAds: WeakAd[] = cards
    .filter((c) => {
      const status = (c.status ?? "").toLowerCase();
      return (
        status === "losing" ||
        (c.ctr > 0 && c.ctr < 0.9 && c.spend >= 20) ||
        (c.conversions === 0 && c.spend >= 40)
      );
    })
    .sort((a, b) => {
      const scoreA = a.ctr * 10 - a.spend / 10;
      const scoreB = b.ctr * 10 - b.spend / 10;
      return scoreA - scoreB;
    })
    .slice(0, 12)
    .map((c) => {
      const hookFallback = c.hook ?? c.headline ?? "Hook needs work.";
      const suggestionBase =
        c.suggestedNextMove ??
        "Refresh the opening line to be more scene-led and specific.";
      return {
        id: c.id,
        name: c.name,
        campaign:
          c.clientName !== "—" ? `${c.clientName} campaign` : "Active campaign",
        problem:
          c.ctr < 0.6
            ? "Weak hook"
            : c.conversions === 0 && c.spend > 40
            ? "Low conversion intent"
            : "Too generic",
        why:
          c.reason ||
          "Performance is soft enough to justify a creative refresh before pausing.",
        currentHook: hookFallback,
        image: c.imageUrl ?? "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
        primaryText:
          c.body ??
          "Current copy is underperforming relative to account benchmarks.",
        headline: c.headline ?? c.name,
        cta: c.cta ?? "Learn More",
        suggestions: [
          suggestionBase,
          "Lead with a concrete scene or benefit in the first 6-10 words.",
          "Tighten the opening to one clear promise and one clear CTA.",
        ],
      } satisfies WeakAd;
    });

  return (
    <div
      style={{
        padding: "32px 32px 80px",
        maxWidth: 1440,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <EngineNav />
      <div>
        <div
          style={{
            fontSize: 11,
            color: "#71717a",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Creative library
        </div>
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: 28,
            fontWeight: 700,
            color: "#18181b",
          }}
        >
          What&rsquo;s the creative actually doing?
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "#52525b",
            maxWidth: 700,
            lineHeight: 1.55,
          }}
        >
          Every active ad, paired with its evidence and the system&rsquo;s
          read. Filter to find a pattern, sort to find a winner or a loser,
          open any card to see the full audit trail.
        </p>
      </div>

      {/* Intelligence summary */}
      <CreativeIntelligence summary={summary} />

      <CreativeLabPageClient weakAds={weakAds} />

      <CreativeLibrary cards={cards} filterUniverse={filterUniverse} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intelligence summary
// ---------------------------------------------------------------------------

type SummaryFinding = {
  kind: "winner" | "warning" | "neutral";
  text: string;
};

function avgCtr(cards: CreativeCard[]): number {
  const valid = cards.filter((c) => c.impressions > 1000);
  if (valid.length === 0) return 0;
  return valid.reduce((s, c) => s + c.ctr, 0) / valid.length;
}

function computeIntelligenceSummary(cards: CreativeCard[]): SummaryFinding[] {
  const findings: SummaryFinding[] = [];
  if (cards.length < 4) return findings;

  // Format winrate (video vs image vs carousel)
  const byFormat = new Map<string, CreativeCard[]>();
  for (const c of cards) {
    const f = (c.creativeType ?? "").toLowerCase();
    if (!f) continue;
    const list = byFormat.get(f) ?? [];
    list.push(c);
    byFormat.set(f, list);
  }
  const formatCtrs = Array.from(byFormat.entries())
    .filter(([, list]) => list.length >= 3)
    .map(([f, list]) => ({ format: f, avg: avgCtr(list), n: list.length }))
    .sort((a, b) => b.avg - a.avg);

  if (formatCtrs.length >= 2) {
    const top = formatCtrs[0];
    const bottom = formatCtrs[formatCtrs.length - 1];
    if (top.avg > 0 && bottom.avg > 0) {
      const lift = ((top.avg - bottom.avg) / bottom.avg) * 100;
      if (lift >= 15) {
        findings.push({
          kind: "winner",
          text: `${capitalizeFirst(top.format)}s outperform ${bottom.format}s by ${lift.toFixed(0)}% on CTR (n=${top.n} vs ${bottom.n}).`,
        });
      }
    }
  }

  // Hook winrate
  const byHook = new Map<string, CreativeCard[]>();
  for (const c of cards) {
    if (!c.hookType) continue;
    const list = byHook.get(c.hookType) ?? [];
    list.push(c);
    byHook.set(c.hookType, list);
  }
  const hookCtrs = Array.from(byHook.entries())
    .filter(([, list]) => list.length >= 3)
    .map(([h, list]) => ({ hook: h, avg: avgCtr(list), n: list.length }))
    .sort((a, b) => b.avg - a.avg);

  if (hookCtrs.length >= 2 && hookCtrs[0].avg > 0) {
    findings.push({
      kind: "winner",
      text: `“${hookCtrs[0].hook.replace(/_/g, " ")}” hooks average the strongest CTR (${hookCtrs[0].avg.toFixed(2)}%, n=${hookCtrs[0].n}).`,
    });
  }

  // Biggest problem — worst-performing format with non-trivial spend
  const formatProblem = formatCtrs[formatCtrs.length - 1];
  if (formatProblem && formatProblem.avg > 0 && formatProblem.avg < 0.6) {
    findings.push({
      kind: "warning",
      text: `${capitalizeFirst(formatProblem.format)}s are dragging — average CTR ${formatProblem.avg.toFixed(2)}% across ${formatProblem.n} ads.`,
    });
  }

  // Most-tested hook (volume signal)
  if (hookCtrs.length > 0) {
    const mostTested = [...hookCtrs].sort((a, b) => b.n - a.n)[0];
    if (mostTested.n >= 5) {
      findings.push({
        kind: "neutral",
        text: `Most-tested hook: “${mostTested.hook.replace(/_/g, " ")}” (${mostTested.n} ads).`,
      });
    }
  }

  return findings;
}

function dedupeClients(cards: CreativeCard[]) {
  const map = new Map<number, string>();
  for (const c of cards) map.set(c.clientId, c.clientName);
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function dedupeFormats(cards: CreativeCard[]): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    if (c.creativeType) set.add(c.creativeType.toLowerCase());
  }
  return Array.from(set).sort();
}

function dedupeHooks(cards: CreativeCard[]): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    if (c.hookType) set.add(c.hookType);
  }
  return Array.from(set).sort();
}

function CreativeIntelligence({ summary }: { summary: SummaryFinding[] }) {
  if (summary.length === 0) return null;
  return (
    <section
      style={{
        background: "linear-gradient(135deg,#0f172a,#1e293b)",
        color: "#fff",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#94a3b8",
          fontWeight: 600,
        }}
      >
        Creative learnings
      </div>
      <h2
        style={{
          margin: "6px 0 14px",
          fontSize: 18,
          fontWeight: 700,
          color: "#fff",
        }}
      >
        Patterns across the library right now
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {summary.map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 10,
              borderLeft:
                f.kind === "winner"
                  ? "3px solid #4ade80"
                  : f.kind === "warning"
                    ? "3px solid #f87171"
                    : "3px solid #94a3b8",
            }}
          >
            <span
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "#e2e8f0",
              }}
            >
              {f.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

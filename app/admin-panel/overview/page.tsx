import EmptyState from "@/app/admin-panel/components/EmptyState";
import EngineNav from "@/app/admin-panel/components/EngineNav";
import { canRunAds } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

type AdRow = {
  id: number;
  name: string | null;
  ctr: number | null;
  spend: number | null;
  conversions: number | null;
};

type OutcomeRow = {
  id: number;
  decision_type: string | null;
  verdict: string | null;
  verdict_reason: string | null;
  baseline_ctr: number | null;
  baseline_spend_cents: number | null;
  followup_ctr: number | null;
  followup_spend_cents: number | null;
  measured_at: string | null;
  ads:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

function relOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function toDecisionActionLabel(type: string | null): string {
  if (type === "pause_ad" || type === "pause_or_replace") return "Paused";
  if (
    type === "increase_adset_budget" ||
    type === "decrease_adset_budget" ||
    type === "scale_budget"
  ) {
    return "Scaled";
  }
  if (type === "apply_known_fix" || type === "apply_winning_pattern") {
    return "Tested";
  }
  return "Updated";
}

function verdictLabel(verdict: string | null): "Positive" | "Neutral" | "Negative" {
  if (verdict === "positive") return "Positive";
  if (verdict === "negative") return "Negative";
  return "Neutral";
}

export default async function OverviewPage() {
  await canRunAds();

  try {
    const supabase = await createClient();
    const [adsRes, outcomesRes] = await Promise.all([
      supabase
        .from("ads")
        .select("id, name, ctr, spend, conversions")
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("decision_outcomes")
        .select(
          "id, decision_type, verdict, verdict_reason, baseline_ctr, baseline_spend_cents, followup_ctr, followup_spend_cents, measured_at, ads(name)"
        )
        .eq("status", "measured")
        .order("measured_at", { ascending: false })
        .limit(12),
    ]);

    const ads = (adsRes.data ?? []) as AdRow[];
    const outcomes = (outcomesRes.data ?? []) as OutcomeRow[];

    const spend = ads.reduce((sum, ad) => sum + Number(ad.spend ?? 0), 0);
    const conversions = ads.reduce(
      (sum, ad) => sum + Number(ad.conversions ?? 0),
      0
    );
    const avgCtr =
      ads.length > 0
        ? ads.reduce((sum, ad) => sum + Number(ad.ctr ?? 0), 0) / ads.length
        : 0;

    const sortableAds = ads
      .map((ad) => ({
        name: ad.name ?? "Untitled ad",
        ctr: Number(ad.ctr ?? 0),
      }))
      .filter((ad) => Number.isFinite(ad.ctr));

    const topAds = [...sortableAds]
      .sort((a, b) => b.ctr - a.ctr)
      .slice(0, 2);
    const weakAds = [...sortableAds]
      .sort((a, b) => a.ctr - b.ctr)
      .slice(0, 2);

    const recentDecisions = outcomes.slice(0, 3).map((row) => {
      const ad = relOne(row.ads);
      return {
        id: row.id,
        action: `${toDecisionActionLabel(row.decision_type)} ${ad?.name ?? "Unknown ad"}`,
        before: {
          ctr: Number(row.baseline_ctr ?? 0),
          spend: Number(row.baseline_spend_cents ?? 0) / 100,
        },
        after: {
          ctr: Number(row.followup_ctr ?? 0),
          spend: Number(row.followup_spend_cents ?? 0) / 100,
        },
        result: verdictLabel(row.verdict),
        insight:
          row.verdict_reason ?? "Outcome measured from the follow-up metrics window.",
      };
    });

    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f6f7f8_0%,#f2f4f7_52%,#edf1f4_100%)] text-slate-900">
        <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-6">
          <EngineNav />

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
            <p className="text-sm text-slate-500 mt-1">
              Quick understanding. No clutter.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
              <p className="text-sm text-slate-500">Spend (all live ads)</p>
              <p className="text-2xl font-semibold">£{formatNumber(spend)}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
              <p className="text-sm text-slate-500">Conversions</p>
              <p className="text-2xl font-semibold">{formatNumber(conversions)}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
              <p className="text-sm text-slate-500">CTR</p>
              <p className="text-2xl font-semibold">{avgCtr.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
              <h2 className="font-semibold mb-3">Top Ads</h2>
              {topAds.length === 0 ? (
                <div className="text-sm text-slate-500">No ad data available.</div>
              ) : (
                topAds.map((ad) => (
                  <div key={ad.name} className="flex justify-between text-sm py-2">
                    <span>{ad.name}</span>
                    <span className="font-medium text-emerald-600">
                      {ad.ctr.toFixed(2)}%
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
              <h2 className="font-semibold mb-3">Needs Attention</h2>
              {weakAds.length === 0 ? (
                <div className="text-sm text-slate-500">No ad data available.</div>
              ) : (
                weakAds.map((ad) => (
                  <div key={ad.name} className="flex justify-between text-sm py-2">
                    <span>{ad.name}</span>
                    <span className="font-medium text-red-500">
                      {ad.ctr.toFixed(2)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <h2 className="font-semibold mb-4">Recent Decisions</h2>
            {recentDecisions.length === 0 ? (
              <div className="text-sm text-slate-500">No measured outcomes yet.</div>
            ) : (
              recentDecisions.map((d) => (
                <div
                  key={d.id}
                  className="py-3 border-b last:border-none space-y-2"
                >
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-sm font-medium">{d.action}</span>
                    <span
                      className={`text-sm font-medium px-3 py-1 rounded-full ${
                        d.result === "Positive"
                          ? "bg-emerald-50 text-emerald-700"
                          : d.result === "Negative"
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {d.result}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    before: CTR {d.before.ctr.toFixed(2)}%, spend £
                    {d.before.spend.toFixed(0)} · after: CTR{" "}
                    {d.after.ctr.toFixed(2)}%, spend £{d.after.spend.toFixed(0)}
                  </div>
                  <div className="text-sm text-slate-600">{d.insight}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div style={{ padding: 20 }}>
        <EngineNav />
        <div style={{ marginTop: 12 }}>
          <EmptyState title="Unable to load overview" description={message} />
        </div>
      </div>
    );
  }
}

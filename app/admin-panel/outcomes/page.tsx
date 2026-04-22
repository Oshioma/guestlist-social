import EmptyState from "@/app/admin-panel/components/EmptyState";
import EngineNav from "@/app/admin-panel/components/EngineNav";
import { canRunAds } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

function actionLabel(type: string | null, adName: string) {
  const prefix =
    type === "pause_ad" || type === "pause_or_replace"
      ? "Paused"
      : type === "increase_adset_budget" ||
        type === "decrease_adset_budget" ||
        type === "scale_budget"
      ? "Scaled"
      : type === "apply_known_fix" || type === "apply_winning_pattern"
      ? "Tested"
      : "Updated";
  return `${prefix} ${adName}`;
}

function resultLabel(verdict: string | null): "Positive" | "Neutral" | "Negative" {
  if (verdict === "positive") return "Positive";
  if (verdict === "negative") return "Negative";
  return "Neutral";
}

export default async function OutcomesPage() {
  await canRunAds();

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("decision_outcomes")
      .select(
        "id, decision_type, verdict, verdict_reason, baseline_ctr, baseline_spend_cents, followup_ctr, followup_spend_cents, measured_at, ads(name)"
      )
      .eq("status", "measured")
      .order("measured_at", { ascending: false })
      .limit(40);

    const rows = (data ?? []) as OutcomeRow[];
    const positive = rows.filter((r) => r.verdict === "positive").length;
    const neutral = rows.filter((r) => r.verdict === "neutral").length;
    const negative = rows.filter((r) => r.verdict === "negative").length;
    const decisive = positive + neutral + negative;
    const accuracy = decisive > 0 ? Math.round((positive / decisive) * 100) : 0;

    const outcomes = rows.slice(0, 12).map((row) => {
      const ad = relOne(row.ads);
      const adName = ad?.name ?? "Unknown ad";
      return {
        id: row.id,
        action: actionLabel(row.decision_type, adName),
        before: {
          ctr: Number(row.baseline_ctr ?? 0),
          spend: Number(row.baseline_spend_cents ?? 0) / 100,
        },
        after: {
          ctr: Number(row.followup_ctr ?? 0),
          spend: Number(row.followup_spend_cents ?? 0) / 100,
        },
        result: resultLabel(row.verdict),
        insight:
          row.verdict_reason ?? "Measured using baseline vs follow-up metrics.",
      };
    });

    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f6f7f8_0%,#f2f4f7_52%,#edf1f4_100%)] text-slate-900">
        <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-6">
          <EngineNav />

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Outcomes</h1>
            <p className="text-sm text-slate-500 mt-1">
              Proof that the system is working.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500">Engine Accuracy</p>
            <p className="text-3xl font-semibold mt-1">{accuracy}%</p>
            <p className="text-sm text-slate-500 mt-2">
              Based on last {decisive} decisions
            </p>
          </div>

          <div className="space-y-4">
            {outcomes.length === 0 ? (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200 text-sm text-slate-500">
                No measured outcomes yet.
              </div>
            ) : (
              outcomes.map((o) => (
                <div
                  key={o.id}
                  className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200"
                >
                  <div className="flex justify-between items-start mb-3 gap-3">
                    <div>
                      <h2 className="font-semibold">{o.action}</h2>
                      <p className="text-sm text-slate-500">{o.insight}</p>
                    </div>
                    <span
                      className={`text-sm font-medium px-3 py-1 rounded-full ${
                        o.result === "Positive"
                          ? "bg-emerald-50 text-emerald-700"
                          : o.result === "Negative"
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {o.result}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-slate-500">Before</p>
                      <p>CTR: {o.before.ctr.toFixed(2)}%</p>
                      <p>Spend: £{o.before.spend.toFixed(0)}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-slate-500">After</p>
                      <p>CTR: {o.after.ctr.toFixed(2)}%</p>
                      <p>Spend: £{o.after.spend.toFixed(0)}</p>
                    </div>
                  </div>
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
          <EmptyState title="Unable to load outcomes" description={message} />
        </div>
      </div>
    );
  }
}

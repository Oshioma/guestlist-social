import {
  DEFAULT_ENGINE_THRESHOLDS,
  type EngineThresholds,
} from "../../../lib/app-settings";

export type AppPerformanceStatus = "winner" | "losing" | "testing" | "paused";

type AdForScoring = {
  status?: string | null;
  meta_status?: string | null;
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  ctr?: number | null;
  cpc?: number | null;
  conversions?: number | null;
  cost_per_result?: number | null;
};

export function getPerformanceScore(
  ad: AdForScoring,
  t: EngineThresholds = DEFAULT_ENGINE_THRESHOLDS
): number {
  const spend = Number(ad.spend ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const cpc = Number(ad.cpc ?? 0);
  const conversions = Number(ad.conversions ?? 0);
  const costPerResult = Number(ad.cost_per_result ?? 0);
  const impressions = Number(ad.impressions ?? 0);

  let score = 0;

  if (ctr >= t.goodCtr) score += 2;
  if (ctr > 0 && ctr < t.badCtr) score -= 2;

  if (conversions >= 1) score += 3;
  if (spend >= t.minSpendToJudge && conversions === 0) score -= 2;

  if (cpc > 0 && cpc <= t.goodCpc) score += 2;
  if (cpc >= t.badCpc) score -= 2;

  if (costPerResult > 0 && costPerResult <= t.maxCostPerResult) score += 2;
  if (costPerResult > t.maxCostPerResult) score -= 2;

  if (impressions >= t.minImpressionsToJudge) score += 1;

  return score;
}

export function getAppPerformanceStatus(
  ad: AdForScoring,
  t: EngineThresholds = DEFAULT_ENGINE_THRESHOLDS
): AppPerformanceStatus {
  const metaStatus = String(ad.meta_status ?? ad.status ?? "").toLowerCase();
  const spend = Number(ad.spend ?? 0);
  const impressions = Number(ad.impressions ?? 0);

  if (metaStatus.includes("paused")) return "paused";

  const hasEnoughData =
    spend >= t.minSpendToJudge || impressions >= t.minImpressionsToJudge;

  if (!hasEnoughData) return "testing";

  const score = getPerformanceScore(ad, t);

  if (score >= 3) return "winner";
  if (score <= -2) return "losing";
  return "testing";
}

export function explainPerformanceStatus(
  ad: AdForScoring,
  t: EngineThresholds = DEFAULT_ENGINE_THRESHOLDS
): string {
  const status = getAppPerformanceStatus(ad, t);
  const spend = Number(ad.spend ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const conversions = Number(ad.conversions ?? 0);
  const cpc = Number(ad.cpc ?? 0);

  if (status === "paused") return "Paused in Meta.";
  if (status === "testing") {
    if (spend < t.minSpendToJudge) return "Still gathering enough spend to judge.";
    return "Mixed signals. Keep testing.";
  }
  if (status === "winner") {
    if (conversions > 0) return "Strong enough performance with conversions.";
    if (ctr >= t.goodCtr && cpc <= t.goodCpc) return "Strong CTR with efficient clicks.";
    return "Performance is clearly above threshold.";
  }
  if (conversions === 0 && spend >= t.minSpendToJudge) {
    return "Spent enough to judge, but no conversions yet.";
  }
  if (ctr < t.badCtr) return "Low CTR after meaningful delivery.";
  if (cpc >= t.badCpc) return "Clicks are too expensive.";
  return "Performance is below threshold.";
}

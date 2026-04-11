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

const MIN_SPEND_TO_JUDGE = 10;
const MIN_IMPRESSIONS_TO_JUDGE = 1000;
const GOOD_CTR = 2.0;
const BAD_CTR = 1.0;
const GOOD_CPC = 1.5;
const BAD_CPC = 3.0;
const MAX_COST_PER_RESULT = 8;

export function getPerformanceScore(ad: AdForScoring): number {
  const spend = Number(ad.spend ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const cpc = Number(ad.cpc ?? 0);
  const conversions = Number(ad.conversions ?? 0);
  const costPerResult = Number(ad.cost_per_result ?? 0);
  const impressions = Number(ad.impressions ?? 0);

  let score = 0;

  if (ctr >= GOOD_CTR) score += 2;
  if (ctr > 0 && ctr < BAD_CTR) score -= 2;

  if (conversions >= 1) score += 3;
  if (spend >= MIN_SPEND_TO_JUDGE && conversions === 0) score -= 2;

  if (cpc > 0 && cpc <= GOOD_CPC) score += 2;
  if (cpc >= BAD_CPC) score -= 2;

  if (costPerResult > 0 && costPerResult <= MAX_COST_PER_RESULT) score += 2;
  if (costPerResult > MAX_COST_PER_RESULT) score -= 2;

  if (impressions >= MIN_IMPRESSIONS_TO_JUDGE) score += 1;

  return score;
}

export function getAppPerformanceStatus(ad: AdForScoring): AppPerformanceStatus {
  const metaStatus = String(ad.meta_status ?? ad.status ?? "").toLowerCase();
  const spend = Number(ad.spend ?? 0);
  const impressions = Number(ad.impressions ?? 0);

  if (metaStatus.includes("paused")) return "paused";

  const hasEnoughData =
    spend >= MIN_SPEND_TO_JUDGE || impressions >= MIN_IMPRESSIONS_TO_JUDGE;

  if (!hasEnoughData) return "testing";

  const score = getPerformanceScore(ad);

  if (score >= 3) return "winner";
  if (score <= -2) return "losing";
  return "testing";
}

export function explainPerformanceStatus(ad: AdForScoring): string {
  const status = getAppPerformanceStatus(ad);
  const spend = Number(ad.spend ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const conversions = Number(ad.conversions ?? 0);
  const cpc = Number(ad.cpc ?? 0);

  if (status === "paused") return "Paused in Meta.";
  if (status === "testing") {
    if (spend < MIN_SPEND_TO_JUDGE) return "Still gathering enough spend to judge.";
    return "Mixed signals. Keep testing.";
  }
  if (status === "winner") {
    if (conversions > 0) return "Strong enough performance with conversions.";
    if (ctr >= GOOD_CTR && cpc <= GOOD_CPC) return "Strong CTR with efficient clicks.";
    return "Performance is clearly above threshold.";
  }
  if (conversions === 0 && spend >= MIN_SPEND_TO_JUDGE) {
    return "Spent enough to judge, but no conversions yet.";
  }
  if (ctr < BAD_CTR) return "Low CTR after meaningful delivery.";
  if (cpc >= BAD_CPC) return "Clicks are too expensive.";
  return "Performance is below threshold.";
}

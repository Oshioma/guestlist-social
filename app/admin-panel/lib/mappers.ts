import type {
  Action,
  Ad,
  Client,
  Creative,
  Report,
  Suggestion,
} from "./types";
import {
  getAppPerformanceStatus,
  getPerformanceScore,
  explainPerformanceStatus,
} from "./performance-truth";

export function mapClientStatus(status: string): Client["status"] {
  if (status === "growing" || status === "active") return "active";
  if (status === "needs_attention" || status === "paused") return "paused";
  return "onboarding";
}

export function mapAdStatus(status: string): Ad["status"] {
  if (status === "winner") return "active";
  if (status === "paused") return "paused";
  if (status === "losing") return "ended";
  return "draft";
}

export function mapCreativeStatus(performance: string): Creative["status"] {
  if (performance === "winner") return "approved";
  if (performance === "losing") return "rejected";
  return "pending";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbAdToUiAd(row: any): Ad {
  const impressions = Number(row.impressions ?? 0);
  const clicks = Number(row.clicks ?? 0);
  const spend = Number(row.spend ?? 0);
  const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
  const cpc = clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0;
  const conversions = Number(row.conversions ?? 0);
  const costPerResult = Number(row.cost_per_result ?? 0);

  const adForScoring = {
    status: row.status,
    meta_status: row.meta_status,
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    conversions,
    cost_per_result: costPerResult,
  };

  const perfStatus = getAppPerformanceStatus(adForScoring);
  const perfScore = getPerformanceScore(adForScoring);
  const perfReason = explainPerformanceStatus(adForScoring);

  // Map performance status to UI status
  const statusMap: Record<string, Ad["status"]> = {
    winner: "active",
    losing: "ended",
    paused: "paused",
    testing: "draft",
  };

  return {
    id: row.id,
    clientId: row.client_id,
    campaignId: row.campaign_id ?? null,
    name: row.name ?? "Untitled ad",
    platform: row.platform ?? "Meta",
    status: statusMap[perfStatus] ?? "draft",
    spend,
    impressions,
    clicks,
    ctr,
    conversions,
    cpc,
    costPerResult,
    performanceStatus: perfStatus,
    performanceScore: perfScore,
    performanceReason: perfReason,
    metaId: row.meta_id ?? null,
    adsetMetaId: row.adset_meta_id ?? null,
    creativeImageUrl: row.creative_image_url ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbClientToUiClient(row: any, adCount: number): Client {
  return {
    id: row.id,
    name: row.name ?? "Untitled client",
    status: mapClientStatus(row.status ?? "testing"),
    platform: row.platform ?? "Meta",
    monthlyBudget: Number(row.monthly_budget ?? 0),
    adCount,
    lastActivity: row.updated_at ?? row.created_at ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbActionToUiAction(row: any, clientName: string): Action {
  const rawStatus = String(row.status ?? "open");
  const status =
    rawStatus === "open" || rawStatus === "in_progress" || rawStatus === "completed"
      ? (rawStatus as Action["status"])
      : ("open" as const);

  return {
    id: row.id,
    label: row.title ?? "Untitled action",
    clientName,
    due: row.created_at ?? "",
    done: Boolean(row.is_complete),
    status,
    workNote: row.work_note ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbSuggestionToUiSuggestion(row: any): Suggestion {
  const priority =
    row.priority === "high" || row.priority === "medium" || row.priority === "low"
      ? row.priority
      : "medium";

  return {
    id: row.id,
    title: priority ? `${String(priority).toUpperCase()} priority` : "Suggestion",
    description: row.text ?? "",
    priority,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbCreativeToUiCreative(row: any): Creative {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.title ?? "Untitled creative",
    type:
      row.type === "image" || row.type === "video" || row.type === "carousel"
        ? row.type
        : "image",
    status: mapCreativeStatus(row.performance ?? "testing"),
    createdAt: row.created_at ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbReportToUiReport(row: any, clientName: string): Report {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName,
    title: row.title ?? "Untitled report",
    period: row.period ?? "",
    createdAt: row.created_at ?? "",
  };
}

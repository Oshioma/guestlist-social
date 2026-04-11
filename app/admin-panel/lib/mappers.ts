import type {
  Action,
  Ad,
  Client,
  Creative,
  Report,
  Suggestion,
} from "./types";

export function mapClientStatus(status: string): Client["status"] {
  if (status === "growing") return "active";
  if (status === "needs_attention") return "paused";
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

  return {
    id: row.id,
    clientId: row.client_id,
    campaignId: row.campaign_id ?? null,
    name: row.name ?? "Untitled ad",
    platform: row.platform ?? "Meta",
    status: mapAdStatus(row.status ?? "testing"),
    spend: Number(row.spend ?? 0),
    impressions,
    clicks,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(1)) : 0,
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

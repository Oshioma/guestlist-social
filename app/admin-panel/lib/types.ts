export type ClientStatus = "active" | "paused" | "onboarding";
export type AdStatus = "active" | "paused" | "draft" | "ended";
export type CreativeStatus = "approved" | "pending" | "rejected";
export type CreativeType = "image" | "video" | "carousel";
export type Priority = "high" | "medium" | "low";
export type Trend = "up" | "down" | "flat";

export type Client = {
  id: string;
  name: string;
  status: ClientStatus;
  platform: string;
  monthlyBudget: number;
  adCount: number;
  lastActivity: string;
};

export type Ad = {
  id: string;
  clientId: string;
  campaignId: string | null;
  name: string;
  platform: string;
  status: AdStatus;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

export type Creative = {
  id: string;
  clientId: string;
  name: string;
  type: CreativeType;
  status: CreativeStatus;
  createdAt: string;
};

export type Report = {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  period: string;
  createdAt: string;
};

export type Suggestion = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
};

export type Stat = {
  label: string;
  value: string;
  change?: string;
  trend?: Trend;
};

export type ActionStatus = "open" | "in_progress" | "completed";

export type Action = {
  id: string;
  label: string;
  clientName: string;
  due: string;
  done: boolean;
  status: ActionStatus;
  workNote: string;
};

export type MemoryEntry = {
  id: string;
  clientId: string;
  clientName: string;
  note: string;
  createdAt: string;
  tag: string;
};

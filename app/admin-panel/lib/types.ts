export type ClientStatus = "active" | "paused" | "onboarding";
export type AdStatus = "active" | "paused" | "draft" | "ended";
export type AppPerformanceStatus = "winner" | "losing" | "testing" | "paused";
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
  conversions: number;
  cpc: number;
  costPerResult: number;
  performanceStatus: AppPerformanceStatus;
  performanceScore: number;
  performanceReason: string;
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

export type ContentStatus =
  | "not_started"
  | "in_progress"
  | "proof"
  | "complete";

export type ContentProgress = {
  id: string;
  clientId: string;
  month: string;
  status: ContentStatus;
};

export type VideoIdea = {
  id: string;
  clientId: string;
  themeId: string | null;
  pillarId: string | null;
  idea: string;
  notes: string;
  category: string;
  month: string;
  designLink: string;
  usedInPostId: string | null;
  createdBy: string;
  createdAt: string;
};

export type ContentTheme = {
  id: string;
  clientId: string;
  monthLabel: string;
  theme: string;
  goal: string;
  notes: string;
  sortOrder: number;
};

export type CarouselIdea = {
  id: string;
  clientId: string;
  themeId: string | null;
  pillarId: string | null;
  idea: string;
  notes: string;
  category: string;
  month: string;
  captions: string[];
  captionImages: string[];
  designLink: string;
  usedInPostId: string | null;
  createdBy: string;
  createdAt: string;
};

export type CarouselTheme = {
  id: string;
  clientId: string;
  monthLabel: string;
  theme: string;
  goal: string;
  notes: string;
  sortOrder: number;
};

export type StoryIdea = {
  id: string;
  clientId: string;
  themeId: string | null;
  pillarId: string | null;
  idea: string;
  notes: string;
  category: string;
  month: string;
  designLink: string;
  usedInPostId: string | null;
  createdBy: string;
  createdAt: string;
};

export type IdeaKind = "video" | "carousel" | "story";

export type StoryTheme = {
  id: string;
  clientId: string;
  monthLabel: string;
  theme: string;
  goal: string;
  notes: string;
  sortOrder: number;
};

export type TaskCategory =
  | "video"
  | "story"
  | "carousel"
  | "design"
  | "general";

export type TaskStatus = "open" | "in_progress" | "completed";

export type TaskRecurrence = "none" | "weekly" | "monthly";

export type Task = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  assignee: string;
  createdBy: string;
  dueDate: string;
  status: TaskStatus;
  recurrence: TaskRecurrence;
  createdAt: string;
  updatedAt: string;
};

export type ProoferStatus =
  | "none"
  | "improve"
  | "check"
  | "proofed"
  | "approved";

export type ProoferPlatform =
  | "instagram_feed"
  | "instagram_story"
  | "instagram_reel"
  | "facebook";

export const PROOFER_PLATFORMS: ProoferPlatform[] = [
  "instagram_feed",
  "instagram_story",
  "instagram_reel",
  "facebook",
];

export const PROOFER_PLATFORM_LABELS: Record<ProoferPlatform, string> = {
  instagram_feed: "IG Feed",
  instagram_story: "IG Story",
  instagram_reel: "IG Reel",
  facebook: "Facebook",
};

export type ProoferComment = {
  id: string;
  postId: string;
  comment: string;
  createdBy: string;
  resolved: boolean;
  createdAt: string;
};

export type PublishQueuePlatform = "instagram" | "facebook";

export type PublishQueueStatus =
  | "queued"
  | "scheduled"
  | "published"
  | "failed";

export type ProoferPublishQueueItem = {
  id: string;
  postId: string;
  platform: PublishQueuePlatform;
  status: PublishQueueStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  publishUrl: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  insightsReach: number | null;
  insightsImpressions: number | null;
  insightsEngagement: number | null;
  insightsLikes: number | null;
  insightsComments: number | null;
  insightsFetchedAt: string | null;
};

export type ContentPillar = {
  id: string;
  clientId: string;
  name: string;
  color: string;
  description: string;
  sortOrder: number;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProoferPost = {
  id: string;
  clientId: string;
  postDate: string; // "YYYY-MM-DD"
  platform: ProoferPlatform;
  pillarId: string | null;
  linkedIdeaId: string | null;
  linkedIdeaKind: IdeaKind | null;
  caption: string;
  imageUrl: string;
  mediaUrls: string[];
  status: ProoferStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  comments?: ProoferComment[];
  publishQueue?: ProoferPublishQueueItem[];
};

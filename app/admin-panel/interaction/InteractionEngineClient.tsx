"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addInteractionSearch,
  listInteractionSearches,
  removeInteractionSearch,
  saveInteractionDecision,
  type DecisionKind,
  type PersistedDecision,
  type SavedSearch,
  type SearchKind,
} from "./actions";

type DiscoveredComment = {
  id: string;
  author: string;
  text: string;
  time: string;
  likeCount: number | null;
};

type DiscoveredPost = {
  id: string;
  author: string;
  authorFollowers: number | null;
  text: string;
  time: string;
  permalink: string | null;
  mediaUrl: string;
  likeCount: number | null;
  commentCount: number | null;
  comments: DiscoveredComment[];
  source: "business_discovery" | "mentions" | "hashtag";
};

type DiscoveredPage = {
  id: string;
  name: string;
  handle: string | null;
  url: string | null;
  fans: number | null;
  avatar: string | null;
  description: string | null;
};

type PostStatus = "new" | "approved" | "skipped" | "saved";
type FetchState = "idle" | "loading" | "success" | "error";
type Tab =
  | "Feed"
  | "Discovery"
  | "Saved Audiences"
  | "Competitors"
  | "Playbook"
  | "Results"
  | "Learnings";

type ClientOption = {
  id: string;
  name: string;
  handle: string;
  tokenExpiresAt?: string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
};

type SetupIssue =
  | { kind: "missing-supabase" }
  | { kind: "no-accounts" }
  | null;

function statusFromDecision(decision: DecisionKind): PostStatus {
  return decision; // approved/saved/skipped line up 1:1
}

// Turn the real poster/island signals into the relevance/opportunity/risk
// triplet the UI expects. Replaces the previous `80 + random()` scoring.
function deriveScores(input: {
  text: string;
  posterType: "tourist" | "creator" | "spam";
  posterScore: number;
  onIslandNow: boolean;
  islandSignals: string[];
  followerCount: number | null;
  engagementRate: number | null;
  minutesAgo: number;
}): { relevance: number; opportunity: number; risk: number } {
  const text = input.text.toLowerCase();
  const isQuestion = /\?|\b(any|where|how|what|which|recommend)\b/.test(text);
  const hasLink = /https?:\/\//i.test(text);
  const shortText = input.text.trim().length < 6;

  // Relevance: does this comment match what we care about?
  let relevance = 45;
  if (input.islandSignals.length > 0) relevance += 20;
  if (input.onIslandNow) relevance += 15;
  if (isQuestion) relevance += 10;
  if (input.posterType === "creator") relevance += 8;
  if (input.posterType === "spam") relevance -= 30;
  relevance = Math.max(1, Math.min(100, relevance));

  // Opportunity: how valuable is replying here?
  let opportunity = Math.round(input.posterScore * 0.6) + 25;
  if (input.followerCount && input.followerCount > 1000) {
    opportunity += Math.min(15, Math.log10(input.followerCount) * 4);
  }
  if (input.engagementRate && input.engagementRate > 2) opportunity += 6;
  if (input.onIslandNow) opportunity += 8;
  if (input.minutesAgo <= 60) opportunity += 6;
  else if (input.minutesAgo > 360) opportunity -= 10;
  if (input.posterType === "spam") opportunity = 5;
  opportunity = Math.max(1, Math.min(100, Math.round(opportunity)));

  // Risk: how badly could a reply go wrong?
  let risk = 10;
  if (input.posterType === "spam") risk += 60;
  if (hasLink) risk += 20;
  if (shortText) risk += 15;
  if (!input.islandSignals.length && !isQuestion) risk += 8;
  if (input.posterType === "creator" && !hasLink) risk -= 5;
  risk = Math.max(1, Math.min(100, risk));

  return { relevance, opportunity, risk };
}

type Tone = "safe" | "engaging" | "bold";
type DiscoveryIntent = "buyer" | "browsing" | "low";
type SourceType = "tourist" | "creator" | "local";
type CommentOption = {
  id: string;
  tone: Tone;
  text: string;
  winProbability: number;
  why: string;
};
type Post = {
  id: string;
  clientId: string;
  author: string;
  platform: string;
  time: string;
  text: string;
  relevance: number;
  opportunity: number;
  risk: number;
  comment: string;
  mediaUrl: string;
  permalink?: string | null;
  status: PostStatus;
  why: string[];
  posterType?: "tourist" | "creator" | "spam";
  followerCount?: number | null;
  engagementRate?: number | null;
  posterScore?: number;
  posterReasons?: string[];
  onIslandNow?: boolean;
  islandSignals?: string[];
  comments?: CommentOption[];
  replyCount?: number;
  intent?: DiscoveryIntent;
  savedSearch?: string;
  sourceType?: SourceType;
  verified?: boolean;
};

type PosterType = "tourist" | "creator" | "spam";

type DiscoveryPost = {
  id: string;
  author: string;
  platform: string;
  time: string;
  text: string;
  relevance: number;
  opportunity: number;
  risk: number;
  status: PostStatus;
  comments: CommentOption[];
  replyCount: number;
  intent: DiscoveryIntent;
  savedSearch?: string;
  sourceType?: SourceType;
  verified?: boolean;
};

type InstagramCommentApiItem = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  permalink?: string;
  mediaUrl?: string;
  posterType?: PosterType;
  followerCount?: number | null;
  engagementRate?: number | null;
  posterScore?: number;
  posterReasons?: string[];
  onIslandNow?: boolean;
  islandSignals?: string[];
};

// Meta's CDN (scontent.cdninstagram.com / fbcdn.net) blocks hotlinking
// from third-party domains — the image request carries a browser referer
// that fails the CDN signature check. We tunnel those through our own
// proxy route which swaps the referer server-side. Non-Meta hosts (e.g.
// Unsplash for demo fixtures) load directly.
function proxiedMediaUrl(url: string | null | undefined): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/admin/proxy-image")) return raw;
  try {
    const host = new URL(raw).hostname;
    if (/cdninstagram|fbcdn|instagram\.com|facebook\.com/i.test(host)) {
      return `/api/admin/proxy-image?url=${encodeURIComponent(raw)}`;
    }
    return raw;
  } catch {
    return "";
  }
}

type InstagramCommentsApiResponse = {
  ok: boolean;
  comments?: InstagramCommentApiItem[];
  fetched?: number;
  error?: string;
  tokenExpired?: boolean;
};

const DISCOVERY_HASHTAGS: { tag: string; category: string; volume: string; intent: string }[] = [];

const DISCOVERY_KEYWORDS: { keyword: string; category: string; priority: string }[] = [];

const INITIAL_POSTS: Post[] = [];

const AUDIENCE_SETS: { id: string; title: string; description: string; count: number; status: string }[] = [];

const COMPETITORS: { id: string; handle: string; description: string; overlap: string }[] = [];

const PLAYBOOK = {
  tone: ["Helpful first", "Local detail", "Warm", "Natural confidence"],
  dos: [
    "Mention local specifics when genuinely helpful.",
    "Lead with value before any recommendation.",
    "Keep comments natural and lightly conversational.",
  ],
  avoids: [
    "Do not sound like an ad in comments.",
    "Avoid vague compliments with no substance.",
    "Do not overuse emojis or sales language.",
  ],
};

const RESULTS: { id: string; label: string; value: string }[] = [];

const LEARNINGS: string[] = [];

const DISCOVERY_RESULTS: DiscoveryPost[] = [];

function parseMinutes(time: string) {
  const n = parseInt(time, 10);
  if (Number.isNaN(n)) return 180;
  if (time.includes("m")) return n;
  if (time.includes("h")) return n * 60;
  return 180;
}

function getIntentWeight(intent: DiscoveryIntent) {
  if (intent === "buyer") return 14;
  if (intent === "browsing") return 4;
  return -8;
}

function getReplyCompetitionWeight(replyCount: number) {
  if (replyCount === 0) return 10;
  if (replyCount <= 2) return 6;
  if (replyCount <= 5) return 2;
  if (replyCount <= 10) return -4;
  return -10;
}

function getFreshnessWeight(time: string) {
  const minutes = parseMinutes(time);
  if (minutes <= 15) return 12;
  if (minutes <= 30) return 8;
  if (minutes <= 60) return 3;
  if (minutes <= 120) return -4;
  return -10;
}

function getDiscoveryScore(post: DiscoveryPost) {
  const base = post.relevance * 0.34 + post.opportunity * 0.38 + (100 - post.risk) * 0.12;
  const weighted =
    base +
    getIntentWeight(post.intent) +
    getReplyCompetitionWeight(post.replyCount) +
    getFreshnessWeight(post.time);
  return Math.max(1, Math.round(weighted));
}

function getUrgency(score: number) {
  if (score >= 85) return { label: "Hot", style: "bg-black text-white border-black" };
  if (score >= 72) return { label: "Active", style: "bg-gray-100 text-gray-700 border-gray-200" };
  return { label: "Low", style: "bg-gray-50 text-gray-400 border-gray-200" };
}

function getIntentStyle(intent: DiscoveryIntent) {
  if (intent === "buyer") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (intent === "browsing") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function getSourceStyle(sourceType?: SourceType) {
  if (sourceType === "tourist") return "bg-sky-50 text-sky-700 border-sky-200";
  if (sourceType === "creator") return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

function getIslandSignals(text: string) {
  const normalized = text.toLowerCase();
  const signals: string[] = [];
  if (normalized.includes("zanzibar")) signals.push("Zanzibar");
  if (normalized.includes("kendwa")) signals.push("Kendwa");
  if (normalized.includes("nungwi")) signals.push("Nungwi");
  return signals;
}

function toOperatorPost(post: DiscoveryPost, clientId: string): Post {
  const best = [...post.comments].sort((a, b) => b.winProbability - a.winProbability)[0];
  const signals = getIslandSignals(post.text);
  const onIslandNow = /(\bnow\b|\btonight\b|\bright now\b|\bcurrently\b)/i.test(post.text);
  return {
    id: post.id,
    clientId,
    author: post.author,
    platform: post.platform,
    time: post.time,
    text: post.text,
    relevance: post.relevance,
    opportunity: post.opportunity,
    risk: post.risk,
    comment: best?.text ?? "Helpful local recommendation based on intent and timing.",
    mediaUrl:
      "https://images.unsplash.com/photo-1504674900247-ec6e0c6c1c9c?auto=format&fit=crop&w=1200&q=80",
    status: "new",
    why: [
      "Discovered from saved search",
      `Intent: ${post.intent}`,
      `Competition: ${post.replyCount} replies`,
    ],
    posterType: post.sourceType === "creator" ? "creator" : "tourist",
    followerCount: null,
    engagementRate: null,
    posterScore: Math.min(100, Math.max(10, getDiscoveryScore(post))),
    onIslandNow,
    islandSignals: signals,
    comments: post.comments,
    replyCount: post.replyCount,
    intent: post.intent,
    savedSearch: post.savedSearch,
    sourceType: post.sourceType,
    verified: post.verified,
  };
}

function getEngageScore(post: Post) {
  const posterWeight = post.posterScore != null ? post.posterScore : 60;
  const posterPenalty = post.posterType === "spam" ? 20 : 0;
  const onIslandBoost = post.onIslandNow ? 12 : 0;
  return Math.max(
    1,
    Math.round(
      post.relevance * 0.33 +
        post.opportunity * 0.34 +
        (100 - post.risk) * 0.13 +
        posterWeight * 0.2 -
        posterPenalty +
        onIslandBoost
    )
  );
}

function getPosterTypeBadge(type?: PosterType) {
  if (type === "creator") {
    return {
      label: "Creator",
      className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
  }
  if (type === "spam") {
    return {
      label: "Spam risk",
      className: "bg-rose-50 text-rose-700 border-rose-200",
    };
  }
  return {
    label: "Tourist",
    className: "bg-teal-50 text-teal-700 border-teal-200",
  };
}

function formatCompactCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

function getTimingBadge(time: string) {
  const minutes = parseInt(time, 10);
  if (time.includes("m") && !Number.isNaN(minutes)) {
    if (minutes <= 30)
      return { label: "Hot", className: "bg-red-50 text-red-600 border-red-200" };
    if (minutes <= 59)
      return { label: "Cooling", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: "Late", className: "bg-slate-100 text-slate-600 border-slate-200" };
}

function getStatusBadge(status: PostStatus) {
  if (status === "approved")
    return { label: "Approved", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };

  if (status === "skipped")
    return { label: "Skipped", className: "bg-slate-100 text-slate-600 border-slate-200" };

  if (status === "saved")
    return { label: "Saved", className: "bg-blue-50 text-blue-700 border-blue-200" };

  return { label: "New", className: "bg-violet-50 text-violet-700 border-violet-200" };
}

function scorePill(
  label: string,
  value: number,
  mode: "good" | "warn" | "risk" = "good"
) {
  const styles =
    mode === "risk"
      ? "border-red-200 bg-red-50 text-red-600"
      : mode === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-600"
      : "border-emerald-200 bg-emerald-50 text-emerald-600";

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] opacity-50">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function MediaThumb({ post, className = "" }: { post: Post; className?: string }) {
  const resolved = proxiedMediaUrl(post.mediaUrl);
  const inner = resolved ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt=""
      className="h-full w-full object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-gray-300 text-2xl">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
    </div>
  );

  return post.permalink ? (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 block ${className}`}
    >
      {inner}
    </a>
  ) : (
    <div className={`relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 ${className}`}>
      {inner}
    </div>
  );
}

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-5 ${className}`}>{children}</div>;
}

function PostCard({
  post,
  selected,
  onSelect,
  onApprove,
  onSave,
  onSkip,
}: {
  post: Post;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const engageScore = getEngageScore(post);
  const timing = getTimingBadge(post.time);
  const status = getStatusBadge(post.status);
  const posterBadge = getPosterTypeBadge(post.posterType);
  const isHandled = post.status === "approved" || post.status === "skipped";

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-xl border bg-white p-5 transition hover:shadow-md ${selected ? "border-black shadow-sm" : "border-gray-200"} ${isHandled ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col gap-5 md:flex-row">
        <MediaThumb post={post} className="h-24 w-full md:w-24 md:flex-none" />
        <div className="flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold tracking-tight text-gray-950">
                {post.permalink ? (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
                    {post.author}
                  </a>
                ) : post.author}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {post.platform} • {post.time}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-medium ${timing.className}`}>
                {timing.label}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-medium ${status.className}`}>
                {status.label}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${posterBadge.className}`}
              >
                {posterBadge.label}
              </span>
              {post.onIslandNow && (
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-medium text-fuchsia-700">
                  On-island now
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 text-[17px] leading-snug text-gray-900">"{post.text}"</div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">Why this post</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {post.why.map((reason) => (
                  <span key={reason} className="rounded-full bg-white px-3 py-1.5 text-xs text-gray-700 ring-1 ring-gray-200">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-black bg-black p-4 text-white">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/60">Engage score</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">{engageScore}</div>
              </div>
              {scorePill("Poster rank", post.posterScore ?? 60, post.posterType === "spam" ? "risk" : "good")}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">Poster quality</div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-gray-600">
              <div>
                <span className="text-gray-400">Type:</span>{" "}
                <span className="font-medium text-gray-900">{posterBadge.label}</span>
              </div>
              <div>
                <span className="text-gray-400">Followers:</span>{" "}
                <span className="font-medium text-gray-900">
                  {formatCompactCount(post.followerCount)}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Engagement:</span>{" "}
                <span className="font-medium text-gray-900">
                  {post.engagementRate != null ? `${post.engagementRate.toFixed(1)}%` : "n/a"}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Rank score:</span>{" "}
                <span className="font-medium text-gray-900">{post.posterScore ?? 60}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400">Island intent:</span>{" "}
                <span className="font-medium text-gray-900">
                  {post.onIslandNow
                    ? `On-island now${post.islandSignals?.length ? ` (${post.islandSignals.join(", ")})` : ""}`
                    : post.islandSignals?.length
                    ? `Island mention (${post.islandSignals.join(", ")})`
                    : "No on-island signal"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">Suggested comment</div>
                <div className="mt-2 text-sm leading-6 text-gray-700">{post.comment}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Edit
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
              className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white"
            >
              Approve now
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Save for later
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InteractionEngineUI({
  initialClients = [],
  initialDecisions = [],
  setupIssue = null,
}: {
  initialClients?: ClientOption[];
  initialDecisions?: PersistedDecision[];
  setupIssue?: SetupIssue;
}) {
  const [clients, setClients] = useState<ClientOption[]>(initialClients);
  const [activeClientId, setActiveClientId] = useState(initialClients[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Feed");
  const [selectedId, setSelectedId] = useState("");
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [isLive, setIsLive] = useState(true);
  const [highValueOnly, setHighValueOnly] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedPosterFilter, setFeedPosterFilter] = useState<"all" | "tourist" | "creator">("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  // Discovery tab state — saved searches persist per account; running one
  // fires /api/interaction/discover and renders the posts + their comments.
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [newSearchKind, setNewSearchKind] = useState<SearchKind>("handle");
  const [newSearchValue, setNewSearchValue] = useState("");
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [discoveryPosts, setDiscoveryPosts] = useState<DiscoveredPost[]>([]);
  const [discoveryPages, setDiscoveryPages] = useState<DiscoveredPage[]>([]);
  const [discoveryFetchState, setDiscoveryFetchState] = useState<FetchState>("idle");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [ingestionState, setIngestionState] = useState<FetchState>("idle");
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  // commentId → decision, seeded from the DB so refresh doesn't lose triage.
  const [decisionMap, setDecisionMap] = useState<Record<string, DecisionKind>>(
    () => {
      const map: Record<string, DecisionKind> = {};
      for (const d of initialDecisions) map[d.commentId] = d.decision;
      return map;
    }
  );

  // When the operator switches accounts, pull the decision history for the
  // new one so earlier approve/save/skip calls stay applied.
  useEffect(() => {
    if (!activeClientId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/interaction/decisions?accountId=${encodeURIComponent(activeClientId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          decisions?: PersistedDecision[];
        };
        if (cancelled || !json?.ok) return;
        const map: Record<string, DecisionKind> = {};
        for (const d of json.decisions ?? []) map[d.commentId] = d.decision;
        setDecisionMap(map);
        setPosts((prev) =>
          prev.map((p) =>
            map[p.id] ? { ...p, status: statusFromDecision(map[p.id]) } : p
          )
        );
      } catch {
        // soft-fail: decision history just starts empty for this account
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClientId]);
  const [query, setQuery] = useState("");
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState("disc-1");
  const [autoQueue, setAutoQueue] = useState(true);
  const [filterLowReplies, setFilterLowReplies] = useState(true);
  const [filterQuestionsOnly, setFilterQuestionsOnly] = useState(true);
  const [filterTourists, setFilterTourists] = useState(false);
  const [filterCreators, setFilterCreators] = useState(false);
  const [filterVerified, setFilterVerified] = useState(false);

  const tabs: Tab[] = [
    "Feed",
    "Discovery",
    "Saved Audiences",
    "Competitors",
    "Playbook",
    "Results",
    "Learnings",
  ];

  const activeClient = clients.find((c) => c.id === activeClientId) ?? clients[0] ?? null;
  const clientPosts = useMemo(
    () => (activeClient ? posts.filter((p) => p.clientId === activeClient.id) : []),
    [posts, activeClient?.id]
  );

  useEffect(() => {
    const firstClientPost = posts.find((post) => post.clientId === activeClientId);
    if (firstClientPost) {
      setSelectedId(firstClientPost.id);
    }
  }, [activeClientId, posts]);

  const updatePost = (postId: string, patch: Partial<Post>) => {
    setPosts((current) => {
      const idx = current.findIndex((p) => p.id === postId);
      if (idx === -1) return current;
      const updated: Post = { ...current[idx], ...patch };
      const next = [...current];
      next[idx] = updated;

      // When the status transitions into a terminal triage state, write
      // it to the DB so refresh / account-switch keeps the decision.
      if (
        patch.status === "approved" ||
        patch.status === "saved" ||
        patch.status === "skipped"
      ) {
        const decision: DecisionKind = patch.status;
        setDecisionMap((prev) => ({ ...prev, [updated.id]: decision }));
        // Fire-and-forget; UI already reflects the change optimistically.
        void saveInteractionDecision({
          accountId: updated.clientId,
          commentId: updated.id,
          decision,
          commentText: updated.text,
          commentAuthor: updated.author,
          commentPermalink: updated.permalink ?? null,
          posterType: updated.posterType ?? null,
          posterScore: updated.posterScore ?? null,
          followerCount: updated.followerCount ?? null,
          engagementRate: updated.engagementRate ?? null,
          relevance: updated.relevance,
          opportunity: updated.opportunity,
          risk: updated.risk,
        }).catch((err) => {
          console.error("[updatePost] persistDecision failed:", err);
        });
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    async function ingestInstagramComments() {
      setIngestionState((prev) => (prev === "idle" ? "loading" : prev));
      setIngestionError(null);
      try {
        const keywordsParam = keywordFilter.trim();
        const res = await fetch(
          `/api/interaction/instagram-comments?accountId=${encodeURIComponent(activeClientId)}&limit=20${
            keywordsParam ? `&keywords=${encodeURIComponent(keywordsParam)}` : ""
          }`,
          { cache: "no-store" }
        );
        const payload: InstagramCommentsApiResponse = await res.json();
        if (!res.ok || !payload.ok) {
          if (payload.tokenExpired) setTokenExpired(true);
          throw new Error(payload.error ?? "Failed to fetch Instagram comments.");
        }
        setTokenExpired(false);

        const incoming = (payload.comments ?? []).map((comment) => {
          const timestamp = String(comment.timestamp ?? "");
          const parsed = timestamp ? new Date(timestamp) : null;
          const minutesAgo =
            parsed && Number.isFinite(parsed.getTime())
              ? Math.max(1, Math.round((Date.now() - parsed.getTime()) / 60000))
              : 10;
          const text = String(comment.text ?? "").trim() || "Instagram comment";
          const followerCount =
            typeof comment.followerCount === "number"
              ? comment.followerCount
              : comment.followerCount != null
              ? Number(comment.followerCount)
              : null;
          const engagementRate =
            typeof comment.engagementRate === "number"
              ? comment.engagementRate
              : comment.engagementRate != null
              ? Number(comment.engagementRate)
              : null;
          const posterType = comment.posterType ?? "tourist";
          const posterScore =
            typeof comment.posterScore === "number"
              ? comment.posterScore
              : posterType === "creator"
              ? 78
              : posterType === "spam"
              ? 10
              : 62;
          const cleanFollowerCount = Number.isFinite(followerCount)
            ? Number(followerCount)
            : null;
          const cleanEngagementRate = Number.isFinite(engagementRate)
            ? Number(engagementRate)
            : null;
          const islandSignals = Array.isArray(comment.islandSignals)
            ? comment.islandSignals.map((signal) => String(signal))
            : [];
          const onIslandNow = Boolean(comment.onIslandNow);
          const scores = deriveScores({
            text,
            posterType,
            posterScore,
            onIslandNow,
            islandSignals,
            followerCount: cleanFollowerCount,
            engagementRate: cleanEngagementRate,
            minutesAgo,
          });
          const commentId = String(comment.id ?? `ig-${Date.now()}`);
          // Re-apply any prior triage decision so approved/saved/skipped
          // comments don't re-appear in "Ready now" after refetch.
          const priorDecision = decisionMap[commentId];
          return {
            id: commentId,
            clientId: activeClientId,
            author: `@${String(comment.username ?? "instagram_user").replace(/^@/, "")}`,
            platform: "Instagram",
            time: `${minutesAgo}m ago`,
            text,
            relevance: scores.relevance,
            opportunity: scores.opportunity,
            risk: scores.risk,
            comment: "Helpful local recommendation based on their question and timing.",
            // Use the real Instagram post thumbnail when the API provided
            // one. Empty string falls through to MediaThumb's SVG placeholder
            // so we don't flash a broken image.
            mediaUrl: String(comment.mediaUrl ?? "").trim(),
            status: priorDecision
              ? (statusFromDecision(priorDecision) as PostStatus)
              : ("new" as const),
            why: ["Live Instagram comment", "High intent signal", "Fresh opportunity window"],
            posterType,
            followerCount: cleanFollowerCount,
            engagementRate: cleanEngagementRate,
            posterScore,
            posterReasons: comment.posterReasons ?? [],
            onIslandNow,
            islandSignals,
          };
        });

        if (cancelled || incoming.length === 0) return;
        setPosts((prev) => {
          const byId = new Map(prev.map((post) => [post.id, post]));
          for (const item of incoming) {
            if (!byId.has(item.id)) {
              byId.set(item.id, item);
            }
          }
          return Array.from(byId.values())
            .sort((a, b) => (b.posterScore ?? 0) - (a.posterScore ?? 0))
            .slice(0, 40);
        });
        setIngestionState("success");
      } catch (error) {
        if (cancelled) return;
        setIngestionState("error");
        setIngestionError(
          error instanceof Error ? error.message : "Failed to ingest Instagram comments."
        );
      }
    }

    if (!activeClientId) return;
    ingestInstagramComments();
    const interval = setInterval(ingestInstagramComments, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeClientId, keywordFilter]);

  // Load saved discovery searches when the active account changes.
  useEffect(() => {
    if (!activeClientId) {
      setSavedSearches([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await listInteractionSearches(activeClientId);
      if (!cancelled) {
        setSavedSearches(rows);
        setActiveSearchId(null);
        setDiscoveryPosts([]);
        setDiscoveryPages([]);
        setDiscoveryFetchState("idle");
        setDiscoveryError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClientId]);

  async function runDiscoverySearch(search: SavedSearch) {
    setActiveSearchId(search.id);
    setDiscoveryFetchState("loading");
    setDiscoveryError(null);
    try {
      const params = new URLSearchParams({
        accountId: search.accountId,
        kind: search.kind,
      });
      if (search.value) params.set("value", search.value);
      const res = await fetch(`/api/interaction/discover?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        posts?: DiscoveredPost[];
        pages?: DiscoveredPage[];
        error?: string;
        notSupported?: boolean;
      };
      if (!res.ok || !json.ok) {
        setDiscoveryFetchState("error");
        setDiscoveryError(json.error ?? "Discovery lookup failed");
        setDiscoveryPosts([]);
        setDiscoveryPages([]);
        return;
      }
      setDiscoveryPosts(json.posts ?? []);
      setDiscoveryPages(json.pages ?? []);
      setDiscoveryFetchState("success");
    } catch (err) {
      setDiscoveryFetchState("error");
      setDiscoveryError(
        err instanceof Error ? err.message : "Discovery lookup failed"
      );
      setDiscoveryPosts([]);
      setDiscoveryPages([]);
    }
  }

  // When a RapidAPI keyword result has a handle, let the operator add it
  // as a handle-based search so it runs via the free Business Discovery
  // path from then on.
  async function promotePageToHandle(page: DiscoveredPage) {
    const handle = (page.handle ?? "").replace(/^@+/, "").trim();
    if (!activeClientId || !handle) {
      setDiscoveryError("This page has no Instagram handle we can use.");
      setDiscoveryFetchState("error");
      return;
    }
    const result = await addInteractionSearch({
      accountId: activeClientId,
      kind: "handle",
      value: handle,
      label: page.name || null,
    });
    if (!result.ok) {
      setDiscoveryError(result.error);
      setDiscoveryFetchState("error");
      return;
    }
    setSavedSearches((prev) => {
      const without = prev.filter((s) => s.id !== result.search.id);
      return [result.search, ...without];
    });
    await runDiscoverySearch(result.search);
  }

  async function handleAddSearch() {
    const value = newSearchValue.trim();
    if (!activeClientId) {
      setDiscoveryError("Select an Instagram account first.");
      setDiscoveryFetchState("error");
      return;
    }
    if (newSearchKind !== "mentions" && !value) {
      setDiscoveryError("Enter a handle or hashtag to save.");
      setDiscoveryFetchState("error");
      return;
    }
    setDiscoveryFetchState("loading");
    setDiscoveryError(null);
    try {
      const result = await addInteractionSearch({
        accountId: activeClientId,
        kind: newSearchKind,
        value: newSearchKind === "mentions" ? "me" : value,
        label: null,
      });
      if (!result.ok) {
        setDiscoveryError(result.error);
        setDiscoveryFetchState("error");
        return;
      }
      setNewSearchValue("");
      setSavedSearches((prev) => {
        const without = prev.filter((s) => s.id !== result.search.id);
        return [result.search, ...without];
      });
      await runDiscoverySearch(result.search);
    } catch (err) {
      setDiscoveryError(
        err instanceof Error
          ? err.message
          : "Save & run failed. Has the interaction_searches migration been applied?"
      );
      setDiscoveryFetchState("error");
    }
  }

  async function handleRemoveSearch(id: number) {
    const res = await removeInteractionSearch(id);
    if (!res.ok) {
      setDiscoveryError(res.error);
      return;
    }
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    if (activeSearchId === id) {
      setActiveSearchId(null);
      setDiscoveryPosts([]);
      setDiscoveryPages([]);
      setDiscoveryFetchState("idle");
    }
  }

  function handleDiscoveryCommentDecision(
    post: DiscoveredPost,
    comment: DiscoveredComment,
    decision: DecisionKind
  ) {
    void saveInteractionDecision({
      accountId: activeClientId,
      commentId: comment.id,
      decision,
      commentText: comment.text,
      commentAuthor: comment.author,
      commentPermalink: post.permalink,
      posterType: null,
      posterScore: null,
      followerCount: post.authorFollowers,
      engagementRate: null,
      relevance: null,
      opportunity: null,
      risk: null,
    }).catch((err) => console.error("[discovery decision] failed:", err));
    setDecisionMap((prev) => ({ ...prev, [comment.id]: decision }));
  }

  // Hydrate / persist keyword filter across sessions.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("interaction-keywords");
      if (stored !== null) setKeywordFilter(stored);
    } catch {
      // localStorage unavailable (SSR, privacy mode) — fall back to empty
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("interaction-keywords", keywordFilter);
    } catch {
      // ignore quota / privacy errors
    }
  }, [keywordFilter]);

  // Deterministic fixtures for demos — no randomness so screenshots and
  // walkthroughs show the same data every time. Scored via deriveScores()
  // so they follow the same rules as real comments.
  useEffect(() => {
    if (!demoMode) return;
    const fixtures: Array<Omit<Post, "clientId" | "id" | "relevance" | "opportunity" | "risk"> & {
      posterScoreSeed: number;
    }> = [
      {
        author: "@kenzie.travels",
        platform: "Instagram",
        time: "3m ago",
        text: "Any must-visit food spots in Zanzibar right now? 🍜",
        comment:
          "There are a couple of really fresh spots around Kendwa depending on what you are looking for 👀",
        mediaUrl:
          "https://images.unsplash.com/photo-1504674900247-ec6e0c6c1c9c?auto=format&fit=crop&w=1200&q=80",
        status: "new",
        why: ["Tourist intent", "Fresh post", "High reply potential"],
        posterType: "tourist",
        followerCount: 1840,
        engagementRate: 4.2,
        onIslandNow: true,
        islandSignals: ["Zanzibar"],
        posterScoreSeed: 82,
      },
      {
        author: "@creator.wanders",
        platform: "Instagram",
        time: "12m ago",
        text: "Recommendations for a quiet beach near Nungwi this week?",
        comment:
          "Kendwa's north stretch is calm most mornings — happy to point you to a good sundowner.",
        mediaUrl:
          "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
        status: "new",
        why: ["Creator footprint", "Local mention"],
        posterType: "creator",
        followerCount: 28400,
        engagementRate: 3.1,
        onIslandNow: true,
        islandSignals: ["Nungwi", "Kendwa"],
        posterScoreSeed: 88,
      },
      {
        author: "@scrolly_spam",
        platform: "Instagram",
        time: "26m ago",
        text: "Big discount! DM me for crypto promo 🚀 https://t.me/xyz",
        comment: "",
        mediaUrl:
          "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
        status: "new",
        why: ["Spam patterns detected"],
        posterType: "spam",
        followerCount: 12,
        engagementRate: 0,
        onIslandNow: false,
        islandSignals: [],
        posterScoreSeed: 8,
      },
    ];
    let cursor = 0;
    const interval = setInterval(() => {
      const f = fixtures[cursor % fixtures.length];
      cursor++;
      const minutesAgo = 2;
      const scores = deriveScores({
        text: f.text,
        posterType: f.posterType ?? "tourist",
        posterScore: f.posterScoreSeed,
        onIslandNow: f.onIslandNow ?? false,
        islandSignals: f.islandSignals ?? [],
        followerCount: f.followerCount ?? null,
        engagementRate: f.engagementRate ?? null,
        minutesAgo,
      });
      const newPost: Post = {
        ...f,
        id: `demo-${cursor}-${f.author}`,
        clientId: activeClientId,
        relevance: scores.relevance,
        opportunity: scores.opportunity,
        risk: scores.risk,
        posterScore: f.posterScoreSeed,
      };
      setPosts((prev) => {
        if (prev.some((p) => p.id === newPost.id)) return prev;
        return [newPost, ...prev].slice(0, 30);
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [demoMode, activeClientId]);

  const discoveryResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DISCOVERY_RESULTS.filter((p) => {
      const matchesQuery =
        p.text.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        q.includes("zanzibar") ||
        q.includes("kendwa") ||
        q.length < 3;
      const matchesReplies = filterLowReplies ? p.replyCount <= 5 : true;
      const matchesQuestions = filterQuestionsOnly ? p.text.includes("?") : true;
      const matchesTourists = filterTourists ? p.sourceType === "tourist" : true;
      const matchesCreators = filterCreators ? p.sourceType === "creator" : true;
      const matchesVerified = filterVerified ? Boolean(p.verified) : true;
      const sourceGate = filterTourists || filterCreators ? matchesTourists && matchesCreators : true;
      return matchesQuery && matchesReplies && matchesQuestions && sourceGate && matchesVerified;
    }).sort((a, b) => getDiscoveryScore(b) - getDiscoveryScore(a));
  }, [
    filterCreators,
    filterLowReplies,
    filterQuestionsOnly,
    filterTourists,
    filterVerified,
    query,
  ]);

  const selectedDiscovery =
    discoveryResults.find((post) => post.id === selectedDiscoveryId) ?? discoveryResults[0];

  useEffect(() => {
    if (!discoveryResults.length) return;
    if (!discoveryResults.some((post) => post.id === selectedDiscoveryId)) {
      setSelectedDiscoveryId(discoveryResults[0].id);
    }
  }, [discoveryResults, selectedDiscoveryId]);

  useEffect(() => {
    if (!autoQueue) return;
    const highScorePosts = discoveryResults.filter((post) => getDiscoveryScore(post) >= 90);
    if (!highScorePosts.length) return;

    setPosts((prev) => {
      const existingIds = new Set(prev.map((post) => post.id));
      const additions = highScorePosts
        .filter((post) => !existingIds.has(post.id))
        .map((post) => toOperatorPost(post, activeClientId));

      if (!additions.length) return prev;
      return [...additions, ...prev];
    });
  }, [activeClientId, autoQueue, discoveryResults]);

  const visiblePosts = useMemo(() => {
    let list = [...clientPosts].sort(
      (a, b) =>
        getEngageScore(b) - getEngageScore(a) ||
        (b.posterScore ?? 0) - (a.posterScore ?? 0)
    );
    if (highValueOnly) list = list.filter((p) => getEngageScore(p) >= 85);
    if (feedPosterFilter !== "all") list = list.filter((p) => p.posterType === feedPosterFilter);
    if (feedSearch.trim()) {
      const q = feedSearch.trim().toLowerCase();
      list = list.filter((p) => p.text.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
    }
    return list;
  }, [clientPosts, highValueOnly, feedPosterFilter, feedSearch]);

  const ready = visiblePosts.filter((p) => p.status === "new");
  const saved = visiblePosts.filter((p) => p.status === "saved");
  const handled = visiblePosts.filter((p) => p.status === "approved" || p.status === "skipped");
  const active =
    visiblePosts.find((p) => p.id === selectedId) ??
    clientPosts.find((p) => p.id === selectedId) ??
    ready[0] ??
    saved[0] ??
    handled[0] ??
    clientPosts[0];

  const selectedDiscoveryBest = selectedDiscovery
    ? [...selectedDiscovery.comments].sort((a, b) => b.winProbability - a.winProbability)[0]
    : null;

  const addDiscoveryToQueue = (post: DiscoveryPost) => {
    const exists = posts.some((item) => item.id === post.id);
    if (exists) {
      setActiveTab("Feed");
      setSelectedId(post.id);
      return;
    }

    const mapped = toOperatorPost(post, activeClientId);
    setPosts((prev) => [mapped, ...prev]);
    setActiveTab("Feed");
    setSelectedId(mapped.id);
  };

  const renderFeed = () => (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_420px]">
      <div>
        <div className="mb-5 space-y-3">
          <input
            type="text"
            placeholder="Search comments..."
            value={feedSearch}
            onChange={(e) => setFeedSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Server-side keyword filter (comma-separated, e.g. zanzibar, kendwa, nungwi)"
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-700 placeholder-gray-400 outline-none focus:border-gray-400"
            />
            {keywordFilter && (
              <button
                onClick={() => setKeywordFilter("")}
                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50"
                title="Clear keywords"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "tourist", "creator"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFeedPosterFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${feedPosterFilter === f ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {f === "all" ? "All" : f === "tourist" ? "Tourists" : "Creators"}
              </button>
            ))}
            <div className="ml-auto">
              <button
                onClick={() => setHighValueOnly((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${highValueOnly ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {highValueOnly ? "High value only" : "All scores"}
              </button>
            </div>
          </div>
        </div>
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Ready now</div>
            <div className="text-xs text-gray-400">{ready.length} items</div>
          </div>
          <div className="space-y-5">
            {ready.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                selected={active?.id === post.id}
                onSelect={() => setSelectedId(post.id)}
                onApprove={() => {
                  setSelectedId(post.id);
                  updatePost(post.id, { status: "approved" });
                }}
                onSave={() => updatePost(post.id, { status: "saved" })}
                onSkip={() => updatePost(post.id, { status: "skipped" })}
              />
            ))}
          </div>
        </div>
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Saved for later</div>
            <div className="text-xs text-gray-400">{saved.length} items</div>
          </div>
          <div className="space-y-5">
            {saved.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                selected={active?.id === post.id}
                onSelect={() => setSelectedId(post.id)}
                onApprove={() => {
                  setSelectedId(post.id);
                  updatePost(post.id, { status: "approved" });
                }}
                onSave={() => updatePost(post.id, { status: "saved" })}
                onSkip={() => updatePost(post.id, { status: "skipped" })}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Handled</div>
            <div className="text-xs text-gray-400">{handled.length} items</div>
          </div>
          <div className="space-y-5">
            {handled.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                selected={active?.id === post.id}
                onSelect={() => setSelectedId(post.id)}
                onApprove={() => {
                  setSelectedId(post.id);
                  updatePost(post.id, { status: "approved" });
                }}
                onSave={() => updatePost(post.id, { status: "saved" })}
                onSkip={() => updatePost(post.id, { status: "skipped" })}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="sticky top-8 h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {active && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold tracking-tight">
                  {active.permalink ? (
                    <a href={active.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {active.author}
                    </a>
                  ) : active.author}
                </div>
                <div className="text-sm text-gray-500">
                  {active.platform} • {active.time}
                </div>
              </div>
              {active.permalink && (
                <a href={active.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-700 hover:underline">
                  View post ↗
                </a>
              )}
            </div>
            <div className="mt-5">
              <MediaThumb post={active} className="h-52 w-full" />
            </div>
            <div className="mt-5 text-[17px] leading-relaxed text-gray-900">"{active.text}"</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-black bg-black p-4 text-white">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/60">Engage score</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">{getEngageScore(active)}</div>
              </div>
              {scorePill(
                "Poster rank",
                active.posterScore ?? 60,
                active.posterType === "spam" ? "risk" : "good"
              )}
            </div>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">User ranking</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-700">
                <div>
                  <span className="text-gray-400">Type:</span>{" "}
                  <span className="font-medium">{getPosterTypeBadge(active.posterType).label}</span>
                </div>
                <div>
                  <span className="text-gray-400">Followers:</span>{" "}
                  <span className="font-medium">{formatCompactCount(active.followerCount)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Engagement:</span>{" "}
                  <span className="font-medium">
                    {active.engagementRate != null ? `${active.engagementRate.toFixed(1)}%` : "n/a"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Rank score:</span>{" "}
                  <span className="font-medium">{active.posterScore ?? 60}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400">Island intent:</span>{" "}
                  <span className="font-medium">
                    {active.onIslandNow
                      ? `On-island now${active.islandSignals?.length ? ` (${active.islandSignals.join(", ")})` : ""}`
                      : active.islandSignals?.length
                      ? `Island mention (${active.islandSignals.join(", ")})`
                      : "No on-island signal"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">Why this post</div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
                {active.why.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-[0.25em] text-gray-400">Comment</div>
              <textarea
                value={active.comment}
                onChange={(e) => updatePost(active.id, { comment: e.target.value })}
                className="mt-3 min-h-[160px] w-full rounded-lg border border-gray-200 p-4 text-sm leading-relaxed outline-none focus:border-black"
              />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <button
                onClick={() => updatePost(active.id, { status: "approved" })}
                className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white"
              >
                Approve
              </button>
              <button
                onClick={() => updatePost(active.id, { status: "saved" })}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
              >
                Save
              </button>
              <button
                onClick={() => updatePost(active.id, { status: "skipped" })}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderDiscoveryCard = (post: DiscoveryPost) => {
    const score = getDiscoveryScore(post);
    const urgency = getUrgency(score);
    const isSelected = selectedDiscovery?.id === post.id;
    const freshnessWeight = getFreshnessWeight(post.time);
    const replyWeight = getReplyCompetitionWeight(post.replyCount);
    const intentWeight = getIntentWeight(post.intent);

    return (
      <div
        key={post.id}
        onClick={() => setSelectedDiscoveryId(post.id)}
        className={`cursor-pointer rounded-2xl border p-5 transition ${isSelected ? "border-black bg-black text-white shadow-md" : "border-gray-200 bg-white hover:shadow-sm"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className={`text-xs ${isSelected ? "text-white/70" : "text-gray-400"}`}>
            {post.platform} • {post.time}
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`rounded-full border px-2 py-1 text-[10px] ${isSelected ? "border-white/20 bg-white/10 text-white" : urgency.style}`}
            >
              {urgency.label}
            </div>
            <div className={`text-xs font-medium ${isSelected ? "text-white/70" : "text-gray-500"}`}>
              Engage {score}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="font-semibold">{post.author}</div>
          <div className="flex items-center gap-2">
            <div
              className={`rounded-full border px-2 py-1 text-[10px] ${isSelected ? "border-white/20 bg-white/10 text-white" : getIntentStyle(post.intent)}`}
            >
              {post.intent}
            </div>
            <div
              className={`rounded-full border px-2 py-1 text-[10px] ${isSelected ? "border-white/20 bg-white/10 text-white" : getSourceStyle(post.sourceType)}`}
            >
              {post.sourceType ?? "unknown"}
            </div>
            {post.verified ? (
              <div
                className={`rounded-full border px-2 py-1 text-[10px] ${isSelected ? "border-white/20 bg-white/10 text-white" : "border-sky-200 bg-sky-50 text-sky-700"}`}
              >
                verified
              </div>
            ) : null}
          </div>
        </div>
        <div className={`mt-2 text-[15px] leading-relaxed ${isSelected ? "text-white/90" : "text-gray-800"}`}>
          "{post.text}"
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          <span
            className={`rounded-full border px-2 py-1 ${isSelected ? "border-white/20 bg-white/10 text-white" : "border-gray-200 bg-gray-50 text-gray-600"}`}
          >
            Replies: {post.replyCount}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${isSelected ? "border-white/20 bg-white/10 text-white" : "border-gray-200 bg-gray-50 text-gray-600"}`}
          >
            Intent {intentWeight > 0 ? `+${intentWeight}` : intentWeight}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${isSelected ? "border-white/20 bg-white/10 text-white" : "border-gray-200 bg-gray-50 text-gray-600"}`}
          >
            Replies {replyWeight > 0 ? `+${replyWeight}` : replyWeight}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${isSelected ? "border-white/20 bg-white/10 text-white" : "border-gray-200 bg-gray-50 text-gray-600"}`}
          >
            Fresh {freshnessWeight > 0 ? `+${freshnessWeight}` : freshnessWeight}
          </span>
          {post.savedSearch ? (
            <span
              className={`rounded-full border px-2 py-1 ${isSelected ? "border-white/20 bg-white/10 text-white" : "border-gray-200 bg-gray-50 text-gray-600"}`}
            >
              {post.savedSearch}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const renderDiscovery = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-900">Add a discovery source</div>
        <div className="mt-1 text-xs text-gray-500">
          Free, uses Meta Graph — no scraper service needed. Competitor and mentions work out of the box; hashtag requires Meta app review and will tell you if it is not enabled.
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={newSearchKind}
            onChange={(e) => setNewSearchKind(e.target.value as SearchKind)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="handle">Competitor / creator handle</option>
            <option value="mentions">Posts that tag me</option>
            <option value="keyword">Keyword (RapidAPI)</option>
            <option value="hashtag">Hashtag (gated by Meta)</option>
          </select>
          {newSearchKind !== "mentions" && (
            <input
              value={newSearchValue}
              onChange={(e) => setNewSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddSearch();
                }
              }}
              placeholder={
                newSearchKind === "handle"
                  ? "@competitor_handle"
                  : newSearchKind === "keyword"
                    ? "Keyword or topic (e.g. craft beer)"
                    : "#hashtag"
              }
              className="min-w-[240px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            />
          )}
          <button
            onClick={handleAddSearch}
            disabled={
              discoveryFetchState === "loading" ||
              !activeClientId ||
              (newSearchKind !== "mentions" && !newSearchValue.trim())
            }
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {discoveryFetchState === "loading" ? "Running…" : "Save & run"}
          </button>
        </div>
      </div>

      {savedSearches.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-900">Saved searches</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {savedSearches.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition ${
                  activeSearchId === s.id
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <button onClick={() => runDiscoverySearch(s)}>
                  {s.kind === "handle" && `@${s.value}`}
                  {s.kind === "hashtag" && `#${s.value}`}
                  {s.kind === "mentions" && "Tagged me"}
                  {s.kind === "keyword" && `🔎 ${s.value}`}
                </button>
                <button
                  onClick={() => handleRemoveSearch(s.id)}
                  className={`ml-1 rounded-full px-1 text-xs ${
                    activeSearchId === s.id
                      ? "text-white/70 hover:text-white"
                      : "text-gray-400 hover:text-gray-700"
                  }`}
                  title="Remove saved search"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {discoveryFetchState === "loading" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading posts from Meta…
        </div>
      )}

      {(discoveryFetchState === "error" || (discoveryError && discoveryFetchState !== "loading")) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Discovery lookup failed</div>
          <div className="mt-1 text-xs opacity-90">{discoveryError}</div>
        </div>
      )}

      {discoveryPages.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-900">
            {discoveryPages.length} matching pages
          </div>
          <div className="mt-1 text-xs text-gray-500">
            RapidAPI search results. Click &ldquo;Use as source&rdquo; on any page with
            an Instagram handle to run the free Business Discovery lookup on it.
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {discoveryPages.map((page) => {
              const canPromote = Boolean(page.handle);
              return (
                <div
                  key={page.id}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3"
                >
                  {page.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={page.avatar}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={page.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-semibold hover:underline"
                      >
                        {page.name}
                      </a>
                      {page.fans != null && (
                        <span className="shrink-0 text-xs text-gray-500">
                          {page.fans.toLocaleString()} fans
                        </span>
                      )}
                    </div>
                    {page.handle && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        @{page.handle}
                      </div>
                    )}
                    {page.description && (
                      <div className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {page.description}
                      </div>
                    )}
                    <div className="mt-2">
                      <button
                        onClick={() => void promotePageToHandle(page)}
                        disabled={!canPromote}
                        className="rounded-md border border-black bg-black px-2.5 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          canPromote
                            ? "Save as a competitor-handle source and fetch its posts"
                            : "No Instagram handle on this page — can't run Business Discovery"
                        }
                      >
                        Use as source
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {discoveryFetchState === "success" &&
        discoveryPosts.length === 0 &&
        discoveryPages.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          No posts found for this source yet.
        </div>
      )}

      {discoveryPosts.length > 0 && (
        <div className="space-y-4">
          {discoveryPosts.map((post) => (
            <div
              key={post.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
            >
              <div className="flex items-start gap-4 p-5">
                {post.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxiedMediaUrl(post.mediaUrl)}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    onError={(e) => {
                      // Swap to a neutral placeholder when the Meta CDN URL
                      // has expired or the proxy rejects the domain.
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-20 w-20 shrink-0 rounded-lg bg-gray-100" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={post.permalink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold hover:underline"
                    >
                      {post.author}
                    </a>
                    {post.authorFollowers != null && (
                      <span className="text-xs text-gray-500">
                        {post.authorFollowers.toLocaleString()} followers
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{post.time}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {post.likeCount ?? 0} likes · {post.commentCount ?? post.comments.length} comments
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-gray-700">{post.text}</p>
                </div>
              </div>
              {post.comments.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Comments ({post.comments.length})
                  </div>
                  <div className="space-y-2">
                    {post.comments.map((c) => {
                      const decided = decisionMap[c.id];
                      return (
                        <div
                          key={c.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-gray-900">
                              {c.author}
                              <span className="ml-2 text-xs text-gray-400">{c.time}</span>
                            </div>
                            <div className="mt-0.5 text-sm text-gray-700">{c.text}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {decided ? (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-600">
                                {decided}
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleDiscoveryCommentDecision(post, c, "approved")}
                                  className="rounded-md border border-black bg-black px-2 py-1 text-xs text-white"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleDiscoveryCommentDecision(post, c, "saved")}
                                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => handleDiscoveryCommentDecision(post, c, "skipped")}
                                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 hover:bg-gray-50"
                                >
                                  Skip
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSavedAudiences = () => (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {AUDIENCE_SETS.map((item) => (
        <SectionCard key={item.id}>
          <div className="text-lg font-semibold tracking-tight">{item.title}</div>
          <p className="mt-2 text-sm leading-6 text-gray-500">{item.description}</p>
          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-gray-500">{item.count} posts tracked</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{item.status}</span>
          </div>
        </SectionCard>
      ))}
    </div>
  );

  const renderCompetitors = () => (
    <div className="space-y-4">
      {COMPETITORS.map((item) => (
        <SectionCard key={item.id}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-semibold tracking-tight">{item.handle}</div>
              <div className="mt-1 text-sm text-gray-500">{item.description}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{item.overlap}</span>
              <button className="rounded-lg border border-gray-200 px-4 py-2 text-sm">Mine audience</button>
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );

  const renderPlaybook = () => (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <SectionCard>
        <div className="text-xs uppercase tracking-[0.28em] text-gray-400">Tone</div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">Warm, calm, naturally confident</div>
        <div className="mt-5 flex flex-wrap gap-2">
          {PLAYBOOK.tone.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-3 py-2 text-xs text-gray-700">
              {tag}
            </span>
          ))}
        </div>
      </SectionCard>
      <SectionCard>
        <div className="text-xs uppercase tracking-[0.28em] text-gray-400">Rules</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">Do</div>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-600">
              {PLAYBOOK.dos.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Avoid</div>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-600">
              {PLAYBOOK.avoids.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderResults = () => (
    <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
      {RESULTS.map((item) => (
        <SectionCard key={item.id}>
          <div className="text-sm text-gray-500">{item.label}</div>
          <div className="mt-3 text-4xl font-semibold tracking-tight">{item.value}</div>
        </SectionCard>
      ))}
    </div>
  );

  const renderLearnings = () => (
    <div className="space-y-4">
      {LEARNINGS.map((item) => (
        <SectionCard key={item}>
          <div className="text-base leading-7 text-gray-800">{item}</div>
        </SectionCard>
      ))}
    </div>
  );

  const renderActiveTab = () => {
    if (activeTab === "Discovery") return renderDiscovery();
    if (activeTab === "Saved Audiences") return renderSavedAudiences();
    if (activeTab === "Competitors") return renderCompetitors();
    if (activeTab === "Playbook") return renderPlaybook();
    if (activeTab === "Results") return renderResults();
    if (activeTab === "Learnings") return renderLearnings();
    return renderFeed();
  };

  const activeAccountMeta = clients.find((c) => c.id === activeClientId);
  const bannerMessages: { tone: "warn" | "info"; title: string; body: string }[] = [];
  if (setupIssue?.kind === "missing-supabase") {
    bannerMessages.push({
      tone: "warn",
      title: "Missing Supabase credentials",
      body: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the Interaction page to load connected accounts.",
    });
  } else if (setupIssue?.kind === "no-accounts") {
    bannerMessages.push({
      tone: "info",
      title: "No Instagram accounts connected",
      body: "Connect an Instagram account from the client settings page to start pulling live comments here.",
    });
  }
  if (tokenExpired) {
    bannerMessages.push({
      tone: "warn",
      title: "Instagram access token expired",
      body: "The Meta access token for this account has expired or been revoked. Reconnect the account in client settings to resume ingestion.",
    });
  } else if (ingestionState === "error" && ingestionError) {
    bannerMessages.push({
      tone: "warn",
      title: "Live feed error",
      body: ingestionError,
    });
  }
  if (activeAccountMeta?.tokenExpiresAt) {
    const expiresAt = new Date(activeAccountMeta.tokenExpiresAt).getTime();
    if (Number.isFinite(expiresAt)) {
      const daysLeft = Math.round((expiresAt - Date.now()) / 86400000);
      if (daysLeft <= 7 && daysLeft > 0) {
        bannerMessages.push({
          tone: "info",
          title: `Token expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          body: "Refresh the Instagram connection before it expires to avoid an outage.",
        });
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-black">
      <main className="px-6 py-8 md:px-10">
        {bannerMessages.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {bannerMessages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  msg.tone === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-sky-200 bg-sky-50 text-sky-900"
                }`}
              >
                <div className="font-semibold">{msg.title}</div>
                <div className="mt-0.5 text-xs opacity-90">{msg.body}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-gray-400">Client</div>
              <div className="mt-2 max-w-[300px]">
                <label className="sr-only" htmlFor="interaction-client-picker">
                  Select client
                </label>
                <select
                  id="interaction-client-picker"
                  value={activeClientId}
                  onChange={(event) => setActiveClientId(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base font-semibold tracking-tight text-gray-900 outline-none focus:border-black"
                >
                  {clients.length === 0 && <option value="">No clients found</option>}
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 text-sm text-gray-500">{activeClient?.handle ?? ""}</div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`text-xs ${
                  ingestionState === "error"
                    ? "text-red-600"
                    : ingestionState === "success"
                    ? "text-emerald-600"
                    : "text-gray-400"
                }`}
                title={ingestionError ?? "Instagram source ingestion status"}
              >
                {ingestionState === "success" && "● Instagram source connected"}
                {ingestionState === "loading" && "● Connecting Instagram source..."}
                {ingestionState === "error" && "● Instagram source error"}
                {ingestionState === "idle" && "● Instagram source idle"}
              </div>
              <div className={`text-xs ${isLive ? "text-green-600" : "text-gray-400"}`}>
                {isLive ? "● Live feed" : "Paused"}
              </div>
              <button
                onClick={() => setIsLive((v) => !v)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
              >
                {isLive ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => setDemoMode((v) => !v)}
                className={`rounded-lg border px-3 py-2 text-xs transition ${
                  demoMode
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
                title="Inject deterministic sample comments — useful for demos and screenshots"
              >
                {demoMode ? "● Demo on" : "Demo"}
              </button>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-4 py-2.5 text-sm whitespace-nowrap transition ${activeTab === tab ? "bg-black text-white shadow-sm" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">{activeTab}</h1>
            <p className="mt-2 max-w-xl text-sm text-gray-500">
              {activeTab === "Feed" &&
                "High-quality interaction opportunities ranked by intent, timing, user type, poster quality, and on-island-now signals."}
              {activeTab === "Discovery" &&
                "Find high-intent conversations across hashtags and search queries, then send the best directly into the operator queue."}
              {activeTab === "Saved Audiences" &&
                "Audience buckets that shape discovery and give the interaction engine sharper targets."}
              {activeTab === "Competitors" &&
                "Competitor accounts worth mining for overlaps, comment trails, and audience signals."}
              {activeTab === "Playbook" &&
                "Tone, engagement rules, and guardrails that keep comments on-brand."}
              {activeTab === "Results" &&
                "Simple performance snapshots showing the impact of interaction work."}
              {activeTab === "Learnings" &&
                "Patterns the team can use to get sharper over time."}
            </p>
          </div>
        </div>
        {renderActiveTab()}
      </main>
    </div>
  );
}

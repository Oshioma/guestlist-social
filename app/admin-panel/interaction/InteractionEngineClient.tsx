"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addInteractionSearch,
  getIgScraperSettings,
  listInteractionSearches,
  removeInteractionSearch,
  saveIgScraperSettings,
  saveInteractionDecision,
  type DecisionKind,
  type IgScraperSettings,
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
  postedAtMs?: number | null;
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
  clientId?: number | null;
  name: string;
  handle: string;
  tokenExpiresAt?: string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
};

function reconnectUrl(clientOption: ClientOption | null | undefined): string | null {
  if (!clientOption?.clientId) return null;
  const returnTo = typeof window === "undefined" ? "/app/interaction" : window.location.pathname;
  return `/api/meta/connect?clientId=${encodeURIComponent(
    String(clientOption.clientId)
  )}&returnTo=${encodeURIComponent(returnTo)}`;
}

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
  comment: string; // AI-generated reply draft (filled lazily)
  mediaUrl: string;
  permalink?: string | null;
  postCaption?: string | null; // parent-post caption for context
  status: PostStatus;
  // Fields below are no longer rendered in the Feed UI but kept optional
  // so the legacy Discovery / demo helpers that populate them still
  // compile. Safe to delete once those helpers are removed too.
  relevance?: number;
  opportunity?: number;
  risk?: number;
  why?: string[];
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
  author?: string;
  time?: string;
  timestamp?: string | null;
  permalink?: string;
  mediaUrl?: string;
  postCaption?: string | null;
};

// Meta's CDN (scontent.cdninstagram.com / fbcdn.net) blocks hotlinking
// from third-party domains — the image request carries a browser referer
// that fails the CDN signature check. We tunnel those through our own
// proxy route which swaps the referer server-side. Non-Meta hosts (e.g.
// Unsplash for demo fixtures) load directly.
// Cheap language detector for filtering out non-English comments/posts.
// No external libs — combines a non-ASCII-ratio signal (catches Czech,
// Polish, Vietnamese, etc.) with an English-stopword hit-count (catches
// languages that share the Latin alphabet like Italian / Portuguese /
// French). Tuned to keep very short captions and emoji-only content so
// we don't falsely reject things like "Zanzibar 2026 🎪 #kendwa".
const ENGLISH_STOPWORDS = new Set([
  "the","and","is","was","were","for","this","that","but","with","have","has",
  "had","are","you","we","they","from","what","when","where","who","how","why",
  "to","in","of","on","at","an","be","it","my","your","our","their","he","she",
  "his","her","us","them","will","would","can","could","should","not","no","yes",
  "so","if","or","because","while","there","here","just","about","into","over",
  "under","more","very","really","love","nice","good","great","thank","thanks",
  "please","today","tomorrow","week","month","year","holiday","trip","visit",
  "stay","place","time","would","like","looking","going","been","want","need",
  "any","some","all","only","also","next","then","now","out","up","down",
]);

function looksEnglish(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return true;

  // Strip URLs, @mentions, #hashtags and emoji — they don't signal language.
  const stripped = raw
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@#][\w.]+/g, "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .trim();
  if (!stripped) return true;

  // Very short content (≤2 words of actual letters) — assume English so
  // captions like "Zanzibar 2026 🎪 #kendwa" don't get filtered.
  const letterWords = stripped.match(/\b[\p{L}']+\b/gu) ?? [];
  if (letterWords.length <= 2) return true;

  // Non-ASCII letter ratio — Czech / Polish / Vietnamese / Lithuanian
  // drop out here thanks to their diacritics. Tightened the threshold
  // from 12% to 6% because Slovak & Lithuanian posts were sneaking
  // through at ~8-10% ratios.
  const allLetters = stripped.replace(/[^\p{L}]/gu, "");
  if (allLetters.length >= 10) {
    const asciiLetters = allLetters.replace(/[^a-zA-Z]/g, "");
    const nonAsciiRatio = 1 - asciiLetters.length / allLetters.length;
    if (nonAsciiRatio > 0.06) return false;
  }

  // Stopword hit rate — catches Italian, Portuguese, French, Spanish,
  // Slovak etc. that share the Latin alphabet. Require at least one
  // stopword per ~5 tokens AND a minimum of 2 hits on longer texts,
  // so "Naują Anaya Hotel 5" doesn't pass just because "hotel" is a
  // loanword.
  const tokens = stripped.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
  if (tokens.length < 3) return true;
  const hits = tokens.filter((t) => ENGLISH_STOPWORDS.has(t)).length;
  const threshold =
    tokens.length >= 15
      ? Math.max(2, Math.floor(tokens.length / 6))
      : Math.max(1, Math.floor(tokens.length / 5));
  return hits >= threshold;
}

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
  // Retained as a dead helper for the old Discovery code that still
  // references scores on posts it converted via toOperatorPost. Feed
  // cards no longer render this value.
  const posterWeight = post.posterScore != null ? post.posterScore : 60;
  const posterPenalty = post.posterType === "spam" ? 20 : 0;
  const onIslandBoost = post.onIslandNow ? 12 : 0;
  return Math.max(
    1,
    Math.round(
      (post.relevance ?? 60) * 0.33 +
        (post.opportunity ?? 60) * 0.34 +
        (100 - (post.risk ?? 20)) * 0.13 +
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
  replyDraft,
  replyLoading,
  onChangeReply,
  onGenerateReply,
  accountName,
}: {
  post: Post;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onSave: () => void;
  onSkip: () => void;
  replyDraft: string;
  replyLoading: boolean;
  onChangeReply: (value: string) => void;
  onGenerateReply: () => void;
  accountName?: string;
}) {
  const timing = getTimingBadge(post.time);
  const status = getStatusBadge(post.status);
  const isHandled = post.status === "approved" || post.status === "skipped";

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-xl border bg-white p-5 transition hover:shadow-md ${
        selected ? "border-black shadow-sm" : "border-gray-200"
      } ${isHandled ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col gap-5 md:flex-row">
        <MediaThumb post={post} className="h-24 w-full md:w-24 md:flex-none" />
        <div className="flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold tracking-tight text-gray-950">
                {post.permalink ? (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                  >
                    {post.author}
                  </a>
                ) : (
                  post.author
                )}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {post.platform} • {post.time} • {accountName ?? ""}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${timing.className}`}
              >
                {timing.label}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${status.className}`}
              >
                {status.label}
              </span>
            </div>
          </div>

          {post.postCaption && (
            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">
                In reply to this post
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">
                {post.postCaption}
              </div>
            </div>
          )}

          <div className="mt-3 text-[17px] leading-snug text-gray-900">
            &ldquo;{post.text}&rdquo;
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">
                Draft reply
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateReply();
                }}
                disabled={replyLoading}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-black hover:text-black disabled:cursor-wait disabled:opacity-60"
              >
                {replyLoading
                  ? "Generating…"
                  : replyDraft
                    ? "Regenerate"
                    : "Generate with AI"}
              </button>
            </div>
            <textarea
              value={replyDraft}
              onChange={(e) => {
                onChangeReply(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Click Generate to let AI draft a reply, or type your own here."
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-black"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black bg-white px-4 py-3 text-sm font-medium text-black hover:bg-black hover:text-white"
              >
                Reply on {post.platform} ↗
              </a>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
              className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white"
            >
              Approve
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Save
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
  const [activeClientId, setActiveClientId] = useState(() => {
    // Remember whichever account the operator had selected last time,
    // but only if it still exists in the current list. Falls back to
    // the first account so we never land on a broken selection.
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("interaction-active-account");
        if (stored && initialClients.some((c) => c.id === stored)) {
          return stored;
        }
      } catch {
        // localStorage unavailable — ignore
      }
    }
    return initialClients[0]?.id ?? "";
  });
  const [activeTab, setActiveTab] = useState<Tab>("Feed");
  const [selectedId, setSelectedId] = useState("");
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [isLive, setIsLive] = useState(true);
  const [feedSearch, setFeedSearch] = useState("");
  const [englishOnly, setEnglishOnly] = useState(true);
  const [keywordFilter, setKeywordFilter] = useState("");

  // Discovery tab state — saved searches persist per account; running one
  // fires /api/interaction/discover and renders the posts + their comments.
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [newSearchKind, setNewSearchKind] = useState<SearchKind>("handle");
  // Discovery has two flavours: the stable Meta-Graph-only surface and
  // the experimental scraper-backed one. Toggle lives in state and
  // persists across sessions so the operator stays where they were.
  const [discoveryMode, setDiscoveryMode] = useState<"stable" | "v2">("stable");
  const experimentalDiscovery = discoveryMode === "v2";
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("interaction-discovery-mode");
      if (stored === "stable" || stored === "v2") setDiscoveryMode(stored);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("interaction-discovery-mode", discoveryMode);
    } catch {
      // ignore
    }
  }, [discoveryMode]);
  // When the operator flips modes, snap kind back to a supported value
  // so the dropdown doesn't show a blank selection for a hidden option.
  useEffect(() => {
    const supported: SearchKind[] = experimentalDiscovery
      ? ["handle", "mentions", "location", "keyword", "hashtag"]
      : ["handle", "mentions"];
    if (!supported.includes(newSearchKind)) setNewSearchKind("handle");
  }, [experimentalDiscovery, newSearchKind]);
  const [newSearchValue, setNewSearchValue] = useState("");
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [discoveryPosts, setDiscoveryPosts] = useState<DiscoveredPost[]>([]);
  const [discoveryPages, setDiscoveryPages] = useState<DiscoveredPage[]>([]);
  const [discoveryFetchState, setDiscoveryFetchState] = useState<FetchState>("idle");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // AI-generated reply drafts, keyed by post id. Kept separate from the
  // posts list so a draft persists across poll refetches and status
  // changes without us having to rewrite the full post object.
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});

  // RapidAPI IG scraper settings (for Keyword + Location discovery).
  // Operator can paste these in a panel on the Discovery tab; the API
  // key is never echoed back — we only surface whether one is set.
  const [scraperSettings, setScraperSettings] = useState<IgScraperSettings>({
    hasApiKey: false,
    host: null,
    locationSearchPath: null,
    locationPostsPath: null,
    updatedAt: null,
  });
  const [scraperPanelOpen, setScraperPanelOpen] = useState(false);
  const [scraperKeyDraft, setScraperKeyDraft] = useState("");
  const [scraperHostDraft, setScraperHostDraft] = useState("");
  const [scraperSearchDraft, setScraperSearchDraft] = useState("");
  const [scraperPostsDraft, setScraperPostsDraft] = useState("");
  const [scraperSaveState, setScraperSaveState] = useState<FetchState>("idle");
  const [scraperSaveError, setScraperSaveError] = useState<string | null>(null);
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
          // Trust whichever timestamp the server sent. We used to
          // recompute minutesAgo from a `timestamp` the API never
          // returned, which pinned every card to "10m ago".
          const timestampIso = comment.timestamp ?? null;
          const parsed = timestampIso ? new Date(timestampIso) : null;
          const minutesAgo =
            parsed && Number.isFinite(parsed.getTime())
              ? Math.max(1, Math.round((Date.now() - parsed.getTime()) / 60000))
              : null;
          const serverTime = typeof comment.time === "string" ? comment.time.trim() : "";
          const displayTime =
            serverTime ||
            (minutesAgo != null
              ? minutesAgo < 60
                ? `${minutesAgo}m ago`
                : minutesAgo < 1440
                  ? `${Math.floor(minutesAgo / 60)}h ago`
                  : `${Math.floor(minutesAgo / 1440)}d ago`
              : "recent");
          const text = String(comment.text ?? "").trim() || "Instagram comment";
          const commentId = String(comment.id ?? `ig-${Date.now()}`);
          // Re-apply any prior triage decision so approved/saved/skipped
          // comments don't re-appear in "Ready now" after refetch.
          const priorDecision = decisionMap[commentId];
          // Meta only returns `username` when the commenter is a public
          // business / creator IG account. For anonymous private commenters
          // we show "private user" instead of a misleading @instagram_user.
          const rawHandle = String(comment.username ?? "").replace(/^@+/, "").trim();
          const author = rawHandle ? `@${rawHandle}` : "private user";
          return {
            id: commentId,
            clientId: activeClientId,
            author,
            platform: "Instagram",
            time: displayTime,
            text,
            // Reply draft starts empty; AI fills it lazily on demand.
            comment: "",
            mediaUrl: String(comment.mediaUrl ?? "").trim(),
            permalink: comment.permalink ? String(comment.permalink) : null,
            postCaption: comment.postCaption
              ? String(comment.postCaption)
              : null,
            status: priorDecision
              ? (statusFromDecision(priorDecision) as PostStatus)
              : ("new" as const),
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

  async function runDiscoverySearch(search: SavedSearch): Promise<boolean> {
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
        return false;
      }
      setDiscoveryPosts(json.posts ?? []);
      setDiscoveryPages(json.pages ?? []);
      setDiscoveryFetchState("success");
      return true;
    } catch (err) {
      setDiscoveryFetchState("error");
      setDiscoveryError(
        err instanceof Error ? err.message : "Discovery lookup failed"
      );
      setDiscoveryPosts([]);
      setDiscoveryPages([]);
      return false;
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
    const ok = await runDiscoverySearch(result.search);
    // If the lookup failed (e.g. FB vanity doesn't resolve as an IG handle
    // via Business Discovery), auto-remove the broken saved search so the
    // operator doesn't have a pill that always errors. They keep the error
    // banner explaining what to try next.
    if (!ok) {
      await removeInteractionSearch(result.search.id);
      setSavedSearches((prev) => prev.filter((s) => s.id !== result.search.id));
    }
  }

  // Hydrate scraper settings once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await getIgScraperSettings();
      if (cancelled) return;
      setScraperSettings(current);
      setScraperHostDraft(current.host ?? "");
      setScraperSearchDraft(current.locationSearchPath ?? "");
      setScraperPostsDraft(current.locationPostsPath ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveScraperSettings() {
    setScraperSaveState("loading");
    setScraperSaveError(null);
    try {
      const res = await saveIgScraperSettings({
        apiKey: scraperKeyDraft.trim() || undefined,
        host: scraperHostDraft,
        locationSearchPath: scraperSearchDraft,
        locationPostsPath: scraperPostsDraft,
      });
      if (!res.ok) {
        setScraperSaveState("error");
        setScraperSaveError(res.error);
        return;
      }
      const fresh = await getIgScraperSettings();
      setScraperSettings(fresh);
      setScraperKeyDraft("");
      setScraperSaveState("success");
    } catch (err) {
      setScraperSaveState("error");
      setScraperSaveError(
        err instanceof Error ? err.message : "Save failed"
      );
    }
  }

  function handleChangeReply(postId: string, value: string) {
    setReplyDrafts((prev) => ({ ...prev, [postId]: value }));
  }

  async function handleGenerateReply(post: Post) {
    if (replyLoading[post.id]) return;
    setReplyLoading((prev) => ({ ...prev, [post.id]: true }));
    try {
      const res = await fetch("/api/interaction/suggest-reply", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentText: post.text,
          commentAuthor: post.author,
          postCaption: post.postCaption ?? null,
          accountName: activeClient?.name ?? null,
          previous: replyDrafts[post.id] ?? "",
        }),
      });
      const json = (await res.json()) as { ok: boolean; reply?: string; error?: string };
      if (!res.ok || !json.ok) {
        alert(
          `Could not generate a reply: ${json.error ?? "unknown error"}`
        );
        return;
      }
      setReplyDrafts((prev) => ({ ...prev, [post.id]: json.reply ?? "" }));
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Could not generate a reply."
      );
    } finally {
      setReplyLoading((prev) => ({ ...prev, [post.id]: false }));
    }
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

  // Remember the active account across reloads so the operator doesn't
  // have to re-pick their client every time they open the page.
  useEffect(() => {
    if (!activeClientId) return;
    try {
      window.localStorage.setItem("interaction-active-account", activeClientId);
    } catch {
      // ignore quota / privacy errors
    }
  }, [activeClientId]);

  // Hydrate / persist the English-only filter across sessions.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("interaction-english-only");
      if (stored === "true" || stored === "false") {
        setEnglishOnly(stored === "true");
      }
    } catch {
      // localStorage unavailable — keep default
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("interaction-english-only", String(englishOnly));
    } catch {
      // ignore quota / privacy errors
    }
  }, [englishOnly]);

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
    // Rely on server-side newest-first ordering; no more derived-score
    // sort (we removed the scores themselves).
    let list = [...clientPosts];
    if (englishOnly) list = list.filter((p) => looksEnglish(p.text));
    if (feedSearch.trim()) {
      const q = feedSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.text.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q)
      );
    }
    return list;
  }, [clientPosts, feedSearch, englishOnly]);

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
            <button
              onClick={() => setEnglishOnly((v) => !v)}
              title="Hide comments whose text looks like another language"
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                englishOnly
                  ? "border-black bg-black text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {englishOnly ? "English only" : "Any language"}
            </button>
          </div>
        </div>
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Ready now</div>
            <div className="text-xs text-gray-400">{ready.length} items</div>
          </div>
          <div className="space-y-5">
            {ready.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Nothing new right now. The feed polls every 30 seconds.
              </div>
            )}
            {ready.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                selected={active?.id === post.id}
                accountName={activeClient?.name}
                replyDraft={replyDrafts[post.id] ?? ""}
                replyLoading={Boolean(replyLoading[post.id])}
                onChangeReply={(v) => handleChangeReply(post.id, v)}
                onGenerateReply={() => void handleGenerateReply(post)}
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
        {saved.length > 0 && (
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
                  accountName={activeClient?.name}
                  replyDraft={replyDrafts[post.id] ?? ""}
                  replyLoading={Boolean(replyLoading[post.id])}
                  onChangeReply={(v) => handleChangeReply(post.id, v)}
                  onGenerateReply={() => void handleGenerateReply(post)}
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
        )}
        {handled.length > 0 && (
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
                  accountName={activeClient?.name}
                  replyDraft={replyDrafts[post.id] ?? ""}
                  replyLoading={Boolean(replyLoading[post.id])}
                  onChangeReply={(v) => handleChangeReply(post.id, v)}
                  onGenerateReply={() => void handleGenerateReply(post)}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDiscoveryMode("stable")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                !experimentalDiscovery
                  ? "border-black bg-black text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Discovery
            </button>
            <button
              onClick={() => setDiscoveryMode("v2")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                experimentalDiscovery
                  ? "border-amber-600 bg-amber-50 text-amber-900"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Discovery V2 (experimental)
            </button>
          </div>
          <div className="text-xs text-gray-500">
            {experimentalDiscovery
              ? "Scraper-backed sources. Flaky by design — switch back any time."
              : "Meta Graph only. Free, reliable. Handles + tagged mentions."}
          </div>
        </div>
      </div>
      {experimentalDiscovery && (
      <details
        className="rounded-2xl border border-gray-200 bg-white"
        open={scraperPanelOpen}
        onToggle={(e) => setScraperPanelOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 list-none">
          <div>
            <div className="text-sm font-semibold text-gray-900">RapidAPI integration</div>
            <div className="mt-0.5 text-xs text-gray-500">
              Paste your RapidAPI Instagram scraper details here so Keyword
              and Location discovery can reach the scraper.
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`rounded-full border px-2 py-0.5 ${
                scraperSettings.hasApiKey
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {scraperSettings.hasApiKey ? "● API key saved" : "● No API key"}
            </span>
            <span className="text-gray-400">{scraperPanelOpen ? "Hide" : "Edit"}</span>
          </div>
        </summary>
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">
                x-rapidapi-key
              </span>
              <input
                type="password"
                value={scraperKeyDraft}
                onChange={(e) => setScraperKeyDraft(e.target.value)}
                placeholder={
                  scraperSettings.hasApiKey
                    ? "••••••••  (leave blank to keep existing)"
                    : "Paste your RapidAPI key"
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">
                x-rapidapi-host
              </span>
              <input
                type="text"
                value={scraperHostDraft}
                onChange={(e) => setScraperHostDraft(e.target.value)}
                placeholder="instagram-scraper-api2.p.rapidapi.com"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs font-medium text-gray-700">
                Location search path <span className="text-gray-400">(use <code>{`{q}`}</code> for the query)</span>
              </span>
              <input
                type="text"
                value={scraperSearchDraft}
                onChange={(e) => setScraperSearchDraft(e.target.value)}
                placeholder="/v1/location_search?query={q}"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-black"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs font-medium text-gray-700">
                Location posts path <span className="text-gray-400">(use <code>{`{id}`}</code> for the location id)</span>
              </span>
              <input
                type="text"
                value={scraperPostsDraft}
                onChange={(e) => setScraperPostsDraft(e.target.value)}
                placeholder="/v1/location_posts?location_id={id}"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-black"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSaveScraperSettings}
              disabled={scraperSaveState === "loading"}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {scraperSaveState === "loading" ? "Saving…" : "Save settings"}
            </button>
            {scraperSaveState === "success" && (
              <span className="text-xs text-emerald-700">Saved.</span>
            )}
            {scraperSaveState === "error" && scraperSaveError && (
              <span className="text-xs text-amber-700">{scraperSaveError}</span>
            )}
            <span className="ml-auto text-[11px] text-gray-400">
              Stored server-side, never returned to the browser. Blank host /
              path fields fall back to their defaults.
            </span>
          </div>
        </div>
      </details>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-900">Add a discovery source</div>
        <div className="mt-1 text-xs text-gray-500">
          {experimentalDiscovery
            ? "Experimental. Keyword + location go through RapidAPI (paid). Hashtag requires Meta app review. Competitor and mentions work out of the box via Meta Graph."
            : "Meta Graph only. Competitor handle runs Business Discovery; mentions shows posts that tag this account. Both free."}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={newSearchKind}
            onChange={(e) => setNewSearchKind(e.target.value as SearchKind)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="handle">Competitor / creator handle</option>
            <option value="mentions">Posts that tag me</option>
            {experimentalDiscovery && (
              <>
                <option value="location">IG location (RapidAPI)</option>
                <option value="keyword">Keyword (RapidAPI)</option>
                <option value="hashtag">Hashtag (gated by Meta)</option>
              </>
            )}
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
                    : newSearchKind === "location"
                      ? "Paste an IG location URL, or the numeric location ID"
                      : "#hashtag"
              }
              className="min-w-[240px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            />
          )}
          {newSearchKind === "location" && (
            <div className="flex w-full flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span>
                Instagram blocks automatic location name lookups. Fastest
                workaround:
              </span>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(
                  `site:instagram.com/explore/locations ${newSearchValue || "your place name"}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-800 hover:border-black hover:text-black"
              >
                Search Google for IG locations ↗
              </a>
              <span>
                → click any result → copy the URL → paste it here. Or paste
                a raw numeric location ID.
              </span>
            </div>
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

      {(() => {
        // Hide saved pills for kinds we no longer expose on this flavour
        // of Discovery. They still live in the DB (and resurface on v2)
        // so the operator's history isn't lost.
        const visibleSearches = experimentalDiscovery
          ? savedSearches
          : savedSearches.filter(
              (s) => s.kind === "handle" || s.kind === "mentions"
            );
        if (visibleSearches.length === 0) return null;
        return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-900">Saved searches</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleSearches.map((s) => (
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
                  {s.kind === "location" && `📍 ${s.value}`}
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
        );
      })()}

      {discoveryFetchState === "loading" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading posts from Meta…
        </div>
      )}

      {(discoveryFetchState === "error" || (discoveryError && discoveryFetchState !== "loading")) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Discovery lookup failed</div>
              <div className="mt-1 text-xs opacity-90">{discoveryError}</div>
            </div>
            {/permission|token|expired|#10|scope/i.test(discoveryError ?? "") &&
              reconnectUrl(activeAccountMeta) && (
                <a
                  href={reconnectUrl(activeAccountMeta) ?? "#"}
                  className="shrink-0 rounded-md border border-amber-700 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Reconnect Instagram
                </a>
              )}
          </div>
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
                            ? "Try this handle against Meta Business Discovery. The Facebook vanity sometimes doesn't match Instagram — if it fails, paste the real @handle in the box above."
                            : "No handle on this page — can't run Business Discovery"
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

      {(() => {
        // Apply the same English filter the operator set on the Feed tab
        // so discovery doesn't contradict their language preference.
        const visibleDiscovery = englishOnly
          ? discoveryPosts.filter((p) => looksEnglish(p.text))
          : discoveryPosts;
        if (visibleDiscovery.length === 0) return null;
        return (
        <div className="space-y-4">
          {visibleDiscovery.map((post) => (
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
                  {(() => {
                    // Always surface a click-through. Prefer the post
                    // permalink; fall back to the author's profile URL
                    // derived from their @handle so there's never a dead
                    // card.
                    const authorHandleRaw = post.author.startsWith("@")
                      ? post.author.slice(1)
                      : "";
                    const authorFallback =
                      authorHandleRaw && /^[a-z0-9._-]+$/i.test(authorHandleRaw)
                        ? post.source === "business_discovery" ||
                          post.source === "hashtag"
                          ? `https://www.instagram.com/${authorHandleRaw}/`
                          : `https://www.facebook.com/${authorHandleRaw}`
                        : null;
                    const href = post.permalink ?? authorFallback;
                    const platformLabel =
                      post.source === "business_discovery" ||
                      post.source === "hashtag"
                        ? "Instagram"
                        : "Facebook";
                    if (!href) return null;
                    const label = post.permalink
                      ? `Open post on ${platformLabel} ↗`
                      : `Open @${authorHandleRaw} on ${platformLabel} ↗`;
                    return (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-black bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                        >
                          {label}
                        </a>
                        {!post.permalink && (
                          <span className="text-[11px] italic text-gray-400">
                            No direct post link — opens the author&rsquo;s profile instead.
                          </span>
                        )}
                      </div>
                    );
                  })()}
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
        );
      })()}
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
            {bannerMessages.map((msg, i) => {
              const showReconnect =
                /token|permission|expired|#10|scope/i.test(
                  `${msg.title} ${msg.body}`
                ) && Boolean(reconnectUrl(activeAccountMeta));
              return (
                <div
                  key={i}
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    msg.tone === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-sky-200 bg-sky-50 text-sky-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{msg.title}</div>
                      <div className="mt-0.5 text-xs opacity-90">{msg.body}</div>
                    </div>
                    {showReconnect && (
                      <a
                        href={reconnectUrl(activeAccountMeta) ?? "#"}
                        className="shrink-0 rounded-md border border-current px-3 py-1 text-xs font-semibold hover:bg-white/40"
                      >
                        Reconnect Instagram
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
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
              {reconnectUrl(activeAccountMeta) && (
                <a
                  href={reconnectUrl(activeAccountMeta) ?? "#"}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  title="Re-run OAuth to refresh the Instagram access token with current app scopes"
                >
                  Reconnect Instagram
                </a>
              )}
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

"use client";

import { useEffect, useMemo, useState } from "react";

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

type ClientOption = { id: string; name: string; handle: string };

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
  posterType?: PosterType;
  followerCount?: number | null;
  engagementRate?: number | null;
  posterScore?: number;
  posterReasons?: string[];
  onIslandNow?: boolean;
  islandSignals?: string[];
};

type InstagramCommentsApiResponse = {
  ok: boolean;
  comments?: InstagramCommentApiItem[];
  fetched?: number;
  error?: string;
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
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.mediaUrl} alt={post.text} className="h-full w-full object-cover" />
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
              <div className="text-base font-semibold tracking-tight text-gray-950">{post.author}</div>
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

export default function InteractionEngineUI({ initialClients = [] }: { initialClients?: ClientOption[] }) {
  const [clients, setClients] = useState<ClientOption[]>(initialClients);
  const [activeClientId, setActiveClientId] = useState(initialClients[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Feed");
  const [selectedId, setSelectedId] = useState("");
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [isLive, setIsLive] = useState(true);
  const [highValueOnly, setHighValueOnly] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedPosterFilter, setFeedPosterFilter] = useState<"all" | "tourist" | "creator">("all");
  const [ingestionState, setIngestionState] = useState<FetchState>("idle");
  const [ingestionError, setIngestionError] = useState<string | null>(null);
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
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, ...patch } : post))
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function ingestInstagramComments() {
      setIngestionState((prev) => (prev === "idle" ? "loading" : prev));
      setIngestionError(null);
      try {
        const res = await fetch(
          `/api/interaction/instagram-comments?accountId=${encodeURIComponent(activeClientId)}&limit=20`,
          { cache: "no-store" }
        );
        const payload: InstagramCommentsApiResponse = await res.json();
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to fetch Instagram comments.");
        }

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
          return {
            id: String(comment.id ?? `ig-${Date.now()}`),
            clientId: activeClientId,
            author: `@${String(comment.username ?? "instagram_user").replace(/^@/, "")}`,
            platform: "Instagram",
            time: `${minutesAgo}m ago`,
            text,
            relevance: 80 + Math.floor(Math.random() * 18),
            opportunity: 70 + Math.floor(Math.random() * 22),
            risk: 8 + Math.floor(Math.random() * 18),
            comment: "Helpful local recommendation based on their question and timing.",
            mediaUrl:
              "https://images.unsplash.com/photo-1504674900247-ec6e0c6c1c9c?auto=format&fit=crop&w=1200&q=80",
            status: "new" as const,
            why: ["Live Instagram comment", "High intent signal", "Fresh opportunity window"],
            posterType,
            followerCount: Number.isFinite(followerCount) ? Number(followerCount) : null,
            engagementRate: Number.isFinite(engagementRate) ? Number(engagementRate) : null,
            posterScore,
            posterReasons: comment.posterReasons ?? [],
            onIslandNow: Boolean(comment.onIslandNow),
            islandSignals: Array.isArray(comment.islandSignals)
              ? comment.islandSignals.map((signal) => String(signal))
              : [],
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
  }, [activeClientId]);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      const newPost: Post = {
        id: `post-${Date.now()}`,
        clientId: activeClientId,
        author: "@newtraveller",
        platform: "Instagram",
        time: "2m ago",
        text: "Any must-visit food spots in Zanzibar right now?",
        relevance: 82 + Math.floor(Math.random() * 17),
        opportunity: 72 + Math.floor(Math.random() * 24),
        risk: 5 + Math.floor(Math.random() * 18),
        comment:
          "There are a couple of really fresh spots around Kendwa depending on what you are looking for 👀",
        mediaUrl:
          "https://images.unsplash.com/photo-1504674900247-ec6e0c6c1c9c?auto=format&fit=crop&w=1200&q=80",
        status: "new",
        why: ["Live tourist intent", "Fresh post", "High reply potential"],
        onIslandNow: true,
        islandSignals: ["Zanzibar"],
      };
      setPosts((prev) => [newPost, ...prev].slice(0, 20));
    }, 8000);
    return () => clearInterval(interval);
  }, [isLive]);

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
                <div className="text-lg font-semibold tracking-tight">{active.author}</div>
                <div className="text-sm text-gray-500">
                  {active.platform} • {active.time}
                </div>
              </div>
              <div className="text-xs text-gray-400">Detail panel</div>
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
    <div>
      <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:col-span-2">
          <div className="text-sm font-semibold text-gray-900">Search conversations</div>
          <div className="mt-1 text-sm text-gray-500">
            Find posts outside your audience that your brand should jump into first.
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find people asking about food in Zanzibar tonight..."
            className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-black"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs">Last 1h</button>
            <button
              onClick={() => setFilterLowReplies((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-xs ${filterLowReplies ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              Low replies
            </button>
            <button
              onClick={() => setFilterQuestionsOnly((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-xs ${filterQuestionsOnly ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              Questions only
            </button>
            <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs">Zanzibar now</button>
            <button
              onClick={() => {
                setFilterTourists((v) => !v);
                setFilterCreators(false);
              }}
              className={`rounded-lg border px-3 py-2 text-xs ${filterTourists ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              Tourists
            </button>
            <button
              onClick={() => {
                setFilterCreators((v) => !v);
                setFilterTourists(false);
              }}
              className={`rounded-lg border px-3 py-2 text-xs ${filterCreators ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              Creators
            </button>
            <button
              onClick={() => setFilterVerified((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-xs ${filterVerified ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              Verified
            </button>
            <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs">
              AI query translation
            </button>
            <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs">Batch add</button>
            <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs">Live stream</button>
          </div>
        </div>
        <div className="rounded-2xl border border-black bg-black p-5 text-white">
          <div className="text-xs uppercase tracking-[0.2em] text-white/60">Discovery engine</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{discoveryResults.length}</div>
          <div className="mt-2 text-sm text-white/70">high-intent opportunities found</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Auto-queue</div>
          <div className="mt-2 text-sm font-semibold text-gray-900">High-score posts</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500">Auto-add discovery results scoring 90+</div>
            <button
              onClick={() => setAutoQueue((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs ${autoQueue ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              {autoQueue ? "On" : "Off"}
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Saved searches</div>
          <div className="mt-2 text-sm font-semibold text-gray-900">Reusable discovery sets</div>
          <div className="mt-2 text-sm text-gray-500">Concept shown in UI</div>
        </div>
      </div>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Discovery upgrades map</div>
            <div className="mt-1 text-sm text-gray-500">
              All 10 improvements are represented here. The first 3 are implemented in code.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-black bg-black px-3 py-1.5 text-white">
              1 Intent detection ✓
            </span>
            <span className="rounded-full border border-black bg-black px-3 py-1.5 text-white">
              2 Reply competition ✓
            </span>
            <span className="rounded-full border border-black bg-black px-3 py-1.5 text-white">
              3 Time decay ✓
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              4 Auto-queue
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              5 AI query translation
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              6 Source filtering
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              7 Why this is good
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              8 Batch add
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              9 Saved searches
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-700">
              10 Live stream
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {discoveryResults.length ? (
            discoveryResults.map((post) => renderDiscoveryCard(post))
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              No discovery results right now.
            </div>
          )}
        </div>
        <div className="sticky top-8 h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          {selectedDiscovery ? (
            <>
              <div className="text-lg font-semibold tracking-tight">Discovery preview</div>
              <div className="mt-1 text-xs text-gray-400">
                See the AI response before sending it into Operator mode.
              </div>
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400">
                  Found conversation
                </div>
                <div className="mt-2 text-sm font-semibold text-gray-900">{selectedDiscovery.author}</div>
                <div className="mt-1 text-xs text-gray-400">
                  {selectedDiscovery.platform} • {selectedDiscovery.time}
                </div>
                <div className="mt-3 text-sm leading-6 text-gray-800">"{selectedDiscovery.text}"</div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-gray-400">Intent</div>
                  <div className="mt-1 font-semibold capitalize text-gray-900">
                    {selectedDiscovery.intent}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-gray-400">Replies</div>
                  <div className="mt-1 font-semibold text-gray-900">{selectedDiscovery.replyCount}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-gray-400">Freshness</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {getFreshnessWeight(selectedDiscovery.time) > 0
                      ? `+${getFreshnessWeight(selectedDiscovery.time)}`
                      : getFreshnessWeight(selectedDiscovery.time)}
                  </div>
                </div>
              </div>
              {selectedDiscoveryBest ? (
                <div className="mt-5 rounded-2xl border border-black bg-black p-4 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/60">
                      Suggested response
                    </div>
                    <div className="rounded-full bg-white/10 px-2.5 py-1 text-[10px]">
                      {selectedDiscoveryBest.winProbability}% win
                    </div>
                  </div>
                  <div className="mt-3 text-base font-medium leading-7">{selectedDiscoveryBest.text}</div>
                  <div className="mt-3 text-xs text-white/60">{selectedDiscoveryBest.why}</div>
                </div>
              ) : null}
              <div className="mt-5 rounded-2xl border border-gray-200 p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Why this is good</div>
                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                  <li>• Strong intent signal from the wording.</li>
                  <li>• Reply competition is still manageable.</li>
                  <li>• Timing window is still open enough to matter.</li>
                </ul>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="rounded-xl border border-gray-200 py-3 text-sm hover:bg-gray-50">
                  Batch add
                </button>
                <button className="rounded-xl border border-gray-200 py-3 text-sm hover:bg-gray-50">
                  Save search
                </button>
              </div>
              <button
                onClick={() => addDiscoveryToQueue(selectedDiscovery)}
                className="mt-5 w-full rounded-xl bg-black py-3 text-sm font-medium text-white hover:opacity-90"
              >
                Add to Operator queue →
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              No discovery results right now.
            </div>
          )}
        </div>
      </div>

      {/* Hashtag monitor & search queries */}
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Hashtags to monitor</div>
              <div className="mt-0.5 text-xs text-gray-500">Organised by client type — use filters above to match your client's offer.</div>
            </div>
          </div>
          {["Location", "Food & Drink", "Accommodation", "Activities", "Wellness", "Nightlife"].map((cat) => {
            const tags = DISCOVERY_HASHTAGS.filter((h) => h.category === cat);
            return (
              <div key={cat} className="mb-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((h) => (
                    <a
                      key={h.tag}
                      href={`https://www.instagram.com/explore/tags/${h.tag.slice(1)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={h.intent}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
                        h.volume === "High"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : h.volume === "Medium"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      {h.tag}
                      <span className="text-[9px] opacity-50">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="mb-3">
            <div className="text-sm font-semibold text-gray-900">Search queries to intercept</div>
            <div className="mt-0.5 text-xs text-gray-500">Questions people ask that match common client offers across categories.</div>
          </div>
          {["Food", "Accommodation", "Activities", "Discovery"].map((cat) => {
            const kws = DISCOVERY_KEYWORDS.filter((k) => k.category === cat);
            return (
              <div key={cat} className="mb-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{cat}</div>
                <div className="space-y-2">
                  {kws.map((k) => (
                    <div key={k.keyword} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5">
                      <span className="text-sm text-gray-800">"{k.keyword}"</span>
                      <span className={`ml-3 shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                        k.priority === "High"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}>{k.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-black">
      <main className="px-6 py-8 md:px-10">
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

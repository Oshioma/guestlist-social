"use client";

import { useEffect, useMemo, useState } from "react";

type PostStatus = "new" | "approved" | "skipped" | "saved";
type Tab =
  | "Feed"
  | "Saved Audiences"
  | "Competitors"
  | "Playbook"
  | "Results"
  | "Learnings";
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
};

const CLIENTS = [
  {
    id: "client-organzibar",
    name: "Organzibar",
    handle: "@organzibar",
  },
];

const INITIAL_POSTS: Post[] = [
  {
    id: "post-1",
    clientId: "client-organzibar",
    author: "@travelwithmaya",
    platform: "Instagram",
    time: "22m ago",
    text: "Best smoothie bowl I've had in Zanzibar?",
    relevance: 94,
    opportunity: 88,
    risk: 12,
    comment:
      "A couple of really fresh spots near Kendwa depending on what vibe you want 👀",
    mediaUrl:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=80",
    status: "new",
    why: ["Tourist in Zanzibar now", "Direct food intent", "Fresh post with reply upside"],
  },
  {
    id: "post-2",
    clientId: "client-organzibar",
    author: "@nomadnourish",
    platform: "Instagram",
    time: "41m ago",
    text: "Any good healthy lunch spots near Nungwi or Kendwa?",
    relevance: 91,
    opportunity: 84,
    risk: 9,
    comment:
      "Some great clean food spots around there - depends if you want beach or tucked away.",
    mediaUrl:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    status: "saved",
    why: ["Question-led post", "Strong audience match", "Useful creator to keep watching"],
  },
  {
    id: "post-3",
    clientId: "client-organzibar",
    author: "@kendwa.days",
    platform: "X",
    time: "19m ago",
    text: "Where's actually worth eating in Kendwa without it feeling too touristy?",
    relevance: 96,
    opportunity: 91,
    risk: 8,
    comment:
      "A few spots around Kendwa still feel genuinely calm and fresh rather than overdone - depends what kind of atmosphere you want.",
    mediaUrl:
      "https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1200&q=80",
    status: "new",
    why: ["High buyer intent", "Excellent local-fit signal", "Very fresh timing window"],
  },
  {
    id: "post-4",
    clientId: "client-organzibar",
    author: "@slowtravelzanzibar",
    platform: "Instagram",
    time: "2h ago",
    text: "Zanzibar hidden gem lunch spots? Calm atmosphere only.",
    relevance: 86,
    opportunity: 73,
    risk: 18,
    comment:
      "A couple of calmer places come to mind if you want fresh food and a slower feel rather than the obvious stops.",
    mediaUrl:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=80",
    status: "skipped",
    why: ["Relevant topic", "Slightly late timing", "Still decent fit but lower upside"],
  },
];

const AUDIENCE_SETS = [
  {
    id: "aud-1",
    title: "Zanzibar Tourists",
    description: "People already on-island asking where to go, eat, or stay.",
    count: 42,
    status: "Active",
  },
  {
    id: "aud-2",
    title: "Food Creators",
    description: "Micro-creators with taste-led audiences and strong reply potential.",
    count: 18,
    status: "Active",
  },
  {
    id: "aud-3",
    title: "Wellness Travellers",
    description: "Audience aligned with healthy food, slower pace, and premium calm.",
    count: 12,
    status: "Active",
  },
];

const COMPETITORS = [
  {
    id: "comp-1",
    handle: "@zanzibarfoodguide",
    description: "Useful for food-intent comments and discovery overlap.",
    overlap: "High overlap",
  },
  {
    id: "comp-2",
    handle: "@kendwaescapes",
    description: "Good source for tourist questions and creator engagement trails.",
    overlap: "Medium overlap",
  },
  {
    id: "comp-3",
    handle: "@nungwi_lifestyle",
    description: "Broader lifestyle audience, slightly noisier but still useful.",
    overlap: "Medium overlap",
  },
];

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

const RESULTS = [
  { id: "res-1", label: "Comments made", value: "12" },
  { id: "res-2", label: "Replies received", value: "5" },
  { id: "res-3", label: "Profile visits", value: "18" },
  { id: "res-4", label: "New follows", value: "3" },
];

const LEARNINGS = [
  "Posts under 45 minutes old are getting the strongest reply rates.",
  "Tourists already in Zanzibar outperform generic travel posts.",
  "Helpful recommendation comments beat compliments alone.",
  "Micro-creators are giving stronger follow-back potential.",
];

function getEngageScore(post: Post) {
  return Math.max(
    1,
    Math.round(post.relevance * 0.4 + post.opportunity * 0.45 + (100 - post.risk) * 0.15)
  );
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
              {scorePill("Risk", post.risk, "risk")}
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

export default function InteractionEngineUI() {
  const [activeClientId] = useState("client-organzibar");
  const [activeTab, setActiveTab] = useState<Tab>("Feed");
  const [selectedId, setSelectedId] = useState("post-1");
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [isLive, setIsLive] = useState(true);
  const [highValueOnly, setHighValueOnly] = useState(true);

  const tabs: Tab[] = ["Feed", "Saved Audiences", "Competitors", "Playbook", "Results", "Learnings"];

  const activeClient = CLIENTS.find((c) => c.id === activeClientId) ?? CLIENTS[0];
  const clientPosts = useMemo(
    () => posts.filter((p) => p.clientId === activeClient.id),
    [posts, activeClient.id]
  );

  const updatePost = (postId: string, patch: Partial<Post>) => {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, ...patch } : post))
    );
  };

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      const newPost: Post = {
        id: `post-${Date.now()}`,
        clientId: "client-organzibar",
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
      };
      setPosts((prev) => [newPost, ...prev].slice(0, 20));
    }, 8000);
    return () => clearInterval(interval);
  }, [isLive]);

  const visiblePosts = useMemo(() => {
    if (!highValueOnly) return clientPosts;
    return clientPosts.filter((post) => getEngageScore(post) >= 85);
  }, [clientPosts, highValueOnly]);

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

  const renderFeed = () => (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_420px]">
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-gray-900">Decision mode</div>
            <div className="mt-1 text-sm text-gray-500">
              Only surface the best opportunities first and act directly from the feed.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHighValueOnly((v) => !v)}
              className={`rounded-lg border px-4 py-2 text-sm transition ${highValueOnly ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {highValueOnly ? "High value only" : "Show all"}
            </button>
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
              {scorePill("Risk", active.risk, "risk")}
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
              <div className="mt-2 text-2xl font-semibold tracking-tight">{activeClient.name}</div>
              <div className="text-sm text-gray-500">{activeClient.handle}</div>
            </div>
            <div className="flex items-center gap-3">
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
                "High-quality interaction opportunities ranked by intent, timing, and potential upside."}
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

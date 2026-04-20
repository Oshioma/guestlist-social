"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "../components/SectionCard";
import ImageUpload from "../components/ImageUpload";
import type {
  ProoferPost,
  ProoferStatus,
  ProoferPlatform,
  ContentPillar,
  IdeaKind,
  PostIdea,
} from "../lib/types";
import { PROOFER_PLATFORMS, PROOFER_PLATFORM_LABELS } from "../lib/types";
import type { ProoferIdeaLite } from "../lib/queries";
import {
  saveProoferPostAction,
  updateProoferStatusAction,
  deleteProoferPostAction,
  addProoferCommentAction,
  toggleProoferCommentResolvedAction,
  createContentPillarAction,
  updateContentPillarAction,
  archiveContentPillarAction,
  rejectPostIdeaAction,
  clearPostIdeasAction,
} from "../lib/proofer-actions";

const DEFAULT_PLATFORM: ProoferPlatform = "instagram_feed";

function postKey(dateKey: string, platform: ProoferPlatform): string {
  return `${dateKey}|${platform}`;
}

type ClientLite = { id: string; name: string };
type MonthOpt = { value: string; label: string };

type ProoferCommentLite = {
  id: string;
  postId: string;
  comment: string;
  createdBy: string;
  resolved: boolean;
  createdAt: string;
};

const STATUS_BUTTONS: {
  value: ProoferStatus;
  label: string;
  bg: string;
  border: string;
  color: string;
  dot: string;
}[] = [
  {
    value: "improve",
    label: "Improve",
    bg: "#fee2e2",
    border: "#fca5a5",
    color: "#991b1b",
    dot: "#ef4444",
  },
  {
    value: "check",
    label: "Check",
    bg: "#fef9c3",
    border: "#fde047",
    color: "#854d0e",
    dot: "#f59e0b",
  },
  {
    value: "proofed",
    label: "Proofed → Publish Queue",
    bg: "#dcfce7",
    border: "#86efac",
    color: "#166534",
    dot: "#22c55e",
  },
  {
    value: "approved",
    label: "Approved",
    bg: "#e0f2fe",
    border: "#38bdf8",
    color: "#075985",
    dot: "#3b82f6",
  },
];

function daysInMonth(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const out: Date[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let i = 1; i <= last; i++) {
    out.push(new Date(y, m - 1, i));
  }
  return out;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function formatDayLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCommentTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderCommentText(text: string): React.ReactNode {
  const parts = text.split(/(@\w[\w.-]*)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span
        key={i}
        style={{
          color: "#4338ca",
          fontWeight: 600,
          background: "#eef2ff",
          padding: "0 3px",
          borderRadius: 3,
        }}
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function prettyFileName(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(last);
    return decoded.replace(/^\d{10,}_/, "") || url;
  } catch {
    return url.split("/").pop() || url;
  }
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url);
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#71717a",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#3f3f46",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

export default function ProoferBoard({
  clients,
  months,
  initialClientId,
  initialMonth,
  initialPosts,
  initialPillars,
  initialIdeas,
  initialPostIdeas,
}: {
  clients: ClientLite[];
  months: MonthOpt[];
  initialClientId: string;
  initialMonth: string;
  initialPosts: ProoferPost[];
  initialPillars: ContentPillar[];
  initialIdeas: ProoferIdeaLite[];
  initialPostIdeas: PostIdea[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [clientId, setClientId] = useState(initialClientId);
  const [month, setMonth] = useState(initialMonth);
  const [hideEmpty, setHideEmpty] = useState(false);

  type Draft = {
    caption: string;
    mediaUrls: string[];
    pillarId: string | null;
    linkedIdeaId: string | null;
    linkedIdeaKind: IdeaKind | null;
    publishTime: string;
  };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [hideResolved, setHideResolved] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [activePlatformByDate, setActivePlatformByDate] = useState<
    Record<string, ProoferPlatform>
  >({});
  const [pillarManagerOpen, setPillarManagerOpen] = useState(false);
  const [newPillarName, setNewPillarName] = useState("");
  const [newPillarColor, setNewPillarColor] = useState("#6366f1");
  const [newPillarDescription, setNewPillarDescription] = useState("");
  const [editingPillarId, setEditingPillarId] = useState<string | null>(null);
  const [pillarEditDraft, setPillarEditDraft] = useState<{
    name: string;
    color: string;
    description: string;
  }>({ name: "", color: "#6366f1", description: "" });
  const [openPillarPickerKey, setOpenPillarPickerKey] = useState<string | null>(
    null
  );
  const [openIdeaPickerKey, setOpenIdeaPickerKey] = useState<string | null>(
    null
  );

  // ── AI post ideas ──────────────────────────────────────────────────────────
  const [postIdeas, setPostIdeas] = useState<PostIdea[]>(initialPostIdeas);
  const [genPlatform, setGenPlatform] = useState<ProoferPlatform>("instagram_feed");
  const [genPrompt, setGenPrompt] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ count: number; emptySlots: number } | null>(null);
  const [captionModifying, setCaptionModifying] = useState<Record<string, string | null>>({});
  const [previewIdxMap, setPreviewIdxMap] = useState<Record<string, number>>({});
  const [imgSuggestions, setImgSuggestions] = useState<Record<string, { id: number; thumb: string; full: string; photographer: string; pexelsUrl: string }[]>>({});
  const [imgSearching, setImgSearching] = useState<Record<string, boolean>>({});

  const pillarsById = useMemo(() => {
    const map = new Map<string, ContentPillar>();
    initialPillars.forEach((p) => map.set(p.id, p));
    return map;
  }, [initialPillars]);

  const postsByKey = useMemo(() => {
    const map = new Map<string, ProoferPost>();
    initialPosts.forEach((p) =>
      map.set(postKey(p.postDate.slice(0, 10), p.platform), p)
    );
    return map;
  }, [initialPosts]);

  const postIdeasByKey = useMemo(() => {
    const map = new Map<string, PostIdea[]>();
    postIdeas.forEach((idea) => {
      const k = postKey(idea.postSlotDate.slice(0, 10), idea.platform);
      const arr = map.get(k) ?? [];
      arr.push(idea);
      map.set(k, arr);
    });
    return map;
  }, [postIdeas]);

  const platformsByDate = useMemo(() => {
    const map = new Map<string, Set<ProoferPlatform>>();
    initialPosts.forEach((p) => {
      const d = p.postDate.slice(0, 10);
      const set = map.get(d) ?? new Set<ProoferPlatform>();
      set.add(p.platform);
      map.set(d, set);
    });
    return map;
  }, [initialPosts]);

  const days = useMemo(() => daysInMonth(month), [month]);

  function getActivePlatform(dateKey: string): ProoferPlatform {
    const stored = activePlatformByDate[dateKey];
    if (stored) return stored;
    const variants = platformsByDate.get(dateKey);
    if (variants && variants.size > 0) {
      for (const p of PROOFER_PLATFORMS) {
        if (variants.has(p)) return p;
      }
    }
    return DEFAULT_PLATFORM;
  }

  function setActivePlatform(dateKey: string, platform: ProoferPlatform) {
    setActivePlatformByDate((prev) => ({ ...prev, [dateKey]: platform }));
  }

  function getDraftFor(dateKey: string, platform: ProoferPlatform): Draft {
    const key = postKey(dateKey, platform);
    if (drafts[key]) return drafts[key];
    const existing = postsByKey.get(key);
    return {
      caption: existing?.caption ?? "",
      mediaUrls: existing?.mediaUrls ?? [],
      pillarId: existing?.pillarId ?? null,
      linkedIdeaId: existing?.linkedIdeaId ?? null,
      linkedIdeaKind: existing?.linkedIdeaKind ?? null,
      publishTime: existing?.publishTime ?? "18:00",
    };
  }

  function updateDraft(
    dateKey: string,
    platform: ProoferPlatform,
    patch: Partial<Draft>
  ) {
    const key = postKey(dateKey, platform);
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...getDraftFor(dateKey, platform), ...patch },
    }));
  }

  function addMediaUrl(
    dateKey: string,
    platform: ProoferPlatform,
    url: string
  ) {
    const current = getDraftFor(dateKey, platform);
    updateDraft(dateKey, platform, {
      mediaUrls: [...current.mediaUrls, url],
    });
  }

  function removeMediaAt(
    dateKey: string,
    platform: ProoferPlatform,
    index: number
  ) {
    const current = getDraftFor(dateKey, platform);
    const next = current.mediaUrls.slice();
    next.splice(index, 1);
    updateDraft(dateKey, platform, { mediaUrls: next });
  }

  function moveMedia(
    dateKey: string,
    platform: ProoferPlatform,
    index: number,
    delta: number
  ) {
    const current = getDraftFor(dateKey, platform);
    const next = current.mediaUrls.slice();
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateDraft(dateKey, platform, { mediaUrls: next });
  }

  function navigate(nextClientId: string, nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("client", nextClientId);
    params.set("month", nextMonth);
    setDrafts({});
    setOpenComments({});
    setCommentDrafts({});
    setActivePlatformByDate({});
    router.push(`/app/proofer?${params.toString()}`);
  }

  function handleSelectClient(id: string) {
    setClientId(id);
    document.cookie = `proofer_last_client=${id};path=/;max-age=${60 * 60 * 24 * 365}`;
    navigate(id, month);
  }

  function handleSelectMonth(value: string) {
    setMonth(value);
    navigate(clientId, value);
  }

  function handleSave(dateKey: string, platform: ProoferPlatform) {
    const draft = getDraftFor(dateKey, platform);
    const key = postKey(dateKey, platform);
    startTransition(async () => {
      try {
        await saveProoferPostAction(
          clientId,
          dateKey,
          platform,
          draft.caption,
          draft.mediaUrls,
          draft.pillarId,
          draft.linkedIdeaId,
          draft.linkedIdeaKind,
          draft.publishTime
        );
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  function handleStatus(
    dateKey: string,
    platform: ProoferPlatform,
    status: ProoferStatus
  ) {
    const key = postKey(dateKey, platform);
    startTransition(async () => {
      try {
        const draft = drafts[key];
        if (draft) {
          await saveProoferPostAction(
            clientId,
            dateKey,
            platform,
            draft.caption,
            draft.mediaUrls,
            draft.pillarId,
            draft.linkedIdeaId,
            draft.linkedIdeaKind
          );
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        await updateProoferStatusAction(clientId, dateKey, platform, status);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function handleDelete(dateKey: string, platform: ProoferPlatform) {
    if (!confirm("Clear this day?")) return;
    const key = postKey(dateKey, platform);
    startTransition(async () => {
      try {
        await deleteProoferPostAction(clientId, dateKey, platform);
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setCommentDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  function toggleComments(dateKey: string) {
    setOpenComments((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  }

  function handleAddComment(key: string, postId?: string) {
    const value = (commentDrafts[key] ?? "").trim();
    if (!postId) {
      alert("Save the post first before adding comments.");
      return;
    }
    if (!value) {
      alert("Write a comment first.");
      return;
    }

    startTransition(async () => {
      try {
        await addProoferCommentAction(postId, value);
        setCommentDrafts((prev) => ({
          ...prev,
          [key]: "",
        }));
        setOpenComments((prev) => ({
          ...prev,
          [key]: true,
        }));
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add comment");
      }
    });
  }

  function handleCreatePillar() {
    const name = newPillarName.trim();
    if (!name) {
      alert("Pillar name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await createContentPillarAction(
          clientId,
          name,
          newPillarColor,
          newPillarDescription
        );
        setNewPillarName("");
        setNewPillarDescription("");
        setNewPillarColor("#6366f1");
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not create pillar");
      }
    });
  }

  function handleStartEditPillar(pillar: ContentPillar) {
    setEditingPillarId(pillar.id);
    setPillarEditDraft({
      name: pillar.name,
      color: pillar.color,
      description: pillar.description,
    });
  }

  function handleSavePillar(pillarId: string) {
    const name = pillarEditDraft.name.trim();
    if (!name) {
      alert("Pillar name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await updateContentPillarAction(
          pillarId,
          name,
          pillarEditDraft.color,
          pillarEditDraft.description
        );
        setEditingPillarId(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update pillar");
      }
    });
  }

  function handleArchivePillar(pillarId: string) {
    if (!confirm("Archive this pillar? Posts tagged with it will become untagged.")) {
      return;
    }
    startTransition(async () => {
      try {
        await archiveContentPillarAction(pillarId);
        if (editingPillarId === pillarId) setEditingPillarId(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not archive pillar");
      }
    });
  }

  function handleToggleResolved(commentId: string, resolved: boolean) {
    startTransition(async () => {
      try {
        await toggleProoferCommentResolvedAction(commentId, resolved);
        router.refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not update comment status"
        );
      }
    });
  }

  // ── AI idea handlers ───────────────────────────────────────────────────────

  async function handleGenerateIdeas() {
    if (!clientId || !month) return;
    setGenLoading(true);
    setGenError(null);
    setGenResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch("/api/generate-post-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ clientId, month, platform: genPlatform, prompt: genPrompt }),
      });

      if (!res.body) {
        setGenError("No response from server.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalCount = 0;
      let emptySlots = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as { type: string; [k: string]: unknown };

            if (msg.type === "status") {
              emptySlots = Number(msg.emptySlotsFound ?? 0);
              setGenResult({ count: 0, emptySlots });

            } else if (msg.type === "idea") {
              const idea = msg.idea as PostIdea;
              setPostIdeas((prev) => {
                if (prev.some((i) => i.id === idea.id)) return prev;
                return [...prev, idea];
              });

              // Auto-fill the caption textarea for this slot if it's empty
              const slotKey = postKey(
                idea.postSlotDate.slice(0, 10),
                idea.platform as ProoferPlatform
              );
              setDrafts((prev) => {
                if (prev[slotKey]) return prev; // don't overwrite existing draft
                const composed = [
                  idea.firstLine,
                  idea.captionIdea,
                  idea.cta,
                  idea.hashtags,
                ]
                  .filter(Boolean)
                  .join("\n\n");
                return {
                  ...prev,
                  [slotKey]: {
                    caption: composed,
                    mediaUrls: [],
                    pillarId: idea.contentPillarId ?? null,
                    linkedIdeaId: null,
                    linkedIdeaKind: null,
                    publishTime: "18:00",
                  },
                };
              });

              totalCount++;
              setGenResult({ count: totalCount, emptySlots });

            } else if (msg.type === "done") {
              setGenResult({ count: totalCount, emptySlots });

            } else if (msg.type === "error") {
              setGenError(String(msg.error ?? "Generation failed."));
            }
          } catch {
            // malformed line — skip
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setGenError("Timed out — try again.");
      } else {
        setGenError("Network error — please try again.");
      }
    } finally {
      clearTimeout(timeout);
      setGenLoading(false);
    }
  }

  async function handleRejectIdea(ideaId: string) {
    startTransition(async () => {
      try {
        await rejectPostIdeaAction(ideaId);
        setPostIdeas((prev) => prev.filter((i) => i.id !== ideaId));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not dismiss idea.");
      }
    });
  }

  async function handleModifyCaption(dateKey: string, platform: ProoferPlatform, modifier: string) {
    const key = postKey(dateKey, platform);
    const currentCaption = getDraftFor(dateKey, platform).caption;
    if (!currentCaption.trim()) return;
    setCaptionModifying((prev) => ({ ...prev, [key]: modifier }));
    try {
      const res = await fetch("/api/modify-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, text: currentCaption, modifier }),
      });
      const data = await res.json();
      if (!data.ok) { alert(data.error ?? "Failed."); return; }
      updateDraft(dateKey, platform, { caption: data.value });
    } catch {
      alert("Network error.");
    } finally {
      setCaptionModifying((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  }

  async function handleSearchImages(ideaId: string, imageIdea: string) {
    setImgSearching((prev) => ({ ...prev, [ideaId]: true }));
    try {
      const res = await fetch(`/api/suggest-images?q=${encodeURIComponent(imageIdea)}&per_page=4`);
      const data = await res.json();
      if (data.ok) setImgSuggestions((prev) => ({ ...prev, [ideaId]: data.photos }));
    } catch {
      // silently fail — user can retry
    } finally {
      setImgSearching((prev) => { const n = { ...prev }; delete n[ideaId]; return n; });
    }
  }

  async function handleClearIdeas() {
    if (!clientId || !month) return;
    if (!confirm("Clear all AI ideas for this month and platform? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await clearPostIdeasAction(clientId, month, genPlatform);
        setPostIdeas((prev) => prev.filter(
          (i) => !(i.platform === genPlatform && i.postSlotDate.startsWith(month))
        ));
        // Clear unsaved caption drafts that came from AI
        setDrafts((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (key.endsWith(`|${genPlatform}`)) {
              const dateStr = key.split("|")[0];
              const existingPost = postsByKey.get(key);
              if (dateStr.startsWith(month) && !existingPost) {
                delete next[key];
              }
            }
          }
          return next;
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not clear ideas.");
      }
    });
  }

  const visibleDays = useMemo(() => {
    if (!hideEmpty) return days;
    return days.filter((d) => {
      const dateKey = toDateKey(d);
      return PROOFER_PLATFORMS.some((platform) => {
        const key = postKey(dateKey, platform);
        const draft = drafts[key];
        const post = postsByKey.get(key);
        const caption = draft?.caption ?? post?.caption ?? "";
        const mediaUrls = draft?.mediaUrls ?? post?.mediaUrls ?? [];
        return (
          caption.trim().length > 0 ||
          mediaUrls.length > 0 ||
          (post && post.status !== "none")
        );
      });
    });
  }, [days, drafts, postsByKey, hideEmpty]);

  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current) return;
    scrolledRef.current = true;
    const todayKey = toDateKey(new Date());
    const el = document.getElementById(`day-${todayKey}`);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, []);

  const totalWithContent = useMemo(
    () =>
      days.filter((d) => {
        const dateKey = toDateKey(d);
        return PROOFER_PLATFORMS.some((platform) => {
          const post = postsByKey.get(postKey(dateKey, platform));
          return post && (post.caption || post.mediaUrls.length > 0);
        });
      }).length,
    [days, postsByKey]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        paddingRight: 52,
      }}
    >
      <DayScrubber days={days} postsByKey={postsByKey} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.05,
              fontWeight: 700,
              color: "#18181b",
              letterSpacing: "-0.03em",
            }}
          >
            Proofer
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 760,
            }}
          >
            Draft captions and upload images for every day of the month, then
            flag each post as Improve, Check, Proofed or Approved as it moves
            through review.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/app/proofer/publish")}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #18181b",
            background: "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Publish Queue →
        </button>
      </div>

      <SectionCard title="Settings">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              alignItems: "flex-end",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={labelStyle}>Client</span>
              <select
                value={clientId}
                onChange={(e) => handleSelectClient(e.target.value)}
                disabled={isPending || clients.length === 0}
                style={inputStyle}
              >
                {clients.length === 0 && <option value="">No clients</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={labelStyle}>Month</span>
              <select
                value={month}
                onChange={(e) => handleSelectMonth(e.target.value)}
                disabled={isPending}
                style={inputStyle}
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "#52525b",
                paddingBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={(e) => setHideEmpty(e.target.checked)}
              />
              Hide empty days
            </label>

            <div style={{ fontSize: 12, color: "#71717a", paddingBottom: 10 }}>
              {totalWithContent} of {days.length} days have content
            </div>
          </div>

          {clients.length > 0 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <span style={labelStyle}>Content pillars</span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
            {initialPillars.map((pillar) =>
              editingPillarId === pillar.id ? (
                <div
                  key={pillar.id}
                  style={{
                    display: "inline-flex",
                    gap: 6,
                    alignItems: "center",
                    padding: "4px 6px",
                    borderRadius: 10,
                    border: "1px solid #e4e4e7",
                    background: "#fafafa",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="color"
                    value={pillarEditDraft.color}
                    onChange={(e) =>
                      setPillarEditDraft((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    style={{
                      width: 24,
                      height: 24,
                      border: "none",
                      padding: 0,
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  />
                  <input
                    type="text"
                    value={pillarEditDraft.name}
                    onChange={(e) =>
                      setPillarEditDraft((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Name"
                    style={{ ...inputStyle, width: 120, padding: "4px 8px" }}
                  />
                  <button
                    type="button"
                    onClick={() => handleSavePillar(pillar.id)}
                    disabled={isPending}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: "#18181b",
                      color: "#fff",
                      border: "none",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPillarId(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#71717a",
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                      padding: 2,
                    }}
                    aria-label="Cancel"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchivePillar(pillar.id)}
                    disabled={isPending}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#991b1b",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 6px",
                    }}
                  >
                    Archive
                  </button>
                </div>
              ) : (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => handleStartEditPillar(pillar)}
                  title={pillar.description || "Edit pillar"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #e4e4e7",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#27272a",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: pillar.color,
                      display: "inline-block",
                    }}
                  />
                  {pillar.name}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setPillarManagerOpen((v) => !v)}
              title={pillarManagerOpen ? "Cancel" : "Add pillar"}
              aria-label={pillarManagerOpen ? "Cancel" : "Add pillar"}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "1px dashed #a1a1aa",
                background: "#fff",
                color: "#71717a",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              {pillarManagerOpen ? "×" : "+"}
            </button>
          </div>

          {pillarManagerOpen && (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                padding: 8,
                borderRadius: 10,
                border: "1px solid #e4e4e7",
                background: "#fafafa",
              }}
            >
              <input
                type="color"
                value={newPillarColor}
                onChange={(e) => setNewPillarColor(e.target.value)}
                style={{
                  width: 28,
                  height: 28,
                  border: "none",
                  padding: 0,
                  background: "transparent",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={newPillarName}
                onChange={(e) => setNewPillarName(e.target.value)}
                placeholder="Pillar name"
                autoFocus
                style={{ ...inputStyle, width: 160 }}
              />
              <input
                type="text"
                value={newPillarDescription}
                onChange={(e) => setNewPillarDescription(e.target.value)}
                placeholder="Description (optional)"
                style={{ ...inputStyle, width: 220 }}
              />
              <button
                type="button"
                onClick={handleCreatePillar}
                disabled={isPending || !newPillarName.trim()}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: newPillarName.trim() ? "#18181b" : "#e4e4e7",
                  color: newPillarName.trim() ? "#fff" : "#a1a1aa",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: newPillarName.trim() ? "pointer" : "not-allowed",
                }}
              >
                Create
              </button>
            </div>
          )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Generate Month Ideas panel ──────────────────────────────────── */}
      {clients.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, #f0f9ff 0%, #e8f0fe 100%)",
            border: "1px solid #bfdbfe",
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f", flexShrink: 0 }}>
            ✦ Generate ideas
          </span>

          <select
            value={genPlatform}
            onChange={(e) => setGenPlatform(e.target.value as ProoferPlatform)}
            style={{ ...inputStyle, fontSize: 12, flexShrink: 0, width: "auto" }}
          >
            {PROOFER_PLATFORMS.map((p) => (
              <option key={p} value={p}>{PROOFER_PLATFORM_LABELS[p]}</option>
            ))}
          </select>

          <input
            type="text"
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            placeholder="Direction prompt (optional)"
            style={{ ...inputStyle, fontSize: 12, flex: 1, minWidth: 180 }}
          />

          <button
            type="button"
            onClick={handleGenerateIdeas}
            disabled={genLoading || !clientId || !month}
            style={{
              padding: "7px 16px",
              borderRadius: 9,
              border: "none",
              background: genLoading
                ? "#93c5fd"
                : "linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: genLoading ? "wait" : "pointer",
              flexShrink: 0,
            }}
          >
            {genLoading ? "Generating..." : "Generate"}
          </button>

          {genResult && (
            <span style={{ fontSize: 12, color: "#166534", fontWeight: 600, flexShrink: 0 }}>
              {genResult.count} idea{genResult.count !== 1 ? "s" : ""} generated
            </span>
          )}

          {genError && (
            <span style={{ fontSize: 12, color: "#991b1b", flexShrink: 0 }}>{genError}</span>
          )}

          {postIdeas.filter((i) => i.platform === genPlatform && i.postSlotDate.startsWith(month)).length > 0 && (
            <button
              type="button"
              onClick={handleClearIdeas}
              disabled={isPending}
              style={{
                padding: "7px 12px",
                borderRadius: 9,
                border: "1px solid #fca5a5",
                background: "#fff",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Clear AI
            </button>
          )}
        </div>
      )}

      {clients.length === 0 ? (
        <SectionCard title="No clients">
          <div style={{ fontSize: 13, color: "#71717a" }}>
            Add a client first on the Clients page.
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {visibleDays.length === 0 && (
            <SectionCard title="Nothing to show">
              <div style={{ fontSize: 13, color: "#71717a" }}>
                All days are empty. Uncheck <strong>Hide empty days</strong> to
                start drafting.
              </div>
            </SectionCard>
          )}

          {visibleDays.map((d) => {
            const dateKey = toDateKey(d);
            const activePlatform = getActivePlatform(dateKey);
            const key = postKey(dateKey, activePlatform);
            const post = postsByKey.get(key);
            const draft = getDraftFor(dateKey, activePlatform);
            const hasDraft = Boolean(drafts[key]);
            const hasContent = Boolean(
              draft.caption.trim() || draft.mediaUrls.length > 0
            );

            const comments = ((post as ProoferPost & {
              comments?: ProoferCommentLite[];
            })?.comments ?? []) as ProoferCommentLite[];

            const commentCount = comments.length;
            const unresolvedCount = comments.filter((c) => !c.resolved).length;
            const commentsOpen = Boolean(openComments[key]);

            const effectiveStatus: ProoferStatus =
              post?.status && post.status !== "none"
                ? post.status
                : "none";

            const isLocked = effectiveStatus === "proofed" || effectiveStatus === "approved";

            const variants = platformsByDate.get(dateKey) ?? new Set();
            const previewUrl = draft.mediaUrls[0] ?? "";

            const slotIdeas = postIdeasByKey.get(key) ?? [];

            return (
              <div
                key={dateKey}
                id={`day-${dateKey}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  scrollMarginTop: 80,
                }}
              >
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: slotIdeas.length > 0 ? "12px 12px 0 0" : 12,
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "200px 1fr",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#18181b",
                      lineHeight: 1.2,
                    }}
                  >
                    {formatDayLong(d)}
                  </div>

                  {post?.createdBy && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#71717a" }}>
                      Created by <strong style={{ color: "#52525b" }}>{post.createdBy.split("@")[0]}</strong>
                    </div>
                  )}
                  {post?.updatedBy && post.updatedBy !== post.createdBy && (
                    <div style={{ marginTop: 2, fontSize: 11, color: "#71717a" }}>
                      Edited by <strong style={{ color: "#52525b" }}>{post.updatedBy.split("@")[0]}</strong>
                    </div>
                  )}
                  {post?.status === "approved" && post.updatedBy && (
                    <div style={{ marginTop: 2, fontSize: 11, color: "#15803d", fontWeight: 600 }}>
                      Approved by {post.updatedBy.split("@")[0]}
                    </div>
                  )}

                  {hasDraft && !isLocked && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#b45309",
                        fontWeight: 600,
                      }}
                    >
                      Unsaved changes
                    </div>
                  )}

                  {isLocked && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#075985",
                        fontWeight: 700,
                      }}
                    >
                      Approved and locked
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span style={labelStyle}>Platform</span>
                      <select
                        value={activePlatform}
                        onChange={(e) =>
                          setActivePlatform(
                            dateKey,
                            e.target.value as ProoferPlatform
                          )
                        }
                        style={{
                          ...inputStyle,
                          padding: "6px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {PROOFER_PLATFORMS.map((p) => {
                          const hasVariant = variants.has(p);
                          return (
                            <option key={p} value={p}>
                              {PROOFER_PLATFORM_LABELS[p]}
                              {hasVariant ? " •" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {(() => {
                      const selectedPillar = draft.pillarId
                        ? pillarsById.get(draft.pillarId) ?? null
                        : null;
                      const pickerKey = postKey(dateKey, activePlatform);
                      const isOpen = openPillarPickerKey === pickerKey;
                      return (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            position: "relative",
                          }}
                        >
                          <span style={labelStyle}>Pillar</span>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() =>
                              setOpenPillarPickerKey(isOpen ? null : pickerKey)
                            }
                            style={{
                              ...inputStyle,
                              padding: "6px 8px",
                              fontSize: 12,
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              textAlign: "left",
                              cursor: isLocked ? "not-allowed" : "pointer",
                              opacity: isLocked ? 0.7 : 1,
                              background: "#fff",
                            }}
                          >
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: selectedPillar
                                  ? selectedPillar.color
                                  : "#e4e4e7",
                                display: "inline-block",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                flex: 1,
                                color: selectedPillar ? "#18181b" : "#a1a1aa",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {selectedPillar ? selectedPillar.name : "None"}
                            </span>
                            <span
                              style={{ color: "#a1a1aa", fontSize: 10 }}
                              aria-hidden
                            >
                              ▾
                            </span>
                          </button>
                          {isOpen && (
                            <>
                              <div
                                onClick={() => setOpenPillarPickerKey(null)}
                                style={{
                                  position: "fixed",
                                  inset: 0,
                                  zIndex: 20,
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  marginTop: 4,
                                  background: "#fff",
                                  border: "1px solid #e4e4e7",
                                  borderRadius: 8,
                                  boxShadow:
                                    "0 6px 16px rgba(0,0,0,0.08)",
                                  zIndex: 21,
                                  maxHeight: 220,
                                  overflowY: "auto",
                                  padding: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateDraft(dateKey, activePlatform, {
                                      pillarId: null,
                                    });
                                    setOpenPillarPickerKey(null);
                                  }}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "6px 8px",
                                    border: "none",
                                    background:
                                      draft.pillarId === null
                                        ? "#f4f4f5"
                                        : "transparent",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#71717a",
                                    textAlign: "left",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: "50%",
                                      background: "#e4e4e7",
                                      display: "inline-block",
                                      flexShrink: 0,
                                    }}
                                  />
                                  None
                                </button>
                                {initialPillars.map((pillar) => {
                                  const isSelected =
                                    draft.pillarId === pillar.id;
                                  return (
                                    <button
                                      key={pillar.id}
                                      type="button"
                                      onClick={() => {
                                        updateDraft(dateKey, activePlatform, {
                                          pillarId: pillar.id,
                                          // Clear idea selection when pillar
                                          // changes — the existing idea may
                                          // no longer match.
                                          linkedIdeaId:
                                            draft.pillarId === pillar.id
                                              ? draft.linkedIdeaId
                                              : null,
                                          linkedIdeaKind:
                                            draft.pillarId === pillar.id
                                              ? draft.linkedIdeaKind
                                              : null,
                                        });
                                        setOpenPillarPickerKey(null);
                                      }}
                                      title={pillar.description || pillar.name}
                                      style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "6px 8px",
                                        border: "none",
                                        background: isSelected
                                          ? "#f4f4f5"
                                          : "transparent",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#18181b",
                                        textAlign: "left",
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 10,
                                          height: 10,
                                          borderRadius: "50%",
                                          background: pillar.color,
                                          display: "inline-block",
                                          flexShrink: 0,
                                        }}
                                      />
                                      {pillar.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "stretch",
                    }}
                  >
                    <textarea
                      value={draft.caption}
                      onChange={(e) =>
                        updateDraft(dateKey, activePlatform, {
                          caption: e.target.value,
                        })
                      }
                      placeholder="Write a caption..."
                      disabled={isLocked}
                      rows={10}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        resize: "vertical",
                        fontFamily: "inherit",
                        opacity: isLocked ? 0.7 : 1,
                        cursor: isLocked ? "not-allowed" : "text",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "0 8px",
                      }}
                    >
                      {/* status buttons */}
                      {["proofed", "check", "improve"].map(
                        (statusValue) => {
                          const btn = STATUS_BUTTONS.find(
                            (b) => b.value === statusValue
                          )!;
                          const active = effectiveStatus === btn.value;
                          const disableThisButton =
                            isPending ||
                            (isLocked && btn.value !== "proofed");

                          return (
                            <button
                              key={btn.value}
                              type="button"
                              title={btn.label}
                              aria-label={btn.label}
                              onClick={() =>
                                handleStatus(
                                  dateKey,
                                  activePlatform,
                                  btn.value
                                )
                              }
                              disabled={disableThisButton}
                              style={{
                                width: 16,
                                height: 16,
                                padding: 0,
                                borderRadius: "50%",
                                border: "1px solid #e4e4e7",
                                background: btn.dot,
                                cursor: disableThisButton
                                  ? "not-allowed"
                                  : "pointer",
                                boxShadow: "none",
                                opacity: disableThisButton
                                  ? 0.35
                                  : active
                                  ? 1
                                  : 0.35,
                                transition: "opacity 120ms ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!disableThisButton && !active) {
                                  e.currentTarget.style.opacity = "0.75";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!disableThisButton && !active) {
                                  e.currentTarget.style.opacity = "0.35";
                                }
                              }}
                            />
                          );
                        }
                      )}
                    </div>
                  </div>

                  {draft.caption.trim() && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(["new_hook", "shorter", "more_playful", "more_premium", "stronger_cta", "regenerate"] as const).map((mod) => {
                        const labels: Record<string, string> = {
                          new_hook: "↺ Hook",
                          shorter: "Shorter",
                          more_playful: "More playful",
                          more_premium: "More premium",
                          stronger_cta: "Stronger CTA",
                          regenerate: "Regenerate",
                        };
                        const activeModifier = captionModifying[postKey(dateKey, activePlatform)];
                        const isThisOne = activeModifier === mod;
                        const anyRunning = !!activeModifier;
                        return (
                          <button
                            key={mod}
                            type="button"
                            disabled={anyRunning || isLocked}
                            onClick={() => handleModifyCaption(dateKey, activePlatform, mod)}
                            style={{
                              padding: "3px 9px",
                              borderRadius: 99,
                              border: "1px solid #e4e4e7",
                              background: isThisOne ? "#e0f2fe" : "#fff",
                              color: isThisOne ? "#0369a1" : "#52525b",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: anyRunning || isLocked ? "wait" : "pointer",
                              opacity: anyRunning && !isThisOne ? 0.45 : 1,
                            }}
                          >
                            {isThisOne ? "…" : labels[mod]}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Media section — REMOVED (images shown in preview below) */}
                  {false && draft.mediaUrls.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "stretch",
                      }}
                    >
                      {draft.mediaUrls.map((url, idx) => (
                        <div
                          key={`${url}-${idx}`}
                          style={{
                            width: "100%",
                            maxWidth: 400,
                            border: "1px solid #e4e4e7",
                            borderRadius: 8,
                            background: "#fafafa",
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            opacity: isLocked ? 0.7 : 1,
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              background: "#f4f4f5",
                              position: "relative",
                            }}
                          >
                            {isVideoUrl(url) ? (
                              <video
                                src={url}
                                controls
                                style={{
                                  display: "block",
                                  width: "100%",
                                  maxHeight: 300,
                                  objectFit: "contain",
                                }}
                              />
                            ) : (
                              <img
                                src={url}
                                alt={prettyFileName(url)}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  maxHeight: 300,
                                  objectFit: "contain",
                                }}
                              />
                            )}
                            <div
                              style={{
                                position: "absolute",
                                top: 4,
                                left: 4,
                                background: "rgba(0,0,0,0.6)",
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 5px",
                                borderRadius: 4,
                              }}
                            >
                              {idx + 1}
                            </div>
                          </div>

                          {!isLocked && (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "4px 6px",
                                gap: 2,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  moveMedia(dateKey, activePlatform, idx, -1)
                                }
                                disabled={idx === 0}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: idx === 0 ? "#d4d4d8" : "#52525b",
                                  cursor: idx === 0 ? "default" : "pointer",
                                  padding: 2,
                                  fontSize: 12,
                                }}
                                aria-label="Move left"
                              >
                                ◀
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeMediaAt(dateKey, activePlatform, idx)
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#991b1b",
                                  cursor: "pointer",
                                  padding: 2,
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                                aria-label="Remove"
                              >
                                ×
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  moveMedia(dateKey, activePlatform, idx, 1)
                                }
                                disabled={idx === draft.mediaUrls.length - 1}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color:
                                    idx === draft.mediaUrls.length - 1
                                      ? "#d4d4d8"
                                      : "#52525b",
                                  cursor:
                                    idx === draft.mediaUrls.length - 1
                                      ? "default"
                                      : "pointer",
                                  padding: 2,
                                  fontSize: 12,
                                }}
                                aria-label="Move right"
                              >
                                ▶
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}


                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {!isLocked && (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <ImageUpload
                          bucket="postimages"
                          folder={`proofer/${clientId}/${month}`}
                          onUploaded={(url) =>
                            addMediaUrl(dateKey, activePlatform, url)
                          }
                          label={
                            draft.mediaUrls.length > 0
                              ? "Add another"
                              : "Upload media"
                          }
                          accept="image/*,video/*"
                        />
                        <PasteLinkInput
                          onSubmit={(url) =>
                            addMediaUrl(dateKey, activePlatform, url)
                          }
                        />
                        {draft.mediaUrls.length > 0 && (
                          <span style={{ fontSize: 11, color: "#a1a1aa" }}>
                            {`${draft.mediaUrls.length} item${
                              draft.mediaUrls.length === 1 ? "" : "s"
                            } · drag order with ◀ ▶`}
                          </span>
                        )}
                        <div
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <input
                              type="time"
                              value={draft.publishTime}
                              onChange={(e) =>
                                updateDraft(dateKey, activePlatform, {
                                  publishTime: e.target.value,
                                })
                              }
                              disabled={isLocked}
                              style={{
                                padding: "4px 6px",
                                borderRadius: 6,
                                border: "1px solid #e4e4e7",
                                fontSize: 11,
                                color: "#18181b",
                                background: "#fff",
                                fontFamily: "inherit",
                                width: 90,
                              }}
                            />
                            <span style={{ fontSize: 9, color: "#a1a1aa" }}>
                              Publish (GMT)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleSave(dateKey, activePlatform)
                            }
                            disabled={isPending || !hasDraft || isLocked}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 8,
                              background:
                                hasDraft && !isLocked ? "#18181b" : "#e4e4e7",
                              color:
                                hasDraft && !isLocked ? "#fff" : "#a1a1aa",
                              border: "none",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor:
                                hasDraft && !isLocked
                                  ? "pointer"
                                  : "not-allowed",
                            }}
                          >
                            Save
                          </button>
                          {(post || hasDraft) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(dateKey, activePlatform)
                              }
                              disabled={isPending || isLocked}
                              style={{
                                ...secondaryButtonStyle,
                                color: "#991b1b",
                                opacity: isLocked ? 0.6 : 1,
                                cursor:
                                  isPending || isLocked
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const previewIdx = previewIdxMap[key] ?? 0;
                    const safeIdx = Math.min(previewIdx, Math.max(0, draft.mediaUrls.length - 1));
                    const activeUrl = draft.mediaUrls[safeIdx] ?? "";
                    const setPreviewIdx = (n: number) => setPreviewIdxMap((prev) => ({ ...prev, [key]: n }));
                    return (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 500,
                        background: "#fff",
                        border: "1px solid #e4e4e7",
                        borderRadius: 12,
                        overflow: "hidden",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "#e4e4e7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#71717a",
                          }}
                        >
                          {(
                            clients.find((c) => c.id === clientId)?.name ?? "?"
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#18181b",
                              lineHeight: 1.2,
                            }}
                          >
                            {clients.find((c) => c.id === clientId)?.name ??
                              "Client"}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#71717a",
                              lineHeight: 1.2,
                            }}
                          >
                            {formatDayLong(d)}
                          </span>
                        </div>

                        {draft.pillarId &&
                          pillarsById.get(draft.pillarId) && (
                            <span
                              style={{
                                marginLeft: "auto",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: `${
                                  pillarsById.get(draft.pillarId)!.color
                                }15`,
                                border: `1px solid ${
                                  pillarsById.get(draft.pillarId)!.color
                                }`,
                                color: pillarsById.get(draft.pillarId)!.color,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: pillarsById.get(draft.pillarId)!
                                    .color,
                                  display: "inline-block",
                                }}
                              />
                              {pillarsById.get(draft.pillarId)!.name}
                            </span>
                          )}
                      </div>

                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1",
                          background: "#f4f4f5",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        {activeUrl ? (
                          isVideoUrl(activeUrl) ? (
                            <video src={activeUrl} controls style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <img src={activeUrl} alt="Preview" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          )
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#a1a1aa", fontSize: 13 }}>
                            No image yet
                          </div>
                        )}

                        {/* Carousel nav */}
                        {draft.mediaUrls.length > 1 && (
                          <>
                            <button type="button" onClick={() => setPreviewIdx(Math.max(0, safeIdx - 1))} disabled={safeIdx === 0}
                              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: safeIdx === 0 ? 0.3 : 1 }}>‹</button>
                            <button type="button" onClick={() => setPreviewIdx(Math.min(draft.mediaUrls.length - 1, safeIdx + 1))} disabled={safeIdx === draft.mediaUrls.length - 1}
                              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: safeIdx === draft.mediaUrls.length - 1 ? 0.3 : 1 }}>›</button>
                            <div style={{ position: "absolute", top: 8, right: 10, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: 99 }}>{safeIdx + 1}/{draft.mediaUrls.length}</div>
                          </>
                        )}

                        {/* Per-image controls */}
                        {activeUrl && !isLocked && (
                          <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 4 }}>
                            <button type="button" onClick={() => moveMedia(dateKey, activePlatform, safeIdx, -1)} disabled={safeIdx === 0}
                              style={{ padding: "3px 7px", borderRadius: 6, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, cursor: "pointer", opacity: safeIdx === 0 ? 0.4 : 1 }}>◀</button>
                            <button type="button" onClick={() => moveMedia(dateKey, activePlatform, safeIdx, 1)} disabled={safeIdx === draft.mediaUrls.length - 1}
                              style={{ padding: "3px 7px", borderRadius: 6, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, cursor: "pointer", opacity: safeIdx === draft.mediaUrls.length - 1 ? 0.4 : 1 }}>▶</button>
                            <button type="button" onClick={() => removeMediaAt(dateKey, activePlatform, safeIdx)}
                              style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: "rgba(180,0,0,0.75)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Remove</button>
                          </div>
                        )}
                      </div>

                      {draft.caption.trim() && (
                        <div style={{ padding: "10px 12px 12px", fontSize: 13, color: "#18181b", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                          {draft.caption}
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  <div
                    style={{
                      borderTop: "1px solid #f4f4f5",
                      paddingTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleComments(key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        border: "1px solid #e4e4e7",
                        borderRadius: 10,
                        background: "#fafafa",
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "#27272a",
                        fontWeight: 600,
                      }}
                    >
                      <span>
                        Comments {commentCount > 0 ? `(${commentCount})` : ""}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          color: "#71717a",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {unresolvedCount > 0 && (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: "#fff7ed",
                              border: "1px solid #fdba74",
                              color: "#9a3412",
                            }}
                          >
                            {unresolvedCount} open
                          </span>
                        )}
                        <span>{commentsOpen ? "Hide" : "Show"}</span>
                      </span>
                    </button>

                    {commentsOpen && (
                      <div
                        style={{
                          border: "1px solid #e4e4e7",
                          borderRadius: 12,
                          padding: 12,
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {comments.length > 0 && comments.some((c) => c.resolved) && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#71717a", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={hideResolved}
                                onChange={(e) => setHideResolved(e.target.checked)}
                                style={{ width: 14, height: 14 }}
                              />
                              Hide resolved
                            </label>
                          </div>
                        )}

                        {comments.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#71717a" }}>
                            No comments yet.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {comments.filter((c) => !hideResolved || !c.resolved).map((comment) => (
                              <div
                                key={comment.id}
                                style={{
                                  border: "1px solid #e4e4e7",
                                  borderRadius: 10,
                                  padding: 10,
                                  background: comment.resolved
                                    ? "#fafafa"
                                    : "#fff",
                                  opacity: comment.resolved ? 0.75 : 1,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 10,
                                    marginBottom: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                      fontSize: 12,
                                    }}
                                  >
                                    <strong style={{ color: "#27272a" }}>
                                      {comment.createdBy || "Unknown"}
                                    </strong>
                                    <span style={{ color: "#71717a" }}>
                                      {formatCommentTime(comment.createdAt)}
                                    </span>
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        color: "#1d4ed8",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Client-visible
                                    </span>
                                    {comment.resolved && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          borderRadius: 999,
                                          background: "#ecfdf5",
                                          border: "1px solid #86efac",
                                          color: "#166534",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Resolved
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleResolved(
                                        comment.id,
                                        !comment.resolved
                                      )
                                    }
                                    disabled={isPending}
                                    style={{
                                      ...secondaryButtonStyle,
                                      padding: "6px 10px",
                                    }}
                                  >
                                    {comment.resolved ? "Reopen" : "Resolve"}
                                  </button>
                                </div>

                                <div
                                  style={{
                                    fontSize: 13,
                                    color: "#18181b",
                                    lineHeight: 1.45,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {renderCommentText(comment.comment)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            paddingTop: 4,
                          }}
                        >
                          <textarea
                            value={commentDrafts[key] ?? ""}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            placeholder={
                              post
                                ? "Add a comment for the client..."
                                : "Save the post first before adding comments..."
                            }
                            disabled={!post}
                            style={{
                              ...inputStyle,
                              minHeight: 80,
                              resize: "vertical",
                              fontFamily: "inherit",
                              opacity: post ? 1 : 0.7,
                            }}
                          />

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ fontSize: 12, color: "#71717a" }}>
                              Comments here are shown as client-visible feedback.
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAddComment(key, post?.id)}
                              disabled={isPending || !post}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                background: post ? "#18181b" : "#e4e4e7",
                                color: post ? "#fff" : "#a1a1aa",
                                border: "none",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: post ? "pointer" : "default",
                              }}
                            >
                              Add comment
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AI image concept hints */}
              {slotIdeas.filter((i) => i.imageIdea).map((idea, idx) => {
                const photos = imgSuggestions[idea.id] ?? [];
                const searching = imgSearching[idea.id] ?? false;
                const hintCount = slotIdeas.filter((i) => i.imageIdea).length;
                return (
                <div
                  key={idea.id}
                  style={{
                    borderLeft: "1px solid #e0f2fe",
                    borderRight: "1px solid #e0f2fe",
                    borderBottom: idx === hintCount - 1 ? "1px solid #e0f2fe" : undefined,
                    borderTop: idx === 0 ? "1px solid #e0f2fe" : "1px solid #e4e4e7",
                    borderRadius: idx === hintCount - 1 ? "0 0 12px 12px" : undefined,
                    background: "#f0f9ff",
                  }}
                >
                  {/* Concept row */}
                  <div style={{ padding: "8px 14px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", flexShrink: 0, paddingTop: 1 }}>📷</span>
                    <span style={{ fontSize: 12, color: "#374151", flex: 1, lineHeight: 1.5 }}>{idea.imageIdea}</span>
                    <button
                      type="button"
                      onClick={() => handleSearchImages(idea.id, idea.imageIdea ?? "")}
                      disabled={searching}
                      style={{
                        flexShrink: 0,
                        padding: "2px 8px",
                        border: "1px solid #bae6fd",
                        borderRadius: 6,
                        background: "#e0f2fe",
                        color: "#0369a1",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: searching ? "wait" : "pointer",
                      }}
                    >
                      {searching ? "Searching…" : photos.length > 0 ? "Refresh" : "Find photos"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectIdea(idea.id)}
                      style={{
                        flexShrink: 0,
                        padding: "0 5px",
                        border: "none",
                        background: "transparent",
                        color: "#94a3b8",
                        fontSize: 14,
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>

                  {/* Pexels photo suggestions */}
                  {photos.length > 0 && (
                    <div style={{ padding: "6px 14px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {photos.map((photo) => (
                        <div key={photo.id} style={{ position: "relative", flexShrink: 0 }}>
                          <img
                            src={photo.thumb}
                            alt={photo.photographer}
                            style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, display: "block", border: "2px solid #e0f2fe" }}
                          />
                          <button
                            type="button"
                            onClick={() => addMediaUrl(dateKey, activePlatform, photo.full)}
                            style={{
                              position: "absolute",
                              bottom: 4,
                              right: 4,
                              padding: "2px 6px",
                              borderRadius: 4,
                              border: "none",
                              background: "rgba(0,0,0,0.65)",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Use
                          </button>
                        </div>
                      ))}
                      <div style={{ width: "100%", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                        Photos from{" "}
                        <a href="https://www.pexels.com" target="_blank" rel="noreferrer" style={{ color: "#94a3b8" }}>
                          Pexels
                        </a>{" "}
                        · free to use commercially
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          );
        })}
        </div>
      )}

    </div>
  );
}

function PasteLinkInput({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  function submit() {
    const cleaned = value.trim();
    if (!cleaned) return;
    onSubmit(cleaned);
    setValue("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px dashed #e4e4e7",
          background: "#fff",
          color: "#3f3f46",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        + Paste link
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste image / video URL..."
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          fontSize: 13,
          background: "#fff",
          color: "#18181b",
          minWidth: 240,
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim()}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "#18181b",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: value.trim() ? "pointer" : "not-allowed",
          opacity: value.trim() ? 1 : 0.5,
        }}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => {
          setValue("");
          setOpen(false);
        }}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#3f3f46",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  // Walk up looking for an ancestor that actually scrolls. If none
  // does, the window is the scroll container.
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1;
    if (canScroll) return node;
    node = node.parentElement;
  }
  return null;
}

function smoothScrollToTop() {
  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const duration = 650;
  const start = performance.now();

  // Find whichever ancestor is actually scrolled.
  let container: HTMLElement | null = null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
    if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight + 1) {
      container = el;
      break;
    }
  }

  if (container) {
    const startTop = container.scrollTop;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      container!.scrollTop = startTop * (1 - easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return;
  }

  const startTop =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop;
  if (startTop < 1) return;
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    window.scrollTo(0, startTop * (1 - easeInOutCubic(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function smoothScrollDayInto(dateKey: string) {
  const el = document.getElementById(`day-${dateKey}`);
  if (!el) return;

  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const duration = 650;
  const topOffset = 72;
  const start = performance.now();
  const container = findScrollContainer(el);

  if (container) {
    const startTop = container.scrollTop;
    const rect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const target = startTop + (rect.top - cRect.top) - topOffset;
    const distance = target - startTop;
    if (Math.abs(distance) < 1) return;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      container.scrollTop = startTop + distance * easeInOutCubic(t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return;
  }

  const startTop =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop;
  const target = el.getBoundingClientRect().top + startTop - topOffset;
  const distance = target - startTop;
  if (Math.abs(distance) < 1) return;
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    const y = startTop + distance * easeInOutCubic(t);
    window.scrollTo(0, y);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function DayScrubber({
  days,
  postsByKey,
}: {
  days: Date[];
  postsByKey: Map<string, ProoferPost>;
}) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return (
    <aside
      aria-label="Jump to day"
      style={{
        position: "fixed",
        right: 16,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: 0,
        background: "#fff",
        border: "1px solid #d4d4d8",
        boxShadow: "-2px 0 12px rgba(0,0,0,0.05)",
        zIndex: 30,
        overflow: "hidden",
      }}
    >
      {days.map((d, i) => {
        const dateKey = toDateKey(d);
        let color: "red" | "green" | "grey" = "grey";
        for (const p of PROOFER_PLATFORMS) {
          const post = postsByKey.get(postKey(dateKey, p));
          if (!post) continue;
          if (post.status === "improve") {
            color = "red";
            break;
          }
          if (post.status === "proofed" || post.status === "approved") {
            color = "green";
          }
        }

        const isElapsed = d.getTime() < todayStart.getTime();
        const bg =
          color === "red"
            ? "#fca5a5"
            : color === "green"
            ? "#22c55e"
            : isElapsed
            ? "#d4d4d8"
            : "#e4e4e7";
        const fg =
          color === "red"
            ? "#7f1d1d"
            : color === "grey" && !isElapsed
            ? "#a1a1aa"
            : color === "grey" && isElapsed
            ? "#a1a1aa"
            : "#fff";

        return (
          <a
            key={dateKey}
            href={`#day-${dateKey}`}
            title={formatDayLong(d)}
            onClick={(e) => {
              e.preventDefault();
              if (i === 0) {
                smoothScrollToTop();
              } else {
                smoothScrollDayInto(dateKey);
              }
              if (typeof window !== "undefined" && window.history.replaceState) {
                window.history.replaceState(null, "", `#day-${dateKey}`);
              }
            }}
            style={{
              width: 36,
              flex: "1 1 0",
              minHeight: 24,
              background: bg,
              color: fg,
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              borderTop: i === 0 ? "none" : "1px solid #d4d4d8",
              transition: "filter 120ms ease",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.filter = "brightness(0.92)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.filter = "none";
            }}
          >
            {d.getDate()}
          </a>
        );
      })}
    </aside>
  );
}

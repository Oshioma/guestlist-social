"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "../components/SectionCard";
import ImageUpload from "../components/ImageUpload";
import type {
  ProoferPost,
  ProoferStatus,
  ProoferPlatform,
  ContentPillar,
  IdeaKind,
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
  createIdeaFromProoferAction,
  updateIdeaFromProoferAction,
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
    label: "Proofed",
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
    dot: "#ffffff",
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
}: {
  clients: ClientLite[];
  months: MonthOpt[];
  initialClientId: string;
  initialMonth: string;
  initialPosts: ProoferPost[];
  initialPillars: ContentPillar[];
  initialIdeas: ProoferIdeaLite[];
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
  type IdeaDraft = { idea: string; notes: string };
  const [ideaDrafts, setIdeaDrafts] = useState<Record<string, IdeaDraft>>({});
  const [expandedNoteKeys, setExpandedNoteKeys] = useState<Record<string, boolean>>({});
  const [pillarModal, setPillarModal] = useState<
    | {
        postKey: string;
        dateKey: string;
        platform: ProoferPlatform;
        kind: IdeaKind;
      }
    | null
  >(null);
  type LinkedIdeaEditDraft = {
    idea: string;
    notes: string;
    pillarId: string | null;
  };
  const [editingLinkedIdea, setEditingLinkedIdea] = useState<{
    id: string;
    kind: IdeaKind;
    draft: LinkedIdeaEditDraft;
  } | null>(null);

  const pillarsById = useMemo(() => {
    const map = new Map<string, ContentPillar>();
    initialPillars.forEach((p) => map.set(p.id, p));
    return map;
  }, [initialPillars]);

  const ideasById = useMemo(() => {
    const map = new Map<string, ProoferIdeaLite>();
    initialIdeas.forEach((i) => map.set(`${i.kind}:${i.id}`, i));
    return map;
  }, [initialIdeas]);

  const postsByKey = useMemo(() => {
    const map = new Map<string, ProoferPost>();
    initialPosts.forEach((p) =>
      map.set(postKey(p.postDate.slice(0, 10), p.platform), p)
    );
    return map;
  }, [initialPosts]);

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
          draft.linkedIdeaKind
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

  function getIdeaDraft(key: string): IdeaDraft {
    return ideaDrafts[key] ?? { idea: "", notes: "" };
  }

  function updateIdeaDraft(key: string, patch: Partial<IdeaDraft>) {
    setIdeaDrafts((prev) => ({
      ...prev,
      [key]: { ...getIdeaDraft(key), ...patch },
    }));
  }

  function deriveIdeaKind(platform: ProoferPlatform): IdeaKind {
    if (platform === "instagram_story") return "story";
    if (platform === "instagram_reel") return "video";
    return "video";
  }

  function handleCreateIdea(pillarId: string | null) {
    if (!pillarModal) return;
    const key = pillarModal.postKey;
    const draft = getIdeaDraft(key);
    if (!draft.idea.trim()) {
      alert("Write an idea first.");
      return;
    }

    const { dateKey, platform, kind } = pillarModal;
    // Close the modal synchronously so the click feels instant instead of
    // waiting on the startTransition lane to finish the network round-trip.
    setPillarModal(null);
    startTransition(async () => {
      try {
        const { id, kind: createdKind } = await createIdeaFromProoferAction(
          clientId,
          kind,
          pillarId,
          draft.idea,
          draft.notes
        );
        // Attach the new idea to the post draft and save.
        const current = getDraftFor(dateKey, platform);
        const nextDraft: Draft = {
          ...current,
          pillarId: pillarId ?? current.pillarId,
          linkedIdeaId: id,
          linkedIdeaKind: createdKind,
        };
        updateDraft(dateKey, platform, nextDraft);
        await saveProoferPostAction(
          clientId,
          dateKey,
          platform,
          nextDraft.caption,
          nextDraft.mediaUrls,
          nextDraft.pillarId,
          nextDraft.linkedIdeaId,
          nextDraft.linkedIdeaKind
        );
        setIdeaDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not create idea");
      }
    });
  }

  function handleSaveLinkedIdeaEdit() {
    if (!editingLinkedIdea) return;
    const { id, kind, draft } = editingLinkedIdea;
    if (!draft.idea.trim()) {
      alert("Idea text is required.");
      return;
    }
    // Close the edit UI synchronously so the save click feels instant —
    // the network round-trip then runs in the background transition.
    setEditingLinkedIdea(null);
    startTransition(async () => {
      try {
        await updateIdeaFromProoferAction(
          id,
          kind,
          draft.idea,
          draft.notes,
          draft.pillarId
        );
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update idea");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

      {clients.length === 0 ? (
        <SectionCard title="No clients">
          <div style={{ fontSize: 13, color: "#71717a" }}>
            Add a client first on the Clients page.
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                : hasContent
                ? "check"
                : "none";

            const isLocked = effectiveStatus === "approved";

            const variants = platformsByDate.get(dateKey) ?? new Set();
            const previewUrl = draft.mediaUrls[0] ?? "";

            return (
              <div
                key={dateKey}
                style={{
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
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
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#71717a",
                      }}
                    >
                      First saved by{" "}
                      <strong style={{ color: "#52525b" }}>
                        {post.createdBy}
                      </strong>
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

                    {(() => {
                      const selectedPillar = draft.pillarId
                        ? pillarsById.get(draft.pillarId) ?? null
                        : null;
                      if (!selectedPillar) return null;

                      const pickerKey = postKey(dateKey, activePlatform);
                      const isOpen = openIdeaPickerKey === pickerKey;
                      const pillarIdeas = initialIdeas.filter(
                        (idea) => idea.pillarId === selectedPillar.id
                      );
                      // Always allow the currently-selected idea to stay
                      // visible, even if it's marked used elsewhere.
                      const currentKey = draft.linkedIdeaId && draft.linkedIdeaKind
                        ? `${draft.linkedIdeaKind}:${draft.linkedIdeaId}`
                        : null;
                      const selectableIdeas = pillarIdeas.filter(
                        (idea) =>
                          !idea.usedInPostId ||
                          `${idea.kind}:${idea.id}` === currentKey
                      );
                      const selectedIdea = currentKey
                        ? ideasById.get(currentKey) ?? null
                        : null;

                      return (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            position: "relative",
                          }}
                        >
                          <span style={labelStyle}>Idea</span>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() =>
                              setOpenIdeaPickerKey(isOpen ? null : pickerKey)
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
                                flex: 1,
                                color: selectedIdea ? "#18181b" : "#a1a1aa",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {selectedIdea
                                ? selectedIdea.text
                                : `Pick an idea (${selectableIdeas.length})`}
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
                                onClick={() => setOpenIdeaPickerKey(null)}
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
                                  maxHeight: 260,
                                  overflowY: "auto",
                                  padding: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateDraft(dateKey, activePlatform, {
                                      linkedIdeaId: null,
                                      linkedIdeaKind: null,
                                    });
                                    setOpenIdeaPickerKey(null);
                                  }}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 8px",
                                    border: "none",
                                    background:
                                      draft.linkedIdeaId === null
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
                                  None
                                </button>
                                {selectableIdeas.length === 0 ? (
                                  <div
                                    style={{
                                      padding: "8px",
                                      fontSize: 11,
                                      color: "#a1a1aa",
                                    }}
                                  >
                                    No available ideas in this pillar.
                                  </div>
                                ) : (
                                  selectableIdeas.map((idea) => {
                                    const key = `${idea.kind}:${idea.id}`;
                                    const isSelected = key === currentKey;
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => {
                                          updateDraft(dateKey, activePlatform, {
                                            linkedIdeaId: idea.id,
                                            linkedIdeaKind: idea.kind,
                                          });
                                          setOpenIdeaPickerKey(null);
                                        }}
                                        title={idea.text}
                                        style={{
                                          width: "100%",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          padding: "6px 8px",
                                          border: "none",
                                          background: isSelected
                                            ? "#f4f4f5"
                                            : "transparent",
                                          borderRadius: 6,
                                          cursor: "pointer",
                                          fontSize: 12,
                                          fontWeight: 500,
                                          color: "#18181b",
                                          textAlign: "left",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 9,
                                            fontWeight: 700,
                                            padding: "1px 6px",
                                            borderRadius: 999,
                                            background: "#f4f4f5",
                                            color: "#71717a",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.04em",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {idea.kind}
                                        </span>
                                        <span
                                          style={{
                                            flex: 1,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {idea.text}
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
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
                      style={{
                        ...inputStyle,
                        flex: 1,
                        minHeight: 70,
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
                      {["proofed", "check", "improve", "approved"].map(
                        (statusValue) => {
                          const btn = STATUS_BUTTONS.find(
                            (b) => b.value === statusValue
                          )!;
                          const active = effectiveStatus === btn.value;
                          const disableThisButton =
                            isPending ||
                            (isLocked && btn.value !== "approved");

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

                  {(() => {
                    const key = postKey(dateKey, activePlatform);
                    const linkedKey =
                      draft.linkedIdeaId && draft.linkedIdeaKind
                        ? `${draft.linkedIdeaKind}:${draft.linkedIdeaId}`
                        : null;
                    const linkedIdea = linkedKey
                      ? ideasById.get(linkedKey) ?? null
                      : null;

                    if (linkedIdea) {
                      const isEditingThis =
                        editingLinkedIdea?.id === linkedIdea.id &&
                        editingLinkedIdea?.kind === linkedIdea.kind;
                      const notesKey = `${linkedIdea.kind}:${linkedIdea.id}`;
                      // Default expanded — user explicitly collapsing sets
                      // the key to false.
                      const isExpanded =
                        isEditingThis || expandedNoteKeys[notesKey] !== false;
                      const hasNotes = Boolean(linkedIdea.notes.trim());

                      return (
                        <div
                          style={{
                            background: "#fafafa",
                            border: "1px solid #e4e4e7",
                            borderRadius: 8,
                            display: "flex",
                            flexDirection: "column",
                            minWidth: 0,
                            maxWidth: "100%",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              minWidth: 0,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingThis) return;
                                setExpandedNoteKeys((prev) => ({
                                  ...prev,
                                  [notesKey]: !isExpanded,
                                }));
                              }}
                              aria-expanded={isExpanded}
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: 0,
                                background: "transparent",
                                border: "none",
                                cursor: isEditingThis ? "default" : "pointer",
                                font: "inherit",
                                textAlign: "left",
                                minWidth: 0,
                                overflow: "hidden",
                              }}
                            >
                              <span
                                aria-hidden
                                style={{
                                  display: "inline-block",
                                  width: 10,
                                  fontSize: 10,
                                  color: "#a1a1aa",
                                  transform: isExpanded
                                    ? "rotate(90deg)"
                                    : "rotate(0deg)",
                                  transition: "transform 0.15s ease",
                                  flexShrink: 0,
                                }}
                              >
                                ▶
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#71717a",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  flexShrink: 0,
                                }}
                              >
                                {isEditingThis ? "Edit idea" : "Idea notes"}
                              </span>
                              {!isEditingThis && !isExpanded && hasNotes && (
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: 12,
                                    color: "#71717a",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    minWidth: 0,
                                    display: "block",
                                  }}
                                >
                                  {linkedIdea.notes.replace(/\s+/g, " ")}
                                </span>
                              )}
                            </button>
                            {isEditingThis && editingLinkedIdea ? (
                              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={handleSaveLinkedIdeaEdit}
                                  disabled={
                                    isPending ||
                                    !editingLinkedIdea.draft.idea.trim()
                                  }
                                  style={{
                                    padding: "4px 10px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: "1px solid #166534",
                                    borderRadius: 6,
                                    background: "#dcfce7",
                                    color: "#166534",
                                    cursor:
                                      isPending ||
                                      !editingLinkedIdea.draft.idea.trim()
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity:
                                      isPending ||
                                      !editingLinkedIdea.draft.idea.trim()
                                        ? 0.5
                                        : 1,
                                  }}
                                >
                                  {isPending ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingLinkedIdea(null)}
                                  style={{
                                    padding: "4px 10px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: "1px solid #e4e4e7",
                                    borderRadius: 6,
                                    background: "#fff",
                                    color: "#3f3f46",
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() =>
                                  setEditingLinkedIdea({
                                    id: linkedIdea.id,
                                    kind: linkedIdea.kind,
                                    draft: {
                                      idea: linkedIdea.text,
                                      notes: linkedIdea.notes,
                                      pillarId: linkedIdea.pillarId,
                                    },
                                  })
                                }
                                style={{
                                  padding: "4px 10px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  border: "1px solid #e4e4e7",
                                  borderRadius: 6,
                                  background: "#fff",
                                  color: "#3f3f46",
                                  cursor: isLocked ? "not-allowed" : "pointer",
                                  opacity: isLocked ? 0.5 : 1,
                                  flexShrink: 0,
                                }}
                              >
                                Edit idea
                              </button>
                            )}
                          </div>

                          {isExpanded && (
                            <div
                              style={{
                                padding: "0 10px 10px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {isEditingThis && editingLinkedIdea ? (
                                <>
                                  <input
                                    value={editingLinkedIdea.draft.idea}
                                    onChange={(e) =>
                                      setEditingLinkedIdea({
                                        ...editingLinkedIdea,
                                        draft: {
                                          ...editingLinkedIdea.draft,
                                          idea: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="Idea..."
                                    style={{
                                      ...inputStyle,
                                      padding: "6px 8px",
                                      fontSize: 12,
                                    }}
                                  />
                                  <textarea
                                    value={editingLinkedIdea.draft.notes}
                                    onChange={(e) =>
                                      setEditingLinkedIdea({
                                        ...editingLinkedIdea,
                                        draft: {
                                          ...editingLinkedIdea.draft,
                                          notes: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="Notes (optional)"
                                    rows={4}
                                    style={{
                                      ...inputStyle,
                                      padding: "6px 8px",
                                      fontSize: 12,
                                      resize: "vertical",
                                      fontFamily: "inherit",
                                      lineHeight: 1.4,
                                    }}
                                  />
                                  <select
                                    value={editingLinkedIdea.draft.pillarId ?? ""}
                                    onChange={(e) =>
                                      setEditingLinkedIdea({
                                        ...editingLinkedIdea,
                                        draft: {
                                          ...editingLinkedIdea.draft,
                                          pillarId: e.target.value || null,
                                        },
                                      })
                                    }
                                    style={{
                                      ...inputStyle,
                                      padding: "6px 8px",
                                      fontSize: 12,
                                    }}
                                  >
                                    <option value="">No pillar</option>
                                    {initialPillars.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : hasNotes ? (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#52525b",
                                    whiteSpace: "pre-wrap",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {linkedIdea.notes}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#a1a1aa",
                                    fontStyle: "italic",
                                  }}
                                >
                                  No notes yet. Click &quot;Edit idea&quot; to
                                  add some.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // No idea selected → inline add-idea form.
                    const ideaDraft = getIdeaDraft(key);
                    return (
                      <div
                        style={{
                          padding: "8px 10px",
                          background: "#fafafa",
                          border: "1px dashed #e4e4e7",
                          borderRadius: 8,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#71717a",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Add idea
                        </div>
                        <input
                          value={ideaDraft.idea}
                          onChange={(e) =>
                            updateIdeaDraft(key, { idea: e.target.value })
                          }
                          placeholder="Idea..."
                          disabled={isLocked}
                          style={{
                            ...inputStyle,
                            padding: "6px 8px",
                            fontSize: 12,
                          }}
                        />
                        <textarea
                          value={ideaDraft.notes}
                          onChange={(e) =>
                            updateIdeaDraft(key, { notes: e.target.value })
                          }
                          placeholder="Notes (optional)"
                          rows={4}
                          disabled={isLocked}
                          style={{
                            ...inputStyle,
                            padding: "6px 8px",
                            fontSize: 12,
                            resize: "vertical",
                            fontFamily: "inherit",
                            lineHeight: 1.4,
                          }}
                        />
                        <button
                          type="button"
                          disabled={
                            isLocked ||
                            isPending ||
                            !ideaDraft.idea.trim()
                          }
                          onClick={() =>
                            setPillarModal({
                              postKey: key,
                              dateKey,
                              platform: activePlatform,
                              kind: deriveIdeaKind(activePlatform),
                            })
                          }
                          style={{
                            alignSelf: "flex-start",
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            border: "none",
                            borderRadius: 6,
                            background: "#18181b",
                            color: "#fff",
                            cursor:
                              isLocked ||
                              isPending ||
                              !ideaDraft.idea.trim()
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              isLocked ||
                              isPending ||
                              !ideaDraft.idea.trim()
                                ? 0.5
                                : 1,
                          }}
                        >
                          Save to pillar…
                        </button>
                      </div>
                    );
                  })()}

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {draft.mediaUrls.length > 0 && (
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
                              width: 88,
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
                                aspectRatio: "1 / 1",
                                background: "#f4f4f5",
                                position: "relative",
                              }}
                            >
                              {isVideoUrl(url) ? (
                                <video
                                  src={url}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                <img
                                  src={url}
                                  alt={prettyFileName(url)}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
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
                                    moveMedia(
                                      dateKey,
                                      activePlatform,
                                      idx,
                                      -1
                                    )
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
                                    removeMediaAt(
                                      dateKey,
                                      activePlatform,
                                      idx
                                    )
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
                                    moveMedia(
                                      dateKey,
                                      activePlatform,
                                      idx,
                                      1
                                    )
                                  }
                                  disabled={
                                    idx === draft.mediaUrls.length - 1
                                  }
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
                          }}
                        >
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

                  {previewUrl && (
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
                          background: "#fafafa",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        {isVideoUrl(previewUrl) ? (
                          <video
                            src={previewUrl}
                            controls
                            style={{
                              display: "block",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <img
                            src={previewUrl}
                            alt="Preview"
                            style={{
                              display: "block",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = "none";
                            }}
                          />
                        )}
                        {draft.mediaUrls.length > 1 && (
                          <div
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              background: "rgba(0,0,0,0.65)",
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "4px 8px",
                              borderRadius: 999,
                            }}
                          >
                            1/{draft.mediaUrls.length}
                          </div>
                        )}
                      </div>

                      {draft.caption.trim() && (
                        <div
                          style={{
                            padding: "10px 12px 12px",
                            fontSize: 13,
                            color: "#18181b",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.4,
                          }}
                        >
                          {draft.caption}
                        </div>
                      )}
                    </div>
                  )}

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
            );
          })}
        </div>
      )}

      {pillarModal && (
        <div
          onClick={() => setPillarModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#18181b",
              }}
            >
              Save idea to pillar
            </div>
            <div style={{ fontSize: 12, color: "#71717a" }}>
              Pick a pillar to save this new {pillarModal.kind} idea into. It
              will be attached to this post.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {initialPillars.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#a1a1aa",
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  No pillars yet for this client. Create one first.
                </div>
              )}
              {initialPillars.map((pillar) => (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => handleCreateIdea(pillar.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#18181b",
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: pillar.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{pillar.name}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPillarModal(null)}
                style={{
                  padding: "8px 14px",
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
              <button
                type="button"
                onClick={() => handleCreateIdea(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  background: "#f4f4f5",
                  color: "#3f3f46",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save without pillar
              </button>
            </div>
          </div>
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

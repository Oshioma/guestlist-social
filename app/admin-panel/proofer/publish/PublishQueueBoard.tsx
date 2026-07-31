"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SectionCard from "../../components/SectionCard";
import CarouselPreview from "../../components/CarouselPreview";
import BoostPostButton from "../../components/BoostPostButton";
import type {
  ProoferPublishQueueItem,
  ProoferStatus,
  PublishQueuePlatform,
  PublishQueueStatus,
} from "../../lib/types";
import { PUBLISH_TARGET_LABELS } from "../../lib/types";
import {
  scheduleProoferQueueItemAction,
  markProoferQueueItemPublishedAction,
  markProoferQueueItemFailedAction,
  removeProoferQueueItemAction,
  deleteProoferPostByIdAction,
} from "../../lib/proofer-actions";
import { publishMetaQueueItem } from "../../lib/meta-publish";
import {
  describeZone,
  formatDateTimeInZone,
  formatInstantClockInZone,
} from "../../../../lib/timezone";

type ClientLite = { id: string; name: string };

type ConnectedAccount = {
  clientId: string;
  platform: "facebook" | "instagram";
  accountId: string;
  accountName: string;
};

type QueueItem = ProoferPublishQueueItem & {
  clientId: string;
  clientName: string;
  postDate: string;
  caption: string;
  imageUrl: string;
  mediaUrls: string[];
  postStatus: ProoferStatus;
};

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Render in the agency's configured region with an explicit zone label
// (e.g. "31 Jul 2026, 9:00 PM EAT") so the going-out time is never
// ambiguous. Storage stays UTC; only the display shifts.
function formatDateTime(value: string | null, timeZone: string) {
  return formatDateTimeInZone(value, timeZone);
}

function toDateTimeLocalInputValue(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalInputValue(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function platformLabel(platform: PublishQueuePlatform) {
  return platform === "facebook" ? "Facebook" : "Instagram";
}

/**
 * A post's queue entries collapsed into one row. The queue stores a row per
 * (post, platform), but a post going to Instagram and Facebook is one piece of
 * work — showing it twice just reads as a duplicate. `platforms` carries every
 * destination in the group and `ids` every underlying queue row, so actions
 * still reach each one.
 */
type QueueGroup = QueueItem & {
  platforms: PublishQueuePlatform[];
  ids: string[];
};

function groupByPost(items: QueueItem[]): QueueGroup[] {
  const byPost = new Map<string, QueueGroup>();
  for (const item of items) {
    const existing = byPost.get(item.postId);
    if (existing) {
      if (!existing.platforms.includes(item.platform)) {
        existing.platforms.push(item.platform);
      }
      existing.ids.push(item.id);
    } else {
      byPost.set(item.postId, {
        ...item,
        platforms: [item.platform],
        ids: [item.id],
      });
    }
  }
  // Instagram first so the chips read consistently.
  for (const g of byPost.values()) {
    g.platforms.sort((a, b) => (a === "instagram" ? -1 : b === "instagram" ? 1 : 0));
  }
  return [...byPost.values()];
}

function PlatformChips({ platforms }: { platforms: PublishQueuePlatform[] }) {
  return (
    <>
      {platforms.map((pl) => (
        <span
          key={pl}
          style={{
            display: "inline-block",
            padding: "1px 8px",
            marginLeft: 6,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: pl === "facebook" ? "#e0f2fe" : "#fdf2f8",
            border: `1px solid ${pl === "facebook" ? "#bae6fd" : "#fbcfe8"}`,
            color: pl === "facebook" ? "#075985" : "#9d174d",
          }}
        >
          {platformLabel(pl)}
        </span>
      ))}
    </>
  );
}

// ── Design tokens ────────────────────────────────────────────────────────────
// Soft, zinc-neutral palette matched to the rest of the admin, with a dark
// grey (not pure black) primary and pastel status tints.
const INK = "#3a3a42";
const INK_2 = "#52525b";
const INK_3 = "#8b8b93";
const LINE = "#ececef";
const LINE_2 = "#e0e0e4";
const SUNK = "#f5f5f6";
const CARD_SHADOW = "0 1px 2px rgba(24,24,27,.04), 0 4px 14px -10px rgba(24,24,27,.10)";

// Per-status colours: a pastel fill + readable ink for pills, plus a mid
// tone for the card's left edge-stripe and the stat tiles.
type StatusTone = { edge: string; fill: string; ink: string; strong: string };
const STATUS_TONES: Record<PublishQueueStatus, StatusTone> = {
  queued: { edge: "#f0cd86", fill: "#fef6e0", ink: "#a16207", strong: "#a16207" },
  scheduled: { edge: "#a9dbf5", fill: "#e6f4fd", ink: "#0369a1", strong: "#0369a1" },
  published: { edge: "#a7e6bd", fill: "#e4f7ea", ink: "#15803d", strong: "#15803d" },
  failed: { edge: "#f4b8b2", fill: "#fdeceb", ink: "#b42318", strong: "#b42318" },
};

const buttonBase: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 9,
  border: `1px solid ${LINE_2}`,
  background: "#fff",
  color: INK,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const darkButton: React.CSSProperties = {
  ...buttonBase,
  background: INK,
  border: `1px solid ${INK}`,
  color: "#fff",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: `1px solid ${LINE_2}`,
  fontSize: 13,
  background: "#fff",
  color: INK,
  fontFamily: "inherit",
};

// Card shell with a status-coloured left edge-stripe.
function cardShell(status: PublishQueueStatus, selected = false): React.CSSProperties {
  return {
    border: `1px solid ${selected ? "#c7c7f2" : LINE}`,
    borderLeft: `3px solid ${STATUS_TONES[status].edge}`,
    borderRadius: 14,
    padding: 14,
    background: selected ? "#f3f3fe" : "#fff",
    boxShadow: CARD_SHADOW,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
}

// Pastel status pill.
function statusPill(status: PublishQueueStatus): React.CSSProperties {
  const t = STATUS_TONES[status];
  return {
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: t.fill,
    color: t.ink,
    alignSelf: "flex-start",
    textTransform: "capitalize",
  };
}

// Right-rail panel (the "Up next" schedule).
const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  boxShadow: CARD_SHADOW,
  overflow: "hidden",
};

const panelHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "13px 14px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: INK,
};

function getDefault6pmGmt(): string {
  const now = new Date();
  const today6pmUtc = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0)
  );
  if (today6pmUtc.getTime() < now.getTime()) {
    today6pmUtc.setUTCDate(today6pmUtc.getUTCDate() + 1);
  }
  const offsetMs = today6pmUtc.getTimezoneOffset() * 60 * 1000;
  const local = new Date(today6pmUtc.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export default function PublishQueueBoard({
  queueItems,
  defaultScheduleValue,
  clients = [],
  connectedAccounts = [],
  metaConnectionError = null,
  timeZone = "Etc/GMT",
}: {
  queueItems: QueueItem[];
  defaultScheduleValue: string;
  clients?: ClientLite[];
  connectedAccounts?: ConnectedAccount[];
  metaConnectionError?: string | null;
  timeZone?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [connectClientId, setConnectClientId] = useState<string>(
    clients[0]?.id ?? ""
  );

  const default6pm = useMemo(() => getDefault6pmGmt(), []);
  const zone = useMemo(() => describeZone(timeZone), [timeZone]);

  // The expired-token banner links here with #meta-connection to send the
  // operator straight to reconnecting. Open the (collapsed) panel and scroll
  // it into view — on first load (arriving from another page) and on
  // hashchange (clicking the banner while already on this page).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const openIfTargeted = () => {
      if (window.location.hash !== "#meta-connection") return;
      const el = document.getElementById("meta-connection");
      if (el instanceof HTMLDetailsElement) el.open = true;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>(
    {}
  );
  const [publishUrlDrafts, setPublishUrlDrafts] = useState<
    Record<string, string>
  >({});
  const [failureNoteDrafts, setFailureNoteDrafts] = useState<
    Record<string, string>
  >({});
  // Bulk selection of queued items (by queue item id).
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(
    () => new Set()
  );

  // Manual "mark published / mark failed" controls on scheduled cards are for
  // recording posts published or resolved by hand. They're off by default to
  // keep cards clean; an admin toggle reveals them (persisted per browser).
  const [showManualControls, setShowManualControls] = useState(false);
  useEffect(() => {
    try {
      setShowManualControls(localStorage.getItem("pq_manual_controls") === "1");
    } catch {
      /* localStorage unavailable — stay off */
    }
  }, []);
  function toggleManualControls(next: boolean) {
    setShowManualControls(next);
    try {
      localStorage.setItem("pq_manual_controls", next ? "1" : "0");
    } catch {
      /* ignore persistence failure */
    }
  }

  const clientNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) map[c.id] = c.name;
    return map;
  }, [clients]);

  const accountsByClient = useMemo(() => {
    const map: Record<string, ConnectedAccount[]> = {};
    for (const acc of connectedAccounts) {
      if (!map[acc.clientId]) map[acc.clientId] = [];
      map[acc.clientId].push(acc);
    }
    return map;
  }, [connectedAccounts]);

  const connectedClientIds = useMemo(
    () =>
      Object.keys(accountsByClient).sort((a, b) =>
        (clientNameById[a] ?? "").localeCompare(clientNameById[b] ?? "")
      ),
    [accountsByClient, clientNameById]
  );

  const scheduledItems = useMemo(
    () =>
      groupByPost(
        queueItems
        .filter((item) => item.status === "scheduled")
        .sort((a, b) =>
          String(a.scheduledFor ?? "").localeCompare(String(b.scheduledFor ?? ""))
        )
      ),
    [queueItems]
  );

  const queuedItems = useMemo(
    () =>
      groupByPost(
        queueItems
        .filter((item) => item.status === "queued")
        .sort((a, b) => a.postDate.localeCompare(b.postDate))
      ),
    [queueItems]
  );

  const publishedItems = useMemo(
    () =>
      groupByPost(
        queueItems
        .filter((item) => item.status === "published")
        .sort((a, b) =>
          String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""))
        )
      ),
    [queueItems]
  );

  const failedItems = useMemo(
    () =>
      groupByPost(
        queueItems
        .filter((item) => item.status === "failed")
        .sort((a, b) =>
          String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
        )
      ),
    [queueItems]
  );

  // Status filter driven by the summary tiles. "all" shows every section.
  const [filter, setFilter] = useState<"all" | PublishQueueStatus>("all");
  const showSection = (s: PublishQueueStatus) => filter === "all" || filter === s;
  const toggleFilter = (s: PublishQueueStatus) =>
    setFilter((cur) => (cur === s ? "all" : s));

  // Soonest scheduled posts, for the "Up next" rail (already sorted ascending).
  const upNext = useMemo(() => scheduledItems.slice(0, 6), [scheduledItems]);

  const summary = useMemo(
    () =>
      [
        { key: "queued", label: "Queued", value: queuedItems.length },
        { key: "scheduled", label: "Scheduled", value: scheduledItems.length },
        { key: "published", label: "Published", value: publishedItems.length },
        { key: "failed", label: "Failed", value: failedItems.length },
      ] as { key: PublishQueueStatus; label: string; value: number }[],
    [queuedItems.length, scheduledItems.length, publishedItems.length, failedItems.length]
  );

  function refresh() {
    router.refresh();
  }

  // Queue rows are grouped per post in the UI, so an action may target several.
  const idList = (queueId: string | string[]) =>
    Array.isArray(queueId) ? queueId : [queueId];

  function handleSchedule(queueId: string | string[]) {
    const ids = idList(queueId);
    const draft = scheduleDrafts[ids[0]] ?? defaultScheduleValue;
    if (!draft) {
      alert("Pick a scheduled time first.");
      return;
    }

    startTransition(async () => {
      try {
        const at = fromDateTimeLocalInputValue(draft);
        await Promise.all(
          ids.map((id) => scheduleProoferQueueItemAction(id, at))
        );
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not schedule item");
      }
    });
  }

  function handleMarkPublished(queueId: string | string[]) {
    const ids = idList(queueId);
    const publishUrl = (publishUrlDrafts[ids[0]] ?? "").trim();

    startTransition(async () => {
      try {
        await Promise.all(
          ids.map((id) =>
            markProoferQueueItemPublishedAction(id, publishUrl || undefined)
          )
        );
        setPublishUrlDrafts((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
        refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not mark as published"
        );
      }
    });
  }

  async function handlePublishNow(queueId: string | string[]) {
    if (
      !confirm(
        "Publish this post to Meta right now? It will go live on the connected Facebook Page or Instagram account."
      )
    ) {
      return;
    }
    try {
      // Publish each destination separately so one failing (e.g. a missing
      // Instagram connection) doesn't hide that the other succeeded.
      const ids = idList(queueId);
      const results = await Promise.all(
        ids.map(async (id) => ({ id, result: await publishMetaQueueItem(id) }))
      );
      const okUrls: string[] = [];
      const errors: string[] = [];
      for (const { result } of results) {
        if (result.ok) {
          if (result.publishUrl) okUrls.push(result.publishUrl);
        } else {
          errors.push(result.error);
        }
      }
      const okCount = results.length - errors.length;
      if (errors.length === 0) {
        alert(okUrls[0] ? `Published! ${okUrls[0]}` : "Published to Meta.");
      } else if (okCount === 0) {
        alert(`Publish failed: ${errors.join(" · ")}`);
      } else {
        alert(
          `Published ${okCount} of ${results.length}. Failed: ${errors.join(" · ")}`
        );
      }
      refresh();
    } catch (err) {
      alert(
        `Publish error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function handleConnectMeta() {
    if (!connectClientId) {
      alert("Pick a client first.");
      return;
    }
    window.location.href = `/api/meta/connect?clientId=${encodeURIComponent(
      connectClientId
    )}`;
  }

  function handleMarkFailed(queueId: string | string[]) {
    const ids = idList(queueId);
    const note = (failureNoteDrafts[ids[0]] ?? "").trim();

    startTransition(async () => {
      try {
        await Promise.all(
          ids.map((id) => markProoferQueueItemFailedAction(id, note || undefined))
        );
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not mark as failed");
      }
    });
  }

  function handleRemove(queueId: string | string[]) {
    const ids = idList(queueId);
    if (
      !confirm(
        ids.length > 1
          ? `Remove this post from the publish queue? It is queued for ${ids.length} platforms.`
          : "Remove this item from the publish queue?"
      )
    )
      return;

    startTransition(async () => {
      try {
        await Promise.all(ids.map((id) => removeProoferQueueItemAction(id)));
        refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not remove queue item"
        );
      }
    });
  }

  function handleDeletePost(postId: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return;

    startTransition(async () => {
      try {
        await deleteProoferPostByIdAction(postId);
        refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not delete post"
        );
      }
    });
  }

  // ── Bulk selection of queued items ──────────────────────────────────────────
  function toggleQueueSelected(id: string) {
    setSelectedQueueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllQueued(select: boolean) {
    setSelectedQueueIds(
      select ? new Set(queuedItems.map((i) => i.id)) : new Set()
    );
  }

  // Only count selections that still exist in the current queued list.
  const selectedQueued = useMemo(
    () => queuedItems.filter((i) => selectedQueueIds.has(i.id)),
    [queuedItems, selectedQueueIds]
  );

  function handleBulkRemove() {
    if (selectedQueued.length === 0) return;
    if (
      !confirm(
        `Remove ${selectedQueued.length} item${selectedQueued.length === 1 ? "" : "s"} from the publish queue?`
      )
    )
      return;

    const ids = selectedQueued.map((i) => i.id);
    startTransition(async () => {
      try {
        await Promise.all(ids.map((id) => removeProoferQueueItemAction(id)));
        setSelectedQueueIds(new Set());
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not remove items");
      }
    });
  }

  function handleBulkDeletePosts() {
    if (selectedQueued.length === 0) return;
    // Multiple queue items can point at the same post — delete each post once.
    const postIds = Array.from(new Set(selectedQueued.map((i) => i.postId)));
    if (
      !confirm(
        `Delete ${postIds.length} post${postIds.length === 1 ? "" : "s"}? This removes the queued item(s) and cannot be undone.`
      )
    )
      return;

    startTransition(async () => {
      try {
        await Promise.all(postIds.map((pid) => deleteProoferPostByIdAction(pid)));
        setSelectedQueueIds(new Set());
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete posts");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link
          href="/app/proofer"
          style={{
            fontSize: 13,
            color: INK_3,
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 6,
          }}
        >
          &larr; Back to Proofer
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.05,
            fontWeight: 800,
            color: INK,
            letterSpacing: "-0.03em",
          }}
        >
          Publish Queue
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: INK_2,
            maxWidth: "62ch",
            lineHeight: 1.5,
          }}
        >
          Approved posts land here automatically — give each a send time, then
          track it through to published or failed.{" "}
          <span style={{ color: INK_3 }}>
            Times shown in{" "}
            <span
              title={`${zone.label} (${timeZone})`}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: STATUS_TONES.scheduled.ink,
                background: STATUS_TONES.scheduled.fill,
                border: `1px solid ${STATUS_TONES.scheduled.edge}`,
                padding: "1px 7px",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
            >
              {zone.label} · {zone.abbrev}
            </span>{" "}
            <Link
              href="/app/settings"
              style={{ color: INK_2, textDecoration: "none", fontWeight: 600 }}
            >
              change in Settings &rarr;
            </Link>
          </span>
        </p>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            fontWeight: 600,
            color: INK_2,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={showManualControls}
            onChange={(e) => toggleManualControls(e.target.checked)}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          Manual publish / fail controls
          <span style={{ fontSize: 11, fontWeight: 700, color: INK_3 }}>
            {showManualControls ? "ON" : "OFF"}
          </span>
        </label>
      </div>

      {/* Summary tiles double as status filters — click one to show only that
          section, click again (or "Show all") to clear. */}
      <div className="pq-stats">
        {summary.map((s) => {
          const t = STATUS_TONES[s.key];
          const active = filter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleFilter(s.key)}
              aria-pressed={active}
              style={{
                position: "relative",
                textAlign: "left",
                border: `1px solid ${active ? t.edge : LINE}`,
                borderRadius: 14,
                padding: "13px 15px 12px",
                background: active ? t.fill : "#fff",
                boxShadow: CARD_SHADOW,
                cursor: "pointer",
                overflow: "hidden",
                font: "inherit",
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: t.edge,
                }}
              />
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  color: t.strong,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  marginTop: 7,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 700,
                  color: INK_3,
                }}
              >
                {s.label}
              </div>
            </button>
          );
        })}
      </div>

      {filter !== "all" && (
        <button
          type="button"
          onClick={() => setFilter("all")}
          style={{ ...buttonBase, alignSelf: "flex-start", background: SUNK }}
        >
          &larr; Show all
        </button>
      )}

      <div className="pq-grid">
        <main style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

      {showSection("queued") && (
      <SectionCard title="Queued">
        {queuedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No queued items right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Bulk selection toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                paddingBottom: 10,
                borderBottom: "1px solid #f4f4f5",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3f3f46",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    queuedItems.length > 0 &&
                    selectedQueued.length === queuedItems.length
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selectedQueued.length > 0 &&
                        selectedQueued.length < queuedItems.length;
                  }}
                  onChange={(e) => toggleSelectAllQueued(e.target.checked)}
                />
                Select all
              </label>
              <span style={{ fontSize: 12, color: "#71717a" }}>
                {selectedQueued.length} selected
              </span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={handleBulkRemove}
                disabled={selectedQueued.length === 0 || isPending}
                style={{
                  ...buttonBase,
                  color: "#991b1b",
                  opacity: selectedQueued.length === 0 ? 0.5 : 1,
                  cursor: selectedQueued.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Remove from queue
              </button>
              <button
                type="button"
                onClick={handleBulkDeletePosts}
                disabled={selectedQueued.length === 0 || isPending}
                style={{
                  ...buttonBase,
                  background: "#991b1b",
                  border: "1px solid #991b1b",
                  color: "#fff",
                  opacity: selectedQueued.length === 0 ? 0.5 : 1,
                  cursor: selectedQueued.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Delete posts
              </button>
            </div>
            {queuedItems.map((item) => {
              const scheduleValue =
                scheduleDrafts[item.id] ??
                toDateTimeLocalInputValue(item.scheduledFor, default6pm);
              const selected = selectedQueueIds.has(item.id);

              return (
                <div
                  key={item.id}
                  style={cardShell(item.status, selected)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleQueueSelected(item.id)}
                        aria-label={`Select ${item.clientName} ${formatDate(item.postDate)}`}
                        style={{ marginTop: 3, cursor: "pointer" }}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: "#18181b",
                          }}
                        >
                          {item.clientName}
                        <PlatformChips platforms={item.platforms} />
                        </div>
                        <div style={{ fontSize: 12, color: "#71717a" }}>
                          {formatDate(item.postDate)}
                        </div>
                      </div>
                    </div>

                    <div style={statusPill(item.status)}>{item.status}</div>
                  </div>

                  {/* Thumbnail beside the caption rather than under it — the card is
                      full width and the preview is small. */}
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <CarouselPreview
                      size={170}
                      urls={
                      item.mediaUrls.length > 0
                        ? item.mediaUrls
                        : item.imageUrl
                        ? [item.imageUrl]
                        : []
                      }
                    />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 200,
                        fontSize: 13,
                        color: "#27272a",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {item.caption || "No caption"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <input
                        type="datetime-local"
                        value={scheduleValue}
                        onChange={(e) =>
                          setScheduleDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 10, color: "#71717a" }}>
                        {(() => {
                          const iso = fromDateTimeLocalInputValue(scheduleValue);
                          const shown = iso ? formatDateTime(iso, timeZone) : "";
                          return shown
                            ? `Goes out: ${shown}`
                            : "Default 6 PM GMT";
                        })()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSchedule(item.id)}
                      disabled={isPending}
                      style={darkButton}
                    >
                      Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePublishNow(item.id)}
                      disabled={isPending}
                      style={{
                        ...darkButton,
                        background: "#1877f2",
                        borderColor: "#1877f2",
                      }}
                    >
                      Publish now
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkPublished(item.id)}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Mark published
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                      style={{
                        ...buttonBase,
                        color: "#991b1b",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      )}

      {showSection("scheduled") && (
      <SectionCard title="Scheduled">
        {scheduledItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No scheduled items right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scheduledItems.map((item) => (
              <div
                key={item.id}
                style={cardShell(item.status)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#18181b",
                      }}
                    >
                      {item.clientName}
                        <PlatformChips platforms={item.platforms} />
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#71717a",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginTop: 2,
                      }}
                    >
                      {formatDate(item.postDate)} · Scheduled for
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#18181b",
                        letterSpacing: "-0.01em",
                        lineHeight: 1.25,
                        marginTop: 1,
                      }}
                    >
                      {formatDateTime(item.scheduledFor, timeZone)}
                    </div>
                  </div>

                  <div style={statusPill(item.status)}>{item.status}</div>
                </div>

                {/* Thumbnail beside the caption — larger so the preview is
                    actually legible on a full-width card. */}
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <CarouselPreview
                    size={170}
                    urls={
                    item.mediaUrls.length > 0
                      ? item.mediaUrls
                      : item.imageUrl
                      ? [item.imageUrl]
                      : []
                    }
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 200,
                      fontSize: 13,
                      color: "#27272a",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {item.caption || "No caption"}
                  </div>
                </div>

                {/* Reschedule an already-scheduled post: pre-filled with its
                    current time, applied to every platform the post goes to. */}
                <div
                  className="publish-action-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <input
                      type="datetime-local"
                      value={
                        scheduleDrafts[item.id] ??
                        toDateTimeLocalInputValue(item.scheduledFor, default6pm)
                      }
                      onChange={(e) =>
                        setScheduleDrafts((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      aria-label="Change scheduled time"
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 10, color: "#71717a" }}>
                      {(() => {
                        const iso = fromDateTimeLocalInputValue(
                          scheduleDrafts[item.id] ??
                            toDateTimeLocalInputValue(item.scheduledFor, default6pm)
                        );
                        const shown = iso ? formatDateTime(iso, timeZone) : "";
                        return shown ? `New time: ${shown}` : "Pick a time";
                      })()}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSchedule(item.ids)}
                    disabled={isPending}
                    style={darkButton}
                  >
                    Reschedule
                  </button>
                </div>

                {showManualControls ? (
                  <>
                    <div
                      className="publish-action-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(220px, 1fr) auto auto",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        value={publishUrlDrafts[item.id] ?? ""}
                        onChange={(e) =>
                          setPublishUrlDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="Paste published URL (optional)"
                        style={inputStyle}
                      />

                      <button
                        type="button"
                        onClick={() => handleMarkPublished(item.id)}
                        disabled={isPending}
                        style={darkButton}
                      >
                        Mark published
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        disabled={isPending}
                        style={buttonBase}
                      >
                        Remove
                      </button>
                    </div>

                    <div
                      className="publish-action-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(220px, 1fr) auto",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        value={failureNoteDrafts[item.id] ?? ""}
                        onChange={(e) =>
                          setFailureNoteDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="Failure note (optional)"
                        style={inputStyle}
                      />

                      <button
                        type="button"
                        onClick={() => handleMarkFailed(item.id)}
                        disabled={isPending}
                        style={{
                          ...buttonBase,
                          color: "#991b1b",
                        }}
                      >
                        Mark failed
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      )}

      {showSection("published") && (
      <SectionCard title="Published">
        {publishedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No published items yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {publishedItems.map((item) => (
              <div
                key={item.id}
                style={cardShell(item.status)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#18181b",
                    }}
                  >
                    {item.clientName}
                        <PlatformChips platforms={item.platforms} />
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a" }}>
                    {formatDate(item.postDate)} · Published{" "}
                    {formatDateTime(item.publishedAt, timeZone)}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {item.publishUrl ? (
                    <a
                      href={item.publishUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...buttonBase,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      View post
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "#71717a" }}>
                      No URL saved
                    </span>
                  )}

                  <BoostPostButton
                    clientId={item.clientId}
                    platform={item.platform}
                    metaPostId={null}
                    publishUrl={item.publishUrl}
                  />

                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={isPending}
                    style={buttonBase}
                  >
                    Remove
                  </button>
                </div>
                </div>

                <CarouselPreview
                  size={170}
                  urls={
                    item.mediaUrls.length > 0
                      ? item.mediaUrls
                      : item.imageUrl
                      ? [item.imageUrl]
                      : []
                  }
                />

                {item.insightsFetchedAt && (
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      padding: "8px 12px",
                      background: "#f8fafc",
                      border: "1px solid #f1f5f9",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    {item.insightsReach != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsReach.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>reach</span></span>
                    )}
                    {item.insightsImpressions != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsImpressions.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>impressions</span></span>
                    )}
                    {item.insightsEngagement != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsEngagement.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>engagement</span></span>
                    )}
                    {item.insightsLikes != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsLikes.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>likes</span></span>
                    )}
                    {item.insightsComments != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsComments.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>comments</span></span>
                    )}
                    <span style={{ marginLeft: "auto", color: "#a1a1aa", fontSize: 11 }}>
                      fetched {new Date(item.insightsFetchedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      )}

      {showSection("failed") && (
      <SectionCard title="Failed">
        {failedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No failed items right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {failedItems.map((item) => {
              const scheduleValue =
                scheduleDrafts[item.id] ??
                toDateTimeLocalInputValue(item.scheduledFor, default6pm);

              return (
                <div
                  key={item.id}
                  style={cardShell(item.status)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#18181b",
                        }}
                      >
                        {item.clientName}
                        <PlatformChips platforms={item.platforms} />
                      </div>
                      <div style={{ fontSize: 12, color: "#71717a" }}>
                        {formatDate(item.postDate)}
                      </div>
                    </div>

                    <div style={statusPill(item.status)}>{item.status}</div>
                  </div>

                  {item.notes && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#991b1b",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {item.notes}
                    </div>
                  )}

                  <CarouselPreview
                    size={170}
                    urls={
                      item.mediaUrls.length > 0
                        ? item.mediaUrls
                        : item.imageUrl
                        ? [item.imageUrl]
                        : []
                    }
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <input
                        type="datetime-local"
                        value={scheduleValue}
                        onChange={(e) =>
                          setScheduleDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 10, color: "#71717a" }}>
                        {(() => {
                          const iso = fromDateTimeLocalInputValue(scheduleValue);
                          const shown = iso ? formatDateTime(iso, timeZone) : "";
                          return shown
                            ? `Goes out: ${shown}`
                            : "Default 6 PM GMT";
                        })()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSchedule(item.id)}
                      disabled={isPending}
                      style={darkButton}
                    >
                      Reschedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      )}
        </main>

        <aside className="pq-aside">
          <div style={panelStyle}>
            <div style={panelHeadStyle}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: STATUS_TONES.scheduled.edge,
                }}
              />
              Up next
            </div>
            {upNext.length > 0 ? (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {upNext.map((item, i) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "9px 14px",
                        borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 66,
                          fontSize: 12,
                          fontWeight: 800,
                          color: INK,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatInstantClockInZone(item.scheduledFor, timeZone)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: INK,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.clientName}
                        </div>
                        <div style={{ fontSize: 11, color: INK_3 }}>
                          {item.platforms.map(platformLabel).join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: INK_3,
                    padding: "10px 14px",
                    borderTop: `1px solid ${LINE}`,
                    background: SUNK,
                    lineHeight: 1.5,
                  }}
                >
                  Stored in UTC, shown in{" "}
                  <b style={{ color: INK_2 }}>{zone.label}</b> ({zone.abbrev}).
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: 12.5,
                  color: INK_3,
                  padding: "2px 14px 16px",
                  lineHeight: 1.5,
                }}
              >
                Nothing scheduled yet. Queue a post and give it a send time.
              </div>
            )}
          </div>
      <details
        id="meta-connection"
        style={{
          border: "1px solid #e4e4e7",
          borderRadius: 14,
          background: "#fff",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <summary
          style={{
            padding: "12px 18px",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            color: "#18181b",
            display: "flex",
            alignItems: "center",
            gap: 8,
            listStyle: "none",
          }}
        >
          <span style={{ fontSize: 11, color: "#71717a" }}>&#9654;</span>
          Meta connection
          <span style={{ fontSize: 12, fontWeight: 500, color: "#71717a", marginLeft: 4 }}>
            {connectedClientIds.length > 0
              ? `${connectedAccounts.length} accounts connected`
              : "Not connected"}
          </span>
        </summary>
        <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={connectClientId}
              onChange={(e) => setConnectClientId(e.target.value)}
              disabled={clients.length === 0}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                background: "#fff",
                fontSize: 12,
                fontWeight: 600,
                color: "#18181b",
              }}
            >
              {clients.length === 0 && <option value="">No clients</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleConnectMeta}
              disabled={!connectClientId}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: connectClientId ? "#1877f2" : "#e4e4e7",
                color: connectClientId ? "#fff" : "#a1a1aa",
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: connectClientId ? "pointer" : "not-allowed",
              }}
            >
              Connect Meta
            </button>
          </div>

          {metaConnectionError && (
            <div
              style={{
                fontSize: 12,
                color: "#991b1b",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                padding: "6px 10px",
              }}
            >
              {metaConnectionError}
            </div>
          )}

          {connectedClientIds.length === 0 && !metaConnectionError ? (
            <div style={{ fontSize: 12, color: "#71717a" }}>
              No connected accounts. Pick a client and click Connect Meta.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {connectedClientIds.map((cid) => {
                const accs = accountsByClient[cid] ?? [];
                const fb = accs.filter((a) => a.platform === "facebook");
                const ig = accs.filter((a) => a.platform === "instagram");
                const count = accs.length;
                return (
                  <details key={cid} style={{ fontSize: 12 }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        padding: "4px 0",
                        fontWeight: 600,
                        color: "#166534",
                        listStyle: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 10, color: "#a1a1aa" }}>&#9654;</span>
                      {clientNameById[cid] ?? `Client ${cid}`} · {count} account{count === 1 ? "" : "s"}
                    </summary>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "4px 0 2px 16px" }}>
                      {fb.map((a) => (
                        <span key={`fb-${a.accountId}`} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "#e7f0fe", border: "1px solid #93c5fd", color: "#1d4ed8" }}>
                          FB · {a.accountName || a.accountId}
                        </span>
                      ))}
                      {ig.map((a) => (
                        <span key={`ig-${a.accountId}`} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "#fdf2f8", border: "1px solid #f9a8d4", color: "#be185d" }}>
                          IG · @{a.accountName || a.accountId}
                        </span>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </details>
        </aside>
      </div>
    </div>
  );
}

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "../components/SectionCard";
import ImageUpload from "../components/ImageUpload";
import {
  useIsNarrow,
  useToasts,
  ToastStack,
  BottomSheet,
  AutoGrowTextarea,
  haptic,
} from "../components/mobile";
import { uploadToStorage, UPLOAD_MAX_FILE_SIZE } from "../lib/uploadToStorage";
import { createClient } from "../../../lib/supabase/client";
import type {
  ProoferPost,
  ProoferPublishQueueItem,
  ProoferStatus,
  ProoferPlatform,
  ContentPillar,
  IdeaKind,
  PostIdea,
} from "../lib/types";
import {
  PROOFER_PLATFORMS,
  PROOFER_PLATFORM_LABELS,
  INSTAGRAM_FORMATS,
  PUBLISH_TARGET_LABELS,
} from "../lib/types";
import type { PublishTarget } from "../lib/types";
import {
  DEFAULT_TIMEZONE,
  formatUtcClockInZone,
  formatInstantClockInZone,
  formatDateTimeInZone,
  zonedDateKey,
  hhmmInZone,
  zonedTimeToUtcIso,
  zoneAbbrev,
} from "../../../lib/timezone";
import type { ProoferIdeaLite } from "../lib/queries";
import { rememberLastClient } from "../../proofer/last-client";
import {
  saveProoferPostAction,
  updateProoferStatusAction,
  deleteProoferPostAction,
  propagateProoferPlatformForwardAction,
  propagateProoferPillarForwardAction,
  addProoferCommentAction,
  toggleProoferCommentResolvedAction,
  createContentPillarAction,
  updateContentPillarAction,
  archiveContentPillarAction,
  rejectPostIdeaAction,
  clearPostIdeasAction,
  scheduleProoferQueueItemAction,
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

const PROOFER_LIGHT_LEGEND = [
  { dot: "#fda4af", label: "To Improve" },
  { dot: "#fde68a", label: "In Progress" },
  { dot: "#86efac", label: "Approved" },
] as const;

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

// Step a "YYYY-MM" value by whole months (used by the one-click month arrows).
function shiftMonthValue(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_VALUE_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

function formatMonthValueLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return MONTH_VALUE_LABEL.format(new Date(y, m - 1, 1));
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

// Local midnight today, for comparing whole calendar days.
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// "YYYY-MM" key for the month a date falls in.
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// A short relative label ("Today" / "Tomorrow" / "In 3 days" …) to orient each
// day card. Returns null once the day is far enough away that the weekday and
// date shown alongside it are orientation enough on their own.
function relativeDayLabel(d: Date): string | null {
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - startOfToday().getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -6) return `${Math.abs(diffDays)} days ago`;
  return null;
}

// Map a raw proofer_posts row (snake_case, as delivered by Supabase Realtime)
// into a ProoferPost. Mirrors the server mapping in queries.ts; comments and
// the publish queue live in other tables, so callers preserve those.
/** Mirrors queries.ts's parsePublishTargets for realtime rows. */
function parsePublishTargetsRow(row: Record<string, unknown>): PublishTarget[] {
  const raw = row.publish_targets;
  if (Array.isArray(raw)) {
    const cleaned = raw.filter(
      (t): t is PublishTarget => t === "instagram" || t === "facebook"
    );
    if (cleaned.length > 0) return cleaned;
  }
  return String(row.platform ?? "") === "facebook"
    ? ["facebook"]
    : ["instagram"];
}

function rowToProoferPost(row: Record<string, unknown>): ProoferPost {
  const mediaUrls = Array.isArray(row.media_urls)
    ? (row.media_urls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u !== ""
      )
    : [];
  const kind = row.linked_idea_kind;
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    postDate: str(row.post_date),
    platform: (row.platform ?? "instagram_feed") as ProoferPlatform,
    pillarId: row.pillar_id ? String(row.pillar_id) : null,
    linkedIdeaId: row.linked_idea_id ? String(row.linked_idea_id) : null,
    linkedIdeaKind:
      kind === "video" || kind === "carousel" || kind === "story" ? kind : null,
    caption: str(row.caption),
    imageUrl: str(row.image_url),
    mediaUrls,
    publishTime: str(row.publish_time, "18:00"),
    publishTargets: parsePublishTargetsRow(row),
    status: (row.status ?? "none") as ProoferStatus,
    createdBy: str(row.created_by),
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function formatCommentTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTimeInZone(date, DEFAULT_TIMEZONE);
}

// The "Scheduled for …" label for a locked post, in the display zone.
// Prefers the publish queue's scheduled_for so that re-timing a slot on the
// Publish Queue page is reflected here; falls back to the post's own
// publish_time for posts proofed but not yet queued. If the queue moved the
// post to a different calendar day, the full date is shown so the time isn't
// read against the wrong day. Returns "" when there's nothing to show.
function scheduledLabel(
  publishQueue: ProoferPublishQueueItem[] | undefined,
  publishTime: string,
  dateKey: string,
  timeZone: string
): string {
  const queued = (publishQueue ?? []).filter((q) => q.scheduledFor);
  // Most recent scheduled/queued slot wins; queue items arrive
  // oldest-first, so scan from the end.
  const active =
    [...queued]
      .reverse()
      .find((q) => q.status === "scheduled" || q.status === "queued") ??
    queued[queued.length - 1];

  if (active?.scheduledFor) {
    const sameDay = zonedDateKey(active.scheduledFor, timeZone) === dateKey;
    return sameDay
      ? formatInstantClockInZone(active.scheduledFor, timeZone)
      : formatDateTimeInZone(active.scheduledFor, timeZone);
  }
  return formatUtcClockInZone(dateKey, publishTime, timeZone);
}

// The time-of-day ("HH:MM") to seed the reschedule input with, expressed in
// the agency display zone (e.g. BST) so the input reads the same timezone as
// everything else on the card. Uses the post's current scheduled_for if it has
// one, otherwise its publish_time (stored as UTC) on the post's date.
function scheduledSeedHHMM(
  publishQueue: ProoferPublishQueueItem[] | undefined,
  publishTime: string,
  dateKey: string,
  timeZone: string
): string {
  const active = (publishQueue ?? []).filter((q) => q.scheduledFor).pop();
  if (active?.scheduledFor) return hhmmInZone(active.scheduledFor, timeZone);
  const pt = /^\d{2}:\d{2}$/.test(publishTime) ? publishTime : "18:00";
  return hhmmInZone(`${dateKey}T${pt}:00.000Z`, timeZone) || pt;
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
  if (/\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url)) return true;
  // Google Drive video URLs use the uc endpoint
  if (/drive\.google\.com\/uc\?/.test(url)) return true;
  return false;
}

function isDriveVideo(url: string): boolean {
  return /drive\.google\.com\/uc\?/.test(url);
}

function driveVideoFileId(url: string): string | null {
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function driveThumbUrl(url: string): string | null {
  const id = driveVideoFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w400` : null;
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

const monthNavStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "3px 6px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
};

const monthNavBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 30,
  height: 30,
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "#18181b",
  fontSize: 20,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function mobileToolbarButtonStyle(accent: boolean): React.CSSProperties {
  return {
    flex: accent ? "0 0 auto" : 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 14px",
    borderRadius: 12,
    border: `1px solid ${accent ? "#bfdbfe" : "#e4e4e7"}`,
    background: accent ? "#eff6ff" : "#fff",
    color: accent ? "#1d4ed8" : "#3f3f46",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    overflow: "hidden",
    whiteSpace: "nowrap",
  };
}

// One-click platform toggle used on the standalone /proofer surface. `on`
// reflects whether the message currently publishes to that platform; the kind
// tints the active state with Instagram's magenta or Facebook's blue.
// Shared width for the platform toggles (Instagram / Facebook) and the
// Reschedule button, so they line up as a tidy column of equal-width boxes.
const PLAT_TOGGLE_WIDTH = 150;

function platToggleStyle(
  on: boolean,
  kind: "ig" | "fb",
  disabled: boolean
): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minWidth: PLAT_TOGGLE_WIDTH,
    border: "1px solid #d4d4d8",
    background: "#fff",
    color: "#52525b",
    fontSize: 13,
    fontWeight: 700,
    padding: "9px 13px",
    borderRadius: 10,
    cursor: disabled ? "not-allowed" : "pointer",
  };
  if (!on) return { ...base, opacity: disabled ? 0.45 : 0.6 };
  return kind === "ig"
    ? { ...base, borderColor: "#dd2a7b", background: "#fdf2f8", color: "#9d174d" }
    : { ...base, borderColor: "#1877f2", background: "#eff6ff", color: "#1d4ed8" };
}

function selectStyle(isNarrow: boolean, disabled: boolean): React.CSSProperties {
  return {
    ...inputStyle,
    padding: isNarrow ? "10px 8px" : "6px 8px",
    fontSize: isNarrow ? 14 : 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
    width: "100%",
    minWidth: 0,
  };
}

function dayArrowStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 12,
    border: "1px solid #e4e4e7",
    background: "#fff",
    color: disabled ? "#d4d4d8" : "#3f3f46",
    fontSize: 22,
    lineHeight: 1,
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

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
  timeZone = "Etc/GMT",
  // Where the board's own client/month navigation and Publish Queue button
  // point. Defaults to the admin-panel route so the existing /app/proofer page
  // is unchanged; the standalone /proofer page overrides basePath so switching
  // client or month keeps the user on the standalone page.
  basePath = "/app/proofer",
  publishPath = "/app/proofer/publish",
  // Opt-in cosmetic variant for the standalone /proofer surface. When true the
  // per-message Instagram/Facebook selectors render as one-click toggle
  // buttons; when false (the /app/proofer default) the original dropdowns are
  // used. Only the control's presentation changes — the publishTargets it
  // writes, and every other behaviour, are identical.
  standalone = false,
  // A day (YYYY-MM-DD) to force-show and scroll to on mount — used by the
  // onboarding finish so the just-created post is always visible and centred,
  // even if it would otherwise be filtered out (past day, alternate-day view).
  focusDateKey,
}: {
  clients: ClientLite[];
  months: MonthOpt[];
  initialClientId: string;
  initialMonth: string;
  initialPosts: ProoferPost[];
  initialPillars: ContentPillar[];
  initialIdeas: ProoferIdeaLite[];
  initialPostIdeas: PostIdea[];
  timeZone?: string;
  basePath?: string;
  publishPath?: string;
  standalone?: boolean;
  focusDateKey?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Reschedule-from-proofer: a per-post edited time (UTC "HH:MM") and which
  // post currently has a reschedule in flight (for the button's pending state).
  const [rescheduleTimes, setRescheduleTimes] = useState<Record<string, string>>({});
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  // Standalone format selector: which slot's Feed/Story/Reel group is tapped
  // open (touch has no hover, so a tap expands it; desktop still reveals on
  // hover via CSS).
  const [openFmtKey, setOpenFmtKey] = useState<string | null>(null);
  // Standalone Clear: which slot is awaiting an inline "Confirm" click.
  const [confirmClearKey, setConfirmClearKey] = useState<string | null>(null);
  // Optimistic status per slot so a traffic-light click flips instantly instead
  // of waiting for the server round-trip.
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, ProoferStatus>>({});

  const [clientId, setClientId] = useState(initialClientId);
  // Remember the account being viewed so signing back in resumes on it. The
  // cookie is the fast same-device path; the server-side preference keeps it in
  // sync across devices and across the two Proofer surfaces (this admin board
  // and the standalone Proofer). Fires on the current account and on changes.
  useEffect(() => {
    if (clientId) rememberLastClient(clientId);
  }, [clientId]);
  const [month, setMonth] = useState(initialMonth);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [postFrequency, setPostFrequency] = useState<"every-day" | "every-other-day">("every-other-day");
  // Whether elapsed days of the current month are shown ("View history").
  const [showPast, setShowPast] = useState(false);
  // Whether the floating "Jump to today" button is shown (today off-screen).
  const [showJumpToday, setShowJumpToday] = useState(false);
  // Date-based behaviour ("today") is client-only: the server's clock/timezone
  // can disagree with the browser's, so we defer it until after mount to keep
  // the first render identical to the server's and avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isNarrow = useIsNarrow();
  const { toasts, notify, dismiss } = useToasts();
  // Mobile only: the settings card and the idea generator live in sheets.
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobileIdeasOpen, setMobileIdeasOpen] = useState(false);

  // Is the board currently looking at the month that contains today?
  const isCurrentMonth = mounted && month === monthKey(startOfToday());

  type Draft = {
    caption: string;
    mediaUrls: string[];
    pillarId: string | null;
    linkedIdeaId: string | null;
    linkedIdeaKind: IdeaKind | null;
    publishTime: string;
    publishTargets: PublishTarget[];
  };
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    // Slots that already have a saved post must NOT be pre-filled from an AI
    // idea. A draft always wins over the saved post in the editor, so seeding
    // one here would mask the real content — and the next status change would
    // persist the AI draft over it. Only seed genuinely empty slots. (This
    // mirrors the !existingPost guard already used in handleClearIdeas.)
    const savedSlots = new Set(
      initialPosts.map((p) => postKey(p.postDate.slice(0, 10), p.platform))
    );
    for (const idea of initialPostIdeas) {
      const slotKey = postKey(idea.postSlotDate.slice(0, 10), idea.platform as ProoferPlatform);
      if (savedSlots.has(slotKey)) continue;
      if (!initial[slotKey]) {
        const composed = [idea.firstLine, idea.captionIdea, idea.cta, idea.hashtags]
          .filter(Boolean).join("\n\n");
        initial[slotKey] = { caption: composed, mediaUrls: [], pillarId: idea.contentPillarId ?? null, linkedIdeaId: null, linkedIdeaKind: null, publishTime: "18:00", publishTargets: ["instagram"] };
      }
    }
    return initial;
  });
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
  // Ideas are platform-agnostic — one per day, shown in the day's single view.
  // The canonical Instagram Feed key is where they're stored/seeded so they land
  // in the default view; the format + publish targets are chosen per post later.
  const genPlatform: ProoferPlatform = "instagram_feed";
  const [genPrompt, setGenPrompt] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ count: number; emptySlots: number } | null>(null);
  // True when a generate run produced nothing because every day is already
  // taken by (clearable) AI ideas — lets us offer a one-click clear+regenerate
  // instead of the dead-end "click Clear AI" message.
  const [genNeedsClear, setGenNeedsClear] = useState(false);
  const [captionModifying, setCaptionModifying] = useState<Record<string, string | null>>({});
  const [previewIdxMap, setPreviewIdxMap] = useState<Record<string, number>>({});
  // ── Client media library ───────────────────────────────────────────────────
  const [clientImages, setClientImages] = useState<{ id: string; publicUrl: string; table: "site" | "upload" }[]>([]);
  const [clientImagesLoading, setClientImagesLoading] = useState(false);
  const [clientImagesLoaded, setClientImagesLoaded] = useState<string | null>(null); // tracks which clientId was loaded
  const [imgLibraryPostKey, setImgLibraryPostKey] = useState<string | null>(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgScanning, setImgScanning] = useState(false);
  const [imgScanMsg, setImgScanMsg] = useState<string | null>(null);
  // Slot key currently receiving a pasted-from-clipboard image (for the inline
  // "Uploading pasted image…" hint), or null when nothing is uploading.
  const [pasteUploadKey, setPasteUploadKey] = useState<string | null>(null);

  // ── Pexels stock photo picker ──────────────────────────────────────────────
  const [pexelsPostKey, setPexelsPostKey] = useState<string | null>(null);
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsPhotos, setPexelsPhotos] = useState<{ id: number; thumb: string; full: string; photographer: string }[]>([]);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ url: string; credit?: string; x: number; y: number } | null>(null);

  const pillarsById = useMemo(() => {
    const map = new Map<string, ContentPillar>();
    initialPillars.forEach((p) => map.set(p.id, p));
    return map;
  }, [initialPillars]);

  // Posts are seeded from the server and then kept live via Supabase Realtime,
  // so a teammate's saved changes appear without a refresh. Re-seed whenever the
  // server sends fresh data (month/client switch, or our own save's refresh).
  const [livePosts, setLivePosts] = useState<ProoferPost[]>(initialPosts);
  // Slots where a remote change landed while the user had unsaved edits. We
  // surface a "load their version" nudge instead of clobbering their draft.
  const [staleKeys, setStaleKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setLivePosts(initialPosts);
    setStaleKeys(new Set());
  }, [initialPosts]);

  // Ideas have no realtime channel, and navigating to a new month/client feeds
  // fresh initialPostIdeas WITHOUT remounting the board — so without this the
  // board keeps showing the previous view's ideas (or none) while the new
  // month's ideas sit unseen in the database, making empty-looking slots that
  // still report "all full" on generate. Re-sync ideas and re-seed their draft
  // captions here, never clobbering a saved post or an already-edited draft.
  useEffect(() => {
    setPostIdeas(initialPostIdeas);
    const savedSlots = new Set(
      initialPosts.map((p) => postKey(p.postDate.slice(0, 10), p.platform))
    );
    setDrafts((prev) => {
      const next = { ...prev };
      for (const idea of initialPostIdeas) {
        const slotKey = postKey(idea.postSlotDate.slice(0, 10), idea.platform as ProoferPlatform);
        if (savedSlots.has(slotKey)) continue;
        if (next[slotKey]) continue;
        const composed = [idea.firstLine, idea.captionIdea, idea.cta, idea.hashtags]
          .filter(Boolean).join("\n\n");
        next[slotKey] = { caption: composed, mediaUrls: [], pillarId: idea.contentPillarId ?? null, linkedIdeaId: null, linkedIdeaKind: null, publishTime: "18:00", publishTargets: ["instagram"] };
      }
      return next;
    });
  }, [initialPostIdeas, initialPosts]);

  // Live view of the current drafts for the realtime callback, without making
  // the subscription tear down and re-subscribe on every keystroke.
  const draftsRef = useRef<Record<string, unknown>>({});

  const postsByKey = useMemo(() => {
    const map = new Map<string, ProoferPost>();
    livePosts.forEach((p) =>
      map.set(postKey(p.postDate.slice(0, 10), p.platform), p)
    );
    return map;
  }, [livePosts]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // ── Realtime: reflect saved changes without a refresh ───────────────────────
  useEffect(() => {
    if (!clientId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`proofer-posts:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "proofer_posts",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = payload.old?.id ? String(payload.old.id) : null;
            if (oldId) setLivePosts((prev) => prev.filter((p) => p.id !== oldId));
            return;
          }

          const incoming = rowToProoferPost(
            payload.new as Record<string, unknown>
          );
          // Only the month currently on screen is relevant.
          if (incoming.postDate.slice(0, 7) !== month) return;
          // NOTE: we intentionally do NOT skip changes authored by the current
          // user. The same account is often open on two devices (phone +
          // desktop), and a save on one must still appear live on the other.
          // Applying our own tab's echo is harmless — it's idempotent with the
          // router.refresh() that save handlers already trigger.

          setLivePosts((prev) => {
            const idx = prev.findIndex((p) => p.id === incoming.id);
            if (idx === -1) return [...prev, incoming];
            const next = prev.slice();
            // Preserve comments / publish queue loaded from their own tables.
            next[idx] = {
              ...incoming,
              comments: prev[idx].comments,
              publishQueue: prev[idx].publishQueue,
            };
            return next;
          });

          // If the user is mid-edit on this slot, don't overwrite their draft —
          // flag it so they can choose to pull in the newer version.
          const key = postKey(incoming.postDate.slice(0, 10), incoming.platform);
          if (draftsRef.current[key]) {
            setStaleKeys((prev) => {
              if (prev.has(key)) return prev;
              const next = new Set(prev);
              next.add(key);
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, month]);

  function loadRemoteUpdate(key: string) {
    // Discard the local draft so the editor falls back to the (now newer)
    // saved post, and clear the nudge.
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setStaleKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function dismissStale(key: string) {
    setStaleKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

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
  const monthValues = useMemo(() => months.map((m) => m.value), [months]);

  function getActivePlatform(dateKey: string): ProoferPlatform {
    const stored = activePlatformByDate[dateKey];
    if (stored) return stored;
    const variants = platformsByDate.get(dateKey);
    if (variants && variants.size > 0) {
      for (const p of PROOFER_PLATFORMS) {
        if (variants.has(p)) return p;
      }
    }
    // No saved post drives the tab — fall back to a platform that has a
    // generated idea or seeded draft, so freshly generated ideas surface on
    // the right tab instead of being hidden behind the default platform.
    for (const p of PROOFER_PLATFORMS) {
      const k = postKey(dateKey, p);
      if ((postIdeasByKey.get(k) ?? []).length > 0 || drafts[k]) return p;
    }
    return DEFAULT_PLATFORM;
  }

  function setActivePlatform(dateKey: string, platform: ProoferPlatform) {
    setActivePlatformByDate((prev) => ({ ...prev, [dateKey]: platform }));
  }

  function handlePlatformChange(dateKey: string, platform: ProoferPlatform) {
    setActivePlatform(dateKey, platform);
    if (!clientId) return;
    startTransition(async () => {
      try {
        await propagateProoferPlatformForwardAction(
          clientId,
          dateKey,
          platform,
          monthValues
        );
      } catch (err) {
        notify(
          err instanceof Error
            ? err.message
            : "Could not copy platform to future months.",
          "error"
        );
      }
    });
  }

  function handlePillarPropagation(
    dateKey: string,
    platform: ProoferPlatform,
    pillarId: string | null
  ) {
    if (!clientId) return;
    startTransition(async () => {
      try {
        await propagateProoferPillarForwardAction(
          clientId,
          dateKey,
          platform,
          pillarId,
          monthValues
        );
      } catch (err) {
        notify(
          err instanceof Error
            ? err.message
            : "Could not copy pillar to future months.",
          "error"
        );
      }
    });
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
      // A brand new slot defaults to Instagram — the overwhelmingly common
      // case, and it matches what an unmigrated row implies.
      publishTargets: existing?.publishTargets ?? ["instagram"],
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

  // Paste an image straight from the clipboard (Cmd/Ctrl+V) into a post. Only
  // intercepts when the clipboard actually carries image data — plain text
  // pastes fall through to the caption as normal.
  async function handlePasteMedia(
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    dateKey: string,
    platform: ProoferPlatform,
    slotKey: string
  ) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return; // no image — let the normal text paste happen
    e.preventDefault();
    if (pasteUploadKey) return; // an upload is already in flight

    setPasteUploadKey(slotKey);
    try {
      for (const file of files) {
        if (file.size > UPLOAD_MAX_FILE_SIZE) {
          notify("Pasted image is too large (max 30 MB).", "error");
          continue;
        }
        const url = await uploadToStorage(file, `proofer/${clientId}/${month}`, {
          bucket: "postimages",
        });
        addMediaUrl(dateKey, platform, url);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not upload pasted image.", "error");
    } finally {
      setPasteUploadKey(null);
    }
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
    router.push(`${basePath}?${params.toString()}`);
  }

  function handleSelectClient(id: string) {
    setClientId(id);
    rememberLastClient(id);
    navigate(id, month);
  }

  function handleSelectMonth(value: string) {
    setMonth(value);
    navigate(clientId, value);
  }

  // Note: there is no standalone save. Setting a status via the dots is what
  // commits a draft (see handleStatus) — that's the flow everyone is used to.

  function handleStatus(
    dateKey: string,
    platform: ProoferPlatform,
    status: ProoferStatus
  ) {
    const key = postKey(dateKey, platform);
    // Flip the dot immediately; reconcile/revert once the server responds.
    setOptimisticStatus((prev) => ({ ...prev, [key]: status }));
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
            draft.linkedIdeaKind,
            // Without this the action falls back to its "18:00" default and
            // silently discards whatever time was set on the draft.
            draft.publishTime,
            draft.publishTargets
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
        // Revert the optimistic flip on failure.
        setOptimisticStatus((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        notify(err instanceof Error ? err.message : "Could not update status", "error");
      }
    });
  }

  // Reschedule a locked post from the proofer. Sets the publish queue's
  // scheduled_for to the post's OWN date (dateKey) at the chosen UTC time,
  // across every platform the post is queued to. Using the post's date keeps
  // the send day aligned with the calendar slot it lives on.
  function handleProoferReschedule(
    dateKey: string,
    post: ProoferPost,
    hhmm: string
  ) {
    const ids = (post.publishQueue ?? []).map((q) => q.id);
    if (ids.length === 0) {
      notify("This post isn't in the publish queue yet.", "error");
      return;
    }
    // hhmm is in the agency display zone; convert to the UTC instant we store.
    const at = zonedTimeToUtcIso(dateKey, hhmm, timeZone);
    if (!at) {
      notify("Pick a valid time.", "error");
      return;
    }
    setReschedulingId(post.id);
    startTransition(async () => {
      try {
        await Promise.all(
          ids.map((id) => scheduleProoferQueueItemAction(id, at))
        );
        notify("Rescheduled.", "info");
        router.refresh();
      } catch (err) {
        notify(
          err instanceof Error ? err.message : "Could not reschedule",
          "error"
        );
      } finally {
        setReschedulingId(null);
      }
    });
  }

  function handleDelete(
    dateKey: string,
    platform: ProoferPlatform,
    skipConfirm = false
  ) {
    if (!skipConfirm && !confirm("Clear this day?")) return;
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
        // Drop this slot's AI ideas locally too — the server just rejected
        // them, so they must not linger in the panel or re-seed a draft.
        setPostIdeas((prev) =>
          prev.filter(
            (i) =>
              !(
                i.postSlotDate.slice(0, 10) === dateKey && i.platform === platform
              )
          )
        );
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not delete", "error");
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
      notify("Save the post first before adding comments.", "error");
      return;
    }
    if (!value) {
      notify("Write a comment first.", "error");
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
        notify(err instanceof Error ? err.message : "Could not add comment", "error");
      }
    });
  }

  function handleCreatePillar() {
    const name = newPillarName.trim();
    if (!name) {
      notify("Pillar name is required.", "error");
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
        notify(err instanceof Error ? err.message : "Could not create pillar", "error");
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
      notify("Pillar name is required.", "error");
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
        notify(err instanceof Error ? err.message : "Could not update pillar", "error");
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
        notify(err instanceof Error ? err.message : "Could not archive pillar", "error");
      }
    });
  }

  function handleToggleResolved(commentId: string, resolved: boolean) {
    startTransition(async () => {
      try {
        await toggleProoferCommentResolvedAction(commentId, resolved);
        router.refresh();
      } catch (err) {
        notify(
          err instanceof Error ? err.message : "Could not update comment status",
          "error"
        );
      }
    });
  }

  // ── AI idea handlers ───────────────────────────────────────────────────────

  // Best-effort: pull a royalty-free stock photo matching a generated idea's
  // visual concept and set it as the card's image, unless the user already has
  // media there. Failures (no Pexels key, no match, network) are swallowed —
  // the idea's caption still stands on its own.
  async function attachSuggestedImage(slotKey: string, idea: PostIdea) {
    const query = (idea.imageIdea || idea.title || idea.captionIdea || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!query) return;
    try {
      const res = await fetch(`/api/suggest-images?q=${encodeURIComponent(query)}&per_page=1`);
      const data = await res.json();
      const url: string | undefined = data?.photos?.[0]?.full;
      if (!url) return;
      setDrafts((prev) => {
        const d = prev[slotKey];
        // Only fill the idea's own freshly-seeded draft, and never overwrite
        // media the user (or a real post) already put there.
        if (!d || (d.mediaUrls && d.mediaUrls.length > 0)) return prev;
        return { ...prev, [slotKey]: { ...d, mediaUrls: [url] } };
      });
    } catch {
      /* best-effort — leave the card image empty */
    }
  }

  async function handleGenerateIdeas() {
    if (!clientId || !month) return;
    setGenLoading(true);
    setGenError(null);
    setGenResult(null);
    setGenNeedsClear(false);

    let grandTotal = 0;
    let totalEmpty = 0;
    let errorMsg: string | null = null;
    const MAX_PASSES = 3; // server now fills all slots per pass — 3 is plenty

    try {
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        let passCount = 0;
        let passEmpty = 0;
        let passErrored = false;

        try {
          // Build local today string (YYYY-MM-DD) using the browser's timezone
          const _now = new Date();
          const localToday = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

          const res = await fetch("/api/generate-post-ideas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ clientId, month, platform: genPlatform, prompt: genPrompt, today: localToday, postFrequency }),
          });

          if (!res.body) { errorMsg = "No response from server."; break; }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

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
                  passEmpty = Number(msg.emptySlotsFound ?? 0);
                  if (pass === 0) totalEmpty = passEmpty;

                } else if (msg.type === "idea") {
                  const idea = msg.idea as PostIdea;
                  setPostIdeas((prev) => {
                    if (prev.some((i) => i.id === idea.id)) return prev;
                    return [...prev, idea];
                  });
                  const slotKey = postKey(idea.postSlotDate.slice(0, 10), idea.platform as ProoferPlatform);
                  setDrafts((prev) => {
                    // Never overlay a slot that already has a draft or a saved
                    // post — an idea must not mask/overwrite real content.
                    if (prev[slotKey] || postsByKey.has(slotKey)) return prev;
                    const composed = [idea.firstLine, idea.captionIdea, idea.cta, idea.hashtags]
                      .filter(Boolean).join("\n\n");
                    return {
                      ...prev,
                      [slotKey]: { caption: composed, mediaUrls: [], pillarId: idea.contentPillarId ?? null, linkedIdeaId: null, linkedIdeaKind: null, publishTime: "18:00", publishTargets: ["instagram"] },
                    };
                  });
                  // Fetch a suggested stock photo for this idea in the background
                  // and drop it into the card (best-effort — never blocks the stream).
                  void attachSuggestedImage(slotKey, idea);
                  passCount++;
                  grandTotal++;
                  setGenResult({ count: grandTotal, emptySlots: totalEmpty });

                } else if (msg.type === "error") {
                  errorMsg = String(msg.error ?? "Generation failed.");
                  passErrored = true;
                }
              } catch { /* malformed line */ }
            }
          }
        } catch (err) {
          if (err instanceof Error) {
            if (err.name === "AbortError") {
              // Our 60s timeout fired — stop retrying
              if (grandTotal === 0) errorMsg = "Generation timed out — please try again.";
            } else {
              errorMsg = "Network error — please try again.";
            }
          }
          passErrored = true;
        } finally {
          clearTimeout(timeout);
        }

        if (passErrored || passEmpty === 0 || passCount === 0) break;
        await new Promise<void>((r) => setTimeout(r, 300));
      }

      if (grandTotal === 0 && !errorMsg) {
        // Nothing generated. If it's because leftover AI ideas fill the month —
        // including orphaned promoted ideas whose post is gone — offer a
        // one-click clear+regenerate rather than a dead-end message. Ideas still
        // backed by a real post aren't clearable, so those fall through to the
        // "nothing to generate" message.
        const hasClearableIdeas = postIdeas.some(isClearableMonthIdea);
        if (hasClearableIdeas) {
          setGenNeedsClear(true);
        } else {
          errorMsg = "Every slot already has a post — nothing to generate.";
        }
      }
      if (errorMsg) setGenError(errorMsg);
    } finally {
      setGenLoading(false);
    }
  }

  async function handleRejectIdea(ideaId: string) {
    startTransition(async () => {
      try {
        await rejectPostIdeaAction(ideaId);
        setPostIdeas((prev) => prev.filter((i) => i.id !== ideaId));
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not dismiss idea.", "error");
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
      if (!data.ok) { notify(data.error ?? "Failed.", "error"); return; }
      updateDraft(dateKey, platform, { caption: data.value });
    } catch {
      notify("Network error.", "error");
    } finally {
      setCaptionModifying((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  }

  async function handleLoadClientImages(cid: string) {
    if (clientImagesLoading) return;
    if (clientImagesLoaded === cid && clientImages.length > 0) return;
    setClientImagesLoading(true);
    try {
      const res = await fetch(`/api/client-images?clientId=${encodeURIComponent(cid)}`);
      const data = await res.json();
      if (data.ok) {
        setClientImages(data.images);
        setClientImagesLoaded(cid);
      } else {
        setImgScanMsg(`Could not load library: ${data.error ?? "unknown error"}`);
      }
    } finally {
      setClientImagesLoading(false);
    }
  }

  async function handleUploadClientImage(file: File) {
    if (!clientId || imgUploading) return;
    setImgUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("clientId", clientId);
      const res = await fetch("/api/client-images/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        setClientImages((prev) => [data.image, ...prev]);
      } else {
        notify(data.error ?? "Upload failed", "error");
      }
    } catch {
      notify("Network error uploading image.", "error");
    } finally {
      setImgUploading(false);
    }
  }

  async function handleScanWebsite() {
    if (!clientId || imgScanning) return;
    setImgScanning(true);
    setImgScanMsg(null);
    try {
      const res = await fetch("/api/client-images/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.added > 0) {
          setClientImages((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            return [...data.images.filter((i: { id: string }) => !existingIds.has(i.id)), ...prev];
          });
          setImgScanMsg(`Found ${data.added} new image${data.added !== 1 ? "s" : ""}`);
        } else {
          setImgScanMsg("No new images found");
        }
      } else {
        setImgScanMsg(data.error ?? "Scan failed");
      }
    } catch {
      setImgScanMsg("Network error during scan");
    } finally {
      setImgScanning(false);
    }
  }

  async function handlePexelsSearch(q: string) {
    if (!q.trim() || pexelsLoading) return;
    setPexelsLoading(true);
    setPexelsError(null);
    setPexelsPhotos([]);
    try {
      const res = await fetch(`/api/suggest-images?q=${encodeURIComponent(q.trim())}&per_page=12`);
      const data = await res.json();
      if (data.ok) {
        setPexelsPhotos(data.photos ?? []);
        if ((data.photos ?? []).length === 0) setPexelsError("No photos found — try a different search");
      } else {
        setPexelsError(data.error ?? "Search failed");
      }
    } catch {
      setPexelsError("Network error");
    } finally {
      setPexelsLoading(false);
    }
  }

  async function handleDeleteClientImage(imageId: string, table: "site" | "upload") {
    await fetch(`/api/client-images?id=${encodeURIComponent(imageId)}&table=${table}`, { method: "DELETE" });
    setClientImages((prev) => prev.filter((i) => i.id !== imageId));
  }

  // Delete every idea for the month (server + local mirror). Ideas are
  // one-per-day and platform-agnostic, so clear them whatever platform key
  // they're stored under — but never touch a slot that has a saved post.
  // Which of this month's ideas "Clear AI" will actually delete — mirrors the
  // server: any non-promoted idea, plus promoted ideas whose backing post is
  // gone (orphaned). A promoted idea that still has its post is left alone.
  function isClearableMonthIdea(i: PostIdea): boolean {
    if (!i.postSlotDate.startsWith(month)) return false;
    if (i.status !== "promoted") return true;
    return !postsByKey.has(postKey(i.postSlotDate.slice(0, 10), i.platform));
  }

  async function clearMonthIdeasNow() {
    if (!clientId || !month) return;
    await clearPostIdeasAction(clientId, month, genPlatform);
    const ideaSlots = new Set(
      postIdeas
        .filter(isClearableMonthIdea)
        .map((i) => postKey(i.postSlotDate.slice(0, 10), i.platform))
    );
    setPostIdeas((prev) => prev.filter((i) => !isClearableMonthIdea(i)));
    setDrafts((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (ideaSlots.has(key) && !postsByKey.get(key)) {
          delete next[key];
        }
      }
      return next;
    });
  }

  async function handleClearIdeas() {
    if (!clientId || !month) return;
    if (!confirm("Clear all AI ideas for this month? This cannot be undone.")) return;
    setGenNeedsClear(false);
    startTransition(async () => {
      try {
        await clearMonthIdeasNow();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not clear ideas.", "error");
      }
    });
  }

  // One-click recovery when a generate run found every day already taken by
  // leftover ideas: wipe them and immediately regenerate a fresh month. Real
  // posts are never cleared, so this only ever replaces AI ideas.
  async function handleClearAndRegenerate() {
    if (!clientId || !month) return;
    setGenNeedsClear(false);
    setGenError(null);
    try {
      await clearMonthIdeasNow();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not clear ideas.", "error");
      return;
    }
    await handleGenerateIdeas();
  }

  const visibleDays = useMemo(() => {
    let filtered = postFrequency === "every-other-day"
      ? days.filter((_, i) => i % 2 === 0)
      : days;
    // In the current month, collapse elapsed days by default so the board
    // opens on today. "View history" (showPast) reveals them. Past/future
    // months are shown in full — they're history or planning by definition.
    if (isCurrentMonth && !showPast) {
      const todayTime = startOfToday().getTime();
      filtered = filtered.filter((d) => {
        const dd = new Date(d);
        dd.setHours(0, 0, 0, 0);
        return dd.getTime() >= todayTime;
      });
    }
    if (hideEmpty) {
      filtered = filtered.filter((d) => {
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
            (post && post.status !== "none") ||
            (postIdeasByKey.get(key) ?? []).length > 0
          );
        });
      });
    }
    // Onboarding finish: always render the tour's just-saved day, even if the
    // frequency/past/empty filters would drop it, so the finish spotlight can
    // find and scroll to it. (Its date can slip into "past" across a timezone
    // day-rollover, which would otherwise hide it.)
    if (focusDateKey) {
      const already = filtered.some((d) => toDateKey(d) === focusDateKey);
      if (!already) {
        const match = days.find((d) => toDateKey(d) === focusDateKey);
        if (match) {
          filtered = [...filtered, match].sort(
            (a, b) => new Date(a).getTime() - new Date(b).getTime()
          );
        }
      }
    }
    return filtered;
  }, [days, drafts, postsByKey, hideEmpty, postIdeasByKey, postFrequency, isCurrentMonth, showPast, focusDateKey]);

  // ── Mobile: one day per screen ─────────────────────────────────────────────
  // Scrolling past a month of full-size editors is hopeless on a phone, so the
  // narrow layout focuses a single day and pages between them via the date
  // strip, the arrows, or a horizontal swipe.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const visibleKeys = useMemo(
    () => visibleDays.map((d) => toDateKey(d)),
    [visibleDays]
  );

  // Keep the focus on a day that still exists — filters and month changes can
  // pull the focused day out from under us.
  useEffect(() => {
    if (visibleKeys.length === 0) return;
    if (focusedKey && visibleKeys.includes(focusedKey)) return;
    const todayKey = toDateKey(new Date());
    setFocusedKey(
      visibleKeys.includes(todayKey) ? todayKey : visibleKeys[0]
    );
  }, [visibleKeys, focusedKey]);

  const focusedIndex = focusedKey ? visibleKeys.indexOf(focusedKey) : -1;

  const stepDay = useCallback(
    (delta: number) => {
      if (focusedIndex < 0) return;
      const next = focusedIndex + delta;
      if (next < 0 || next >= visibleKeys.length) return;
      setFocusedKey(visibleKeys[next]);
      haptic(8);
    },
    [focusedIndex, visibleKeys]
  );

  // On a phone render only the focused day; desktop keeps the full list.
  const renderedDays = useMemo(() => {
    if (!isNarrow) return visibleDays;
    if (focusedIndex < 0) return visibleDays.slice(0, 1);
    return [visibleDays[focusedIndex]];
  }, [isNarrow, visibleDays, focusedIndex]);

  // Horizontal swipe to page between days. Vertical drags are left alone so the
  // page still scrolls normally.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !isNarrow) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    stepDay(dx < 0 ? 1 : -1);
  };

  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!mounted || scrolledRef.current) return;
    // The onboarding finish points us at the just-saved day; otherwise land on
    // today. The focus day is force-rendered by visibleDays even if it would be
    // filtered out, so #day-<key> is guaranteed to exist here.
    const targetKey = focusDateKey ?? toDateKey(new Date());
    // On mobile the focused day *is* the view — page to it instead of scrolling.
    if (isNarrow) {
      if (focusDateKey && visibleKeys.includes(focusDateKey)) {
        scrolledRef.current = true;
        setFocusedKey(focusDateKey);
      }
      return;
    }
    scrolledRef.current = true;
    const el = document.getElementById(`day-${targetKey}`);
    if (el) {
      el.scrollIntoView({
        behavior: focusDateKey ? "smooth" : "instant",
        block: focusDateKey ? "center" : "start",
      });
    }
  }, [mounted, isNarrow, focusDateKey, visibleKeys]);

  // Remember the view toggles across visits. Load once after mount (so the
  // first client render matches the server and we don't fight hydration),
  // then persist on every change.
  const viewHydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("proofer_view");
      if (raw) {
        const v = JSON.parse(raw);
        if (v.postFrequency === "every-day" || v.postFrequency === "every-other-day") {
          setPostFrequency(v.postFrequency);
        }
        if (typeof v.hideEmpty === "boolean") setHideEmpty(v.hideEmpty);
        if (typeof v.showPast === "boolean") setShowPast(v.showPast);
      }
    } catch {
      // ignore malformed / unavailable storage
    }
    viewHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!viewHydrated.current) return;
    try {
      localStorage.setItem(
        "proofer_view",
        JSON.stringify({ postFrequency, hideEmpty, showPast })
      );
    } catch {
      // ignore storage failures (private mode, quota, …)
    }
  }, [postFrequency, hideEmpty, showPast]);

  // Show the floating "Jump to today" button whenever today's card is off
  // screen (scrolled away in either direction). Only relevant in the current
  // month, where a "today" card exists.
  useEffect(() => {
    if (!isCurrentMonth) {
      setShowJumpToday(false);
      return;
    }
    const todayKey = toDateKey(new Date());
    // On mobile only one day is mounted, so "off screen" means "not focused".
    if (isNarrow) {
      setShowJumpToday(
        Boolean(focusedKey) &&
          focusedKey !== todayKey &&
          visibleKeys.includes(todayKey)
      );
      return;
    }
    const el = document.getElementById(`day-${todayKey}`);
    if (!el) {
      setShowJumpToday(false);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setShowJumpToday(!entry.isIntersecting),
      { root: null, threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isCurrentMonth, visibleDays, showPast, month, isNarrow, focusedKey, visibleKeys]);

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

  // The post-frequency toggle + slot count + "view history" — extracted so it
  // can sit in the desktop header's left column and in the mobile settings
  // sheet without duplication.
  const frequencyBlock = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: isNarrow || standalone ? "wrap" : "nowrap",
        marginBottom: isNarrow ? 14 : 0,
      }}
    >
      <div style={{ display: "flex", borderRadius: 8, border: "1px solid #e4e4e7", overflow: "hidden", background: "#f4f4f5" }}>
        {(["every-other-day", "every-day"] as const).map((freq) => {
          const active = postFrequency === freq;
          return (
            <button
              key={freq}
              type="button"
              onClick={() => setPostFrequency(freq)}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                border: "none",
                background: active ? "#71717a" : "transparent",
                color: active ? "#fff" : "#71717a",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {freq === "every-other-day" ? "Every other day" : "Every day"}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: "#a1a1aa" }}>
        {`${visibleDays.length} ${
          postFrequency === "every-other-day"
            ? visibleDays.length === 1 ? "slot" : "slots"
            : visibleDays.length === 1 ? "day" : "days"
        } ${isCurrentMonth && !showPast ? "from today" : "this month"}`}
      </span>
      {isCurrentMonth && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            background: showPast ? "#eef2ff" : "#fff",
            color: showPast ? "#4338ca" : "#52525b",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showPast ? "Hide past days" : "🕓 View history"}
        </button>
      )}
      {/* On the standalone surface the hide-empty toggle sits here next to the
          frequency controls (the board's Settings card omits it there). */}
      {standalone && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#52525b",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Hide empty days
        </label>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        // Room for the fixed day scrubber, which is hidden when narrow.
        paddingRight: isNarrow ? 0 : 52,
        minWidth: 0,
      }}
    >
      {/* Fixed hover preview — escapes all overflow containers */}
      {hoverPreview && (
        <div style={{
          position: "fixed",
          left: hoverPreview.x,
          top: Math.max(8, hoverPreview.y),
          zIndex: 9999,
          pointerEvents: "none",
          width: 260,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          border: "2px solid rgba(255,255,255,0.25)",
          background: "#000",
        }}>
          {isDriveVideo(hoverPreview.url) ? (
            <div style={{ position: "relative", width: 260, height: 360 }}>
              <img src={driveThumbUrl(hoverPreview.url) ?? ""} alt="" style={{ width: 260, height: 360, objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                <span style={{ fontSize: 52, color: "#fff", lineHeight: 1 }}>▶</span>
              </div>
            </div>
          ) : (
            <img src={hoverPreview.url} alt="" style={{ width: 260, height: 360, objectFit: "cover", display: "block" }} />
          )}
          {hoverPreview.credit && (
            <div style={{ padding: "5px 10px", background: "#18181b", fontSize: 10, color: "#a78bfa" }}>
              © {hoverPreview.credit}
            </div>
          )}
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      {/* The scrubber overlays the board on a phone — the date strip replaces it */}
      {!isNarrow && <DayScrubber days={visibleDays} postsByKey={postsByKey} />}
      {showJumpToday && (
        <button
          type="button"
          onClick={() => {
            const todayKey = toDateKey(new Date());
            if (isNarrow) {
              setFocusedKey(todayKey);
              haptic(8);
              return;
            }
            smoothScrollDayInto(todayKey);
          }}
          style={{
            position: "fixed",
            bottom: isNarrow
              ? "calc(20px + env(safe-area-inset-bottom, 0px))"
              : 24,
            left: isNarrow ? "50%" : "calc(50% - 8px)",
            transform: "translateX(-50%)",
            zIndex: 40,
            padding: isNarrow ? "12px 22px" : "10px 18px",
            borderRadius: 99,
            border: "none",
            background: "#18181b",
            color: "#fff",
            fontSize: isNarrow ? 14 : 13,
            fontWeight: 700,
            boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
            cursor: "pointer",
          }}
        >
          {isNarrow ? "Today" : "↓ Jump to today"}
        </button>
      )}
      {/* Desktop lays the header + legend + frequency on the left and the
          Settings card on the right; on mobile this wrapper is display:contents
          so the existing header/topbar/sheet layout is untouched. */}
      <div
        style={{
          display: isNarrow ? "contents" : "flex",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
          position: "relative",
        }}
      >
        {!isNarrow && (
          <div style={{ flexShrink: 0, width: standalone ? "100%" : 360 }}>
            {/* Standalone drops the duplicate "Proofer" title (the nav brands
                the page) and the legend, and lets the control bar span the row. */}
            {!standalone && (
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
            )}
            {!standalone && (
            <div style={{ display: "flex", marginTop: 10, flexWrap: "wrap", gap: 16 }}>
              {PROOFER_LIGHT_LEGEND.map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "1px solid #e4e4e7",
                      background: item.dot,
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14, color: "#52525b", fontWeight: 600 }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            )}
            <div style={{ marginTop: standalone ? 0 : 18 }}>{frequencyBlock}</div>
          </div>
        )}

        {!isNarrow && (
          <button
            type="button"
            onClick={() => router.push(publishPath)}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #18181b",
              background: "#18181b",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Publish Queue →
          </button>
        )}

      {/* Mobile toolbar: the board settings and the idea generator collapse
          behind these so the composer is reachable without a long scroll. */}
      {isNarrow && clients.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMobileSettingsOpen(true)}
            style={mobileToolbarButtonStyle(false)}
          >
            <span
              style={{
                fontWeight: 700,
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {clients.find((c) => c.id === clientId)?.name ?? "Client"}
            </span>
            {/* Abbreviated ("Aug 2026") so it degrades to something readable
                rather than clipping to "Au…" when the row is tight. */}
            <span
              style={{
                color: "#a1a1aa",
                fontWeight: 600,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {(months.find((m) => m.value === month)?.label ?? month).replace(
                /^([A-Za-z]{3})[a-z]+/,
                "$1"
              )}
            </span>
            <span style={{ color: "#a1a1aa", marginLeft: "auto", flexShrink: 0 }}>⚙</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileIdeasOpen(true)}
            style={mobileToolbarButtonStyle(true)}
          >
            ✦ Ideas
          </button>
          <button
            type="button"
            onClick={() => router.push(publishPath)}
            style={{
              ...mobileToolbarButtonStyle(true),
              border: "1px solid #18181b",
              background: "#18181b",
              color: "#fff",
            }}
          >
            Queue →
          </button>
        </div>
      )}

      {/* Right column on desktop — fills the space beside the header. On
          mobile it's a plain wrapper around the board-settings sheet. */}
      <div style={isNarrow ? undefined : { flex: "1 1 460px", minWidth: 0, paddingRight: 168 }}>
      <BottomSheet
        open={isNarrow ? mobileSettingsOpen : true}
        asSheet={isNarrow}
        title="Board settings"
        onClose={() => setMobileSettingsOpen(false)}
      >
      {/* On desktop the frequency toggle sits in the header's left column;
          on mobile it stays at the top of this sheet. */}
      {isNarrow && frequencyBlock}

      {/* The standalone /proofer surface drops the whole Settings block:
          client & month live in the top nav, hide-empty sits by the frequency
          toggle, and pillars are managed on /app/proofer. */}
      {!standalone && (
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
            {/* On the standalone /proofer surface the Client and Month controls
                live in the top nav, so the board omits its own copies. */}
            {!standalone && (
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
            )}

            {!standalone && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Month</span>
                {/* One-click prev/next month nav — a single tap either way, no
                    dropdown to open. Steps to any month (history or planning). */}
                <div style={monthNavStyle}>
                  <button
                    type="button"
                    onClick={() => handleSelectMonth(shiftMonthValue(month, -1))}
                    disabled={isPending}
                    aria-label="Previous month"
                    style={monthNavBtnStyle}
                  >
                    ‹
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
                    {formatMonthValueLabel(month)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectMonth(shiftMonthValue(month, 1))}
                    disabled={isPending}
                    aria-label="Next month"
                    style={monthNavBtnStyle}
                  >
                    ›
                  </button>
                </div>
              </label>
            )}

            {/* Standalone shows this next to the frequency controls instead. */}
            {!standalone && (
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
            )}

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
      )}
      </BottomSheet>
      </div>{/* right column */}
      </div>{/* desktop header/settings row wrapper */}

      {/* ── Generate Month Ideas panel ──────────────────────────────────── */}
      {clients.length > 0 && (
        <BottomSheet
          open={isNarrow ? mobileIdeasOpen : true}
          asSheet={isNarrow}
          title="Generate ideas"
          onClose={() => setMobileIdeasOpen(false)}
        >
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

          {genNeedsClear && (
            <>
              <span style={{ fontSize: 12, color: "#92400e", flexShrink: 0 }}>
                Every day already has an AI idea.
              </span>
              <button
                type="button"
                onClick={handleClearAndRegenerate}
                disabled={genLoading || isPending}
                style={{
                  padding: "7px 14px",
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
                {genLoading ? "Regenerating..." : "Clear & regenerate"}
              </button>
            </>
          )}

          {postIdeas.filter((i) => i.postSlotDate.startsWith(month)).length > 0 && (
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

        {standalone ? (
          // Redesign: tuck the "AI uses…" detail into a hover tooltip instead
          // of a full line of helper text.
          <div style={{ fontSize: 11, color: "#94a3b8", paddingLeft: 4 }}>
            <span
              title={`AI uses: consultation answers · ${
                initialPillars.length > 0
                  ? `${initialPillars.length} content pillar${initialPillars.length !== 1 ? "s" : ""}`
                  : "no content pillars"
              } · existing posts this month`}
              style={{ cursor: "help", borderBottom: "1px dotted #cbd5e1" }}
            >
              ⓘ What the AI uses
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6, paddingLeft: 4 }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>AI uses: </span>
            consultation answers
            {" · "}
            {initialPillars.length > 0
              ? `${initialPillars.length} content pillar${initialPillars.length !== 1 ? "s" : ""}`
              : "no content pillars"}
            {" · existing posts this month"}
            {genPrompt.trim()
              ? ` · "${genPrompt.trim().slice(0, 50)}${genPrompt.trim().length > 50 ? "…" : ""}"`
              : " · no direction prompt"}
          </div>
        )}
        </BottomSheet>
      )}

      {clients.length === 0 ? (
        standalone ? (
          <SectionCard title="👋 Let's create your first post">
            {/* Kept in step with the standalone board's empty state
                (app/proofer/page.tsx): this card doubles as the tour's welcome,
                and ?start=1 below skips onboarding's own welcome step. */}
            <div style={{ fontSize: 17, color: "#3f3f46", lineHeight: 1.6, marginBottom: 18, maxWidth: 640 }}>
              You don&apos;t have an account yet. We&apos;ll show you how Proofer works by
              making one together — it connects a social account and walks you through
              your first post. It takes about 2 minutes, and you stay in control the
              whole way.
            </div>
            <a
              href={`${basePath.replace(/\/$/, "")}/onboarding?start=1`}
              style={{
                display: "inline-block",
                background: "#6d28d9",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 12,
                padding: "13px 24px",
                textDecoration: "none",
              }}
            >
              Let&apos;s go →
            </a>
          </SectionCard>
        ) : (
          <SectionCard title="No clients">
            <div style={{ fontSize: 13, color: "#71717a" }}>
              Add a client first on the Clients page.
            </div>
          </SectionCard>
        )
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
          onTouchStart={isNarrow ? onTouchStart : undefined}
          onTouchEnd={isNarrow ? onTouchEnd : undefined}
        >
          {isNarrow && visibleDays.length > 0 && focusedKey && (
            <MobileDateStrip
              days={visibleDays}
              postsByKey={postsByKey}
              focusedKey={focusedKey}
              onFocus={(k) => {
                setFocusedKey(k);
                haptic(8);
              }}
            />
          )}

          {visibleDays.length === 0 && (
            <SectionCard title="Nothing to show">
              <div style={{ fontSize: 13, color: "#71717a" }}>
                All days are empty. Uncheck <strong>Hide empty days</strong> to
                start drafting.
              </div>
            </SectionCard>
          )}

          {renderedDays.map((d) => {
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
              optimisticStatus[key] ??
              (post?.status && post.status !== "none" ? post.status : "none");

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
              {staleKeys.has(key) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    padding: "8px 12px",
                    marginBottom: 8,
                    borderRadius: 10,
                    border: "1px solid #fde68a",
                    background: "#fffbeb",
                    fontSize: 12,
                    color: "#92400e",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    🔄 {post?.updatedBy ? post.updatedBy.split("@")[0] : "Someone"} saved a newer version while you were editing.
                  </span>
                  <button
                    type="button"
                    onClick={() => loadRemoteUpdate(key)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "none",
                      background: "#92400e",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Load their version
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissStale(key)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "1px solid #fcd34d",
                      background: "#fff",
                      color: "#92400e",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Keep mine
                  </button>
                </div>
              )}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: slotIdeas.length > 0 ? "12px 12px 0 0" : 12,
                  padding: isNarrow ? 12 : 16,
                  display: "grid",
                  gridTemplateColumns: isNarrow
                    ? "minmax(0, 1fr)"
                    : "200px minmax(0, 1fr)",
                  gap: isNarrow ? 12 : 16,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={
                    isNarrow
                      ? // Dissolve the column so the date header, the composer
                        // and the settings can be ordered independently.
                        { display: "contents" }
                      : { minWidth: 0 }
                  }
                >
                  {isNarrow ? (
                    // One header line with paging arrows: the day is the whole
                    // screen here, so it needs to read as a title bar.
                    <div
                      style={{
                        order: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => stepDay(-1)}
                        disabled={focusedIndex <= 0}
                        aria-label="Previous day"
                        style={dayArrowStyle(focusedIndex <= 0)}
                      >
                        ‹
                      </button>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: "#18181b",
                            lineHeight: 1.2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.toLocaleDateString(undefined, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </div>
                        {mounted && relativeDayLabel(d) && (
                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                              color:
                                relativeDayLabel(d) === "Today" ? "#166534" : "#a1a1aa",
                            }}
                          >
                            {relativeDayLabel(d)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => stepDay(1)}
                        disabled={focusedIndex < 0 || focusedIndex >= visibleKeys.length - 1}
                        aria-label="Next day"
                        style={dayArrowStyle(
                          focusedIndex < 0 || focusedIndex >= visibleKeys.length - 1
                        )}
                      >
                        ›
                      </button>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        if (!mounted) return null;
                        const rel = relativeDayLabel(d);
                        if (!rel) return null;
                        const isToday = rel === "Today";
                        return (
                          <div
                            style={{
                              display: "inline-block",
                              marginBottom: 5,
                              padding: "1px 8px",
                              borderRadius: 99,
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: 0.3,
                              textTransform: "uppercase",
                              background: isToday ? "#dcfce7" : "#f4f4f5",
                              color: isToday ? "#166534" : "#a1a1aa",
                            }}
                          >
                            {rel}
                          </div>
                        );
                      })()}
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
                    </>
                  )}

                  {isNarrow ? (
                    // On a phone these five facts each used to claim their own
                    // line — and because the column is dissolved into the card
                    // grid, each one also cost a 12px grid gap. One wrapped row
                    // says the same thing in a single line.
                    (() => {
                      const meta: React.ReactNode[] = [];
                      // Created / edited / approved-by attribution moved to the
                      // footer above the Pillar (rendered for every viewport), so
                      // it's no longer duplicated in this compact meta row.
                      if (hasDraft && !isLocked) {
                        meta.push(
                          <span key="unsaved" style={{ color: "#b45309", fontWeight: 700 }}>
                            Unsaved changes
                          </span>
                        );
                      }
                      if (isLocked) {
                        const when = scheduledLabel(
                          post?.publishQueue,
                          draft.publishTime,
                          dateKey,
                          timeZone
                        );
                        meta.push(
                          <span key="locked" style={{ color: "#075985", fontWeight: 700 }}>
                            🔒{when ? ` ${when}` : ""}
                          </span>
                        );
                      }
                      if (meta.length === 0) return null;
                      return (
                        <div
                          style={{
                            order: 1,
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "2px 10px",
                            marginTop: -4,
                            fontSize: 12,
                            lineHeight: 1.3,
                          }}
                        >
                          {meta.map((node, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span style={{ color: "#d4d4d8" }}>·</span>}
                              {node}
                            </React.Fragment>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      {/* Created / Edited / Approved-by attribution now lives in
                          a footer block just above the Pillar (see below). */}
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
                          {/* "Approved and locked" text removed — approval is
                              shown by the padlock next to the approver's name in
                              the footer; "locked" is redundant beside it. */}
                          {/* Surface the scheduled time here ONLY when there's no
                              editable time + Reschedule row below (i.e. nothing is
                              queued yet) — otherwise the time would show twice.
                              The row below shows the same time and lets you edit
                              it. Prefers the queue's scheduled_for. */}
                          {!(post && (post.publishQueue?.length ?? 0) > 0) &&
                          (() => {
                            const when = scheduledLabel(
                              post?.publishQueue,
                              draft.publishTime,
                              dateKey,
                              timeZone
                            );
                            return when ? (
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#0369a1",
                                }}
                              >
                                Scheduled for {when}
                              </div>
                            ) : null;
                          })()}
                          {/* Reschedule from the proofer: sets the queue's
                              scheduled_for to THIS post's date (dateKey) at the
                              chosen time — entered in the agency display zone,
                              across every platform it's queued to — so the send
                              day always matches the slot. */}
                          {post && (post.publishQueue?.length ?? 0) > 0 &&
                            ((p: ProoferPost) => {
                              const seed = scheduledSeedHHMM(
                                p.publishQueue,
                                draft.publishTime,
                                dateKey,
                                timeZone
                              );
                              const val = rescheduleTimes[p.id] ?? seed;
                              const zoneAbbr = zoneAbbrev(
                                timeZone,
                                new Date(`${dateKey}T12:00:00Z`)
                              );
                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <input
                                    type="time"
                                    value={val}
                                    disabled={isPending}
                                    onChange={(e) =>
                                      setRescheduleTimes((prev) => ({
                                        ...prev,
                                        [p.id]: e.target.value,
                                      }))
                                    }
                                    aria-label={`New publish time (${zoneAbbr})`}
                                    style={{
                                      padding: "5px 8px",
                                      borderRadius: 8,
                                      border: "1px solid #e4e4e7",
                                      fontSize: 12,
                                      color: "#18181b",
                                      background: "#fff",
                                      fontFamily: "inherit",
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "#71717a",
                                    }}
                                  >
                                    {zoneAbbr}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleProoferReschedule(dateKey, p, val)
                                    }
                                    disabled={isPending}
                                    style={{
                                      // Light "white box" matching the Instagram /
                                      // Facebook toggles, and the same width so the
                                      // buttons form a tidy aligned column.
                                      width: PLAT_TOGGLE_WIDTH,
                                      textAlign: "center",
                                      padding: "9px 13px",
                                      borderRadius: 10,
                                      border: "1px solid #d4d4d8",
                                      background: "#fff",
                                      color: "#52525b",
                                      fontSize: 13,
                                      fontWeight: 700,
                                      cursor: isPending ? "wait" : "pointer",
                                      opacity:
                                        reschedulingId === p.id
                                          ? 0.7
                                          : isPending
                                          ? 0.5
                                          : 1,
                                    }}
                                  >
                                    {reschedulingId === p.id
                                      ? "Rescheduling…"
                                      : "Reschedule"}
                                  </button>
                                </div>
                              );
                            })(post)}
                        </div>
                      )}
                    </>
                  )}

                  <div
                    style={{
                      marginTop: 12,
                      // Platform and Pillar sit side by side on a phone so the
                      // caption is not pushed a screenful down the page.
                      display: isNarrow ? "grid" : "flex",
                      gridTemplateColumns: isNarrow
                        ? "minmax(0, 1fr) minmax(0, 1fr)"
                        : undefined,
                      flexDirection: "column",
                      gap: 8,
                      order: isNarrow ? 3 : undefined,
                    }}
                  >
                    {standalone ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          alignItems: "flex-start",
                          gridColumn: isNarrow ? "1 / -1" : undefined,
                        }}
                      >
                        {/* Instagram + its format stay on one row (format on the
                            right of the toggle, never wrapping beneath it). */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap" }}>
                        {/* Instagram: one-click on/off */}
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => {
                            const on = draft.publishTargets.includes("instagram");
                            updateDraft(dateKey, activePlatform, {
                              publishTargets: on
                                ? draft.publishTargets.filter((t) => t !== "instagram")
                                : [...draft.publishTargets, "instagram"],
                            });
                          }}
                          style={platToggleStyle(
                            draft.publishTargets.includes("instagram"),
                            "ig",
                            isLocked
                          )}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 17,
                              height: 17,
                              borderRadius: 5,
                              display: "grid",
                              placeItems: "center",
                              fontSize: 10,
                              fontWeight: 800,
                              color: "#fff",
                              background: "linear-gradient(45deg,#f58529,#dd2a7b,#8134af)",
                            }}
                          >
                            ◎
                          </span>
                          Instagram
                        </button>
                        {/* Format picker — only while Instagram is on. A fixed
                            trigger showing the chosen format opens an absolutely
                            positioned menu, so nothing in the row shifts. Works
                            the same on desktop (click) and touch (tap). */}
                        {draft.publishTargets.includes("instagram") && (
                          <div style={{ position: "relative", display: "inline-flex" }}>
                            <button
                              type="button"
                              disabled={isLocked}
                              aria-haspopup="menu"
                              aria-expanded={openFmtKey === key}
                              onClick={() =>
                                setOpenFmtKey(openFmtKey === key ? null : key)
                              }
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                border: "1px solid #e4e4e7",
                                borderRadius: 9,
                                background: "#fff",
                                color: "#3f3f46",
                                fontSize: 12,
                                fontWeight: 700,
                                padding: "8px 12px",
                                cursor: isLocked ? "not-allowed" : "pointer",
                              }}
                            >
                              {PROOFER_PLATFORM_LABELS[activePlatform].replace("IG ", "")}
                              <span style={{ color: "#a1a1aa", fontSize: 10 }}>▾</span>
                            </button>
                            {openFmtKey === key && !isLocked && (
                              <>
                                {/* click-away catcher */}
                                <div
                                  aria-hidden
                                  onClick={() => setOpenFmtKey(null)}
                                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                                />
                                <div
                                  role="menu"
                                  style={{
                                    position: "absolute",
                                    top: "calc(100% + 4px)",
                                    left: 0,
                                    zIndex: 41,
                                    background: "#fff",
                                    border: "1px solid #e4e4e7",
                                    borderRadius: 10,
                                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                    overflow: "hidden",
                                    minWidth: 132,
                                  }}
                                >
                                  {INSTAGRAM_FORMATS.map((p) => {
                                    const active = activePlatform === p;
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          if (p !== activePlatform)
                                            handlePlatformChange(dateKey, p);
                                          setOpenFmtKey(null);
                                        }}
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: active ? "#f4f4f5" : "#fff",
                                          color: "#18181b",
                                          fontSize: 13,
                                          fontWeight: active ? 700 : 500,
                                          padding: "10px 14px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        {PROOFER_PLATFORM_LABELS[p].replace("IG ", "")}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        </div>
                        {/* Facebook + its format stay on one row too. */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap" }}>
                        {/* Facebook: one-click on/off (the "send to Facebook") */}
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => {
                            const on = draft.publishTargets.includes("facebook");
                            const without = draft.publishTargets.filter(
                              (t) => t !== "facebook"
                            );
                            updateDraft(dateKey, activePlatform, {
                              publishTargets: on ? without : [...without, "facebook"],
                            });
                          }}
                          style={platToggleStyle(
                            draft.publishTargets.includes("facebook"),
                            "fb",
                            isLocked
                          )}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 17,
                              height: 17,
                              borderRadius: 5,
                              display: "grid",
                              placeItems: "center",
                              fontSize: 10,
                              fontWeight: 800,
                              color: "#fff",
                              background: "#1877f2",
                            }}
                          >
                            f
                          </span>
                          Facebook
                        </button>
                        {/* Facebook only ever posts to the feed, but show a
                            matching "Feed" chip beside it so both platform rows
                            line up with Instagram's format picker. Static (no
                            menu) since there are no other Facebook formats. */}
                        {draft.publishTargets.includes("facebook") && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              border: "1px solid #e4e4e7",
                              borderRadius: 9,
                              background: "#fff",
                              color: "#3f3f46",
                              fontSize: 12,
                              fontWeight: 700,
                              padding: "8px 12px",
                            }}
                          >
                            Feed
                          </span>
                        )}
                        </div>
                      </div>
                    ) : (
                      <>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        minWidth: 0,
                      }}
                    >
                      <span style={labelStyle}>Instagram</span>
                      <select
                        value={
                          draft.publishTargets.includes("instagram")
                            ? activePlatform
                            : "off"
                        }
                        disabled={isLocked}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "off") {
                            // Stay on this draft, just stop sending it to IG.
                            updateDraft(dateKey, activePlatform, {
                              publishTargets: draft.publishTargets.filter(
                                (t) => t !== "instagram"
                              ),
                            });
                            return;
                          }
                          const nextFormat = value as ProoferPlatform;
                          if (nextFormat !== activePlatform) {
                            handlePlatformChange(dateKey, nextFormat);
                          }
                          // Picking a format implies publishing to Instagram.
                          if (!getDraftFor(dateKey, nextFormat).publishTargets.includes("instagram")) {
                            updateDraft(dateKey, nextFormat, {
                              publishTargets: [
                                ...getDraftFor(dateKey, nextFormat).publishTargets,
                                "instagram",
                              ],
                            });
                          }
                        }}
                        style={selectStyle(isNarrow, isLocked)}
                      >
                        <option value="off">Off</option>
                        {INSTAGRAM_FORMATS.map((p) => (
                          <option key={p} value={p}>
                            {/* The field label already says Instagram. */}
                            {PROOFER_PLATFORM_LABELS[p].replace("IG ", "")}
                            {variants.has(p) ? " •" : ""}
                          </option>
                        ))}
                        {/* Pre-split drafts that live on the old
                            platform='facebook' row stay reachable rather than
                            being orphaned by the new model. */}
                        {variants.has("facebook") && (
                          <option value="facebook">Legacy FB draft •</option>
                        )}
                      </select>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        minWidth: 0,
                      }}
                    >
                      <span style={labelStyle}>Facebook</span>
                      <select
                        value={
                          draft.publishTargets.includes("facebook") ? "on" : "off"
                        }
                        disabled={isLocked}
                        onChange={(e) => {
                          const on = e.target.value === "on";
                          const without = draft.publishTargets.filter(
                            (t) => t !== "facebook"
                          );
                          updateDraft(dateKey, activePlatform, {
                            publishTargets: on
                              ? [...without, "facebook"]
                              : without,
                          });
                        }}
                        style={selectStyle(isNarrow, isLocked)}
                      >
                        <option value="off">Off</option>
                        <option value="on">On</option>
                      </select>
                    </div>
                      </>
                    )}

                    {/* Attribution footer — who created / edited / approved this
                        post. Sits just above the Pillar, across the full width. */}
                    {(() => {
                      const rows: React.ReactNode[] = [];
                      if (post?.createdBy) {
                        rows.push(
                          <div key="c" style={{ fontSize: 11, color: "#71717a" }}>
                            Created by{" "}
                            <strong style={{ color: "#52525b" }}>
                              {post.createdBy.split("@")[0]}
                            </strong>
                          </div>
                        );
                      }
                      if (post?.updatedBy && post.updatedBy !== post.createdBy) {
                        rows.push(
                          <div key="e" style={{ fontSize: 11, color: "#71717a" }}>
                            Edited by{" "}
                            <strong style={{ color: "#52525b" }}>
                              {post.updatedBy.split("@")[0]}
                            </strong>
                          </div>
                        );
                      }
                      if (post?.status === "approved" && post.updatedBy) {
                        rows.push(
                          <div key="a" style={{ fontSize: 11, color: "#71717a" }}>
                            Approved by{" "}
                            <strong style={{ color: "#15803d" }}>
                              {post.updatedBy.split("@")[0]}
                            </strong>{" "}
                            {/* Padlock = the post is locked (frozen from edits).
                                Approval implies locked, so this replaces the old
                                "Approved and locked" line. */}
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#71717a"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              role="img"
                              aria-label="Locked"
                              style={{ verticalAlign: "-2px" }}
                            >
                              <title>Locked — approved posts can&apos;t be edited</title>
                              <rect x="4" y="11" width="16" height="10" rx="2" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                          </div>
                        );
                      }
                      if (rows.length === 0) return null;
                      return (
                        <div
                          style={{
                            gridColumn: isNarrow ? "1 / -1" : undefined,
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: "1px solid #f4f4f5",
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                          }}
                        >
                          {rows}
                        </div>
                      );
                    })()}

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
                            minWidth: 0,
                            // Instagram + Facebook fill the first row, so the
                            // pillar takes the full width beneath them.
                            gridColumn: isNarrow ? "1 / -1" : undefined,
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
                              padding: isNarrow ? "10px 8px" : "6px 8px",
                              fontSize: isNarrow ? 14 : 12,
                              fontWeight: 600,
                              width: "100%",
                              minWidth: 0,
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
                          {/* A dropdown pinned to a half-width control is
                              unusable on a phone — promote it to a sheet. */}
                          <BottomSheet
                            open={isOpen}
                            asSheet={isNarrow}
                            title="Content pillar"
                            onClose={() => setOpenPillarPickerKey(null)}
                          >
                            <>
                              {!isNarrow && (
                                <div
                                  onClick={() => setOpenPillarPickerKey(null)}
                                  style={{
                                    position: "fixed",
                                    inset: 0,
                                    zIndex: 20,
                                  }}
                                />
                              )}
                              <div
                                style={
                                  isNarrow
                                    ? { display: "flex", flexDirection: "column", gap: 2 }
                                    : {
                                        position: "absolute",
                                        top: "100%",
                                        left: 0,
                                        right: 0,
                                        marginTop: 4,
                                        background: "#fff",
                                        border: "1px solid #e4e4e7",
                                        borderRadius: 8,
                                        boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
                                        zIndex: 21,
                                        maxHeight: 220,
                                        overflowY: "auto",
                                        padding: 4,
                                      }
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateDraft(dateKey, activePlatform, {
                                      pillarId: null,
                                    });
                                    handlePillarPropagation(
                                      dateKey,
                                      activePlatform,
                                      null
                                    );
                                    setOpenPillarPickerKey(null);
                                  }}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: isNarrow ? "13px 12px" : "6px 8px",
                                    border: "none",
                                    background:
                                      draft.pillarId === null
                                        ? "#f4f4f5"
                                        : "transparent",
                                    borderRadius: isNarrow ? 10 : 6,
                                    cursor: "pointer",
                                    fontSize: isNarrow ? 15 : 12,
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
                                        handlePillarPropagation(
                                          dateKey,
                                          activePlatform,
                                          pillar.id
                                        );
                                        setOpenPillarPickerKey(null);
                                      }}
                                      title={pillar.description || pillar.name}
                                      style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: isNarrow ? "13px 12px" : "6px 8px",
                                        border: "none",
                                        background: isSelected
                                          ? "#f4f4f5"
                                          : "transparent",
                                        borderRadius: isNarrow ? 10 : 6,
                                        cursor: "pointer",
                                        fontSize: isNarrow ? 15 : 12,
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
                          </BottomSheet>
                        </div>
                      );
                    })()}

                  </div>

                  {!isLocked && (() => {
                    const slotKey = postKey(dateKey, activePlatform);
                    const libOpen = imgLibraryPostKey === slotKey;
                    const stockOpen = pexelsPostKey === slotKey;
                    const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
                    const slotIdeas = postIdeasByKey.get(slotKey) ?? [];
                    const pillarName = draft.pillarId ? (pillarsById.get(draft.pillarId)?.name ?? "") : "";
                    const captionLines = draft.caption.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" ");
                    const autoQuery = [pillarName || clientName, captionLines || (slotIdeas[0]?.title ?? "")].filter(Boolean).join(" ").slice(0, 80);
                    return (
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        order: isNarrow ? 4 : undefined,
                      }}
                    >

                      {/* Single row of media buttons */}
                      <div
                        className={isNarrow ? "mobile-strip" : undefined}
                        style={{
                          display: "flex",
                          gap: isNarrow ? 8 : 6,
                          flexWrap: isNarrow ? "nowrap" : "wrap",
                          alignItems: "center",
                          paddingBottom: isNarrow ? 2 : 0,
                        }}
                      >
                        <ImageUpload
                          bucket="postimages"
                          folder={`proofer/${clientId}/${month}`}
                          onUploaded={(url) => addMediaUrl(dateKey, activePlatform, url)}
                          label="🖼️ Image"
                          accept="image/*"
                        />
                        <ImageUpload
                          bucket="postimages"
                          folder={`proofer/${clientId}/${month}`}
                          onUploaded={(url) => addMediaUrl(dateKey, activePlatform, url)}
                          label="🎬"
                          accept="video/*"
                        />
                        <PasteLinkInput
                          onSubmit={(url) => addMediaUrl(dateKey, activePlatform, url)}
                        />
                        {clientId && (
                          <button
                            type="button"
                            onClick={() => {
                              if (libOpen) {
                                setImgLibraryPostKey(null);
                              } else {
                                setImgLibraryPostKey(slotKey);
                                setPexelsPostKey(null);
                                if (clientImagesLoaded !== clientId || clientImages.length === 0) handleLoadClientImages(clientId);
                              }
                            }}
                            style={{
                              flexShrink: 0,
                              padding: isNarrow ? "9px 14px" : "5px 12px", borderRadius: isNarrow ? 10 : 7,
                              border: `1px solid ${libOpen ? "#0369a1" : "#bae6fd"}`,
                              background: libOpen ? "#0369a1" : "#e0f2fe",
                              color: libOpen ? "#fff" : "#0369a1",
                              fontSize: isNarrow ? 13 : 12, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            {libOpen ? "Close library" : "📁 Library"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (stockOpen) {
                              setPexelsPostKey(null);
                            } else {
                              setPexelsPostKey(slotKey);
                              setImgLibraryPostKey(null);
                              const q = autoQuery || clientName;
                              setPexelsQuery(q);
                              handlePexelsSearch(q);
                            }
                          }}
                          style={{
                            flexShrink: 0,
                            padding: isNarrow ? "9px 14px" : "5px 12px", borderRadius: isNarrow ? 10 : 7,
                            border: "1px solid #e9d5ff",
                            background: stockOpen ? "#ede9fe" : "#faf5ff",
                            color: "#6d28d9", fontSize: isNarrow ? 13 : 11, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          {stockOpen ? "Close stock" : "📷 Stock"}
                        </button>
                      </div>

                      {/* Library panel — a bottom sheet on a phone, where an
                          inline panel would shove the composer off screen */}
                      {clientId && (
                        <BottomSheet
                          open={libOpen}
                          asSheet={isNarrow}
                          title="Client photos"
                          onClose={() => setImgLibraryPostKey(null)}
                        >
                        <div style={isNarrow ? undefined : { border: "1px solid #bae6fd", borderRadius: 10, background: "#f8faff", padding: "10px 12px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", flexShrink: 0 }}>Client photos</span>
                            <label style={{
                              padding: "3px 10px", borderRadius: 6,
                              border: "1px solid #bae6fd", background: "#e0f2fe",
                              color: "#0369a1", fontSize: 11, fontWeight: 600,
                              cursor: imgUploading ? "wait" : "pointer", flexShrink: 0,
                            }}>
                              {imgUploading ? "Uploading…" : "+ Photos"}
                              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: "none" }}
                                onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => handleUploadClientImage(f)); e.target.value = ""; }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => { setImgScanMsg(null); handleScanWebsite(); }}
                              disabled={imgScanning}
                              title="Scan website for new photos"
                              style={{
                                padding: clientImages.length > 0 ? "3px 7px" : "3px 10px",
                                borderRadius: 6, border: "1px solid #d1fae5", background: "#ecfdf5",
                                color: "#065f46", fontSize: clientImages.length > 0 ? 14 : 11,
                                fontWeight: 600, cursor: imgScanning ? "wait" : "pointer", flexShrink: 0,
                              }}
                            >
                              {imgScanning ? "…" : clientImages.length > 0 ? "🔍" : "Scan website"}
                            </button>
                            {imgScanMsg && (
                              <span style={{ fontSize: 11, color: imgScanMsg.includes("failed") || imgScanMsg.includes("No website") || imgScanMsg.includes("error") ? "#991b1b" : "#065f46" }}>
                                {imgScanMsg}
                              </span>
                            )}
                            {clientImagesLoading && <span style={{ fontSize: 11, color: "#94a3b8" }}>Loading…</span>}
                          </div>

                          {clientImages.length === 0 && !clientImagesLoading ? (
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>
                              No photos yet — upload some or click "Scan website".
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {clientImages.map((img) => {
                                const useImage = () => {
                                  addMediaUrl(dateKey, activePlatform, img.publicUrl);
                                  setImgLibraryPostKey(null);
                                  setHoverPreview(null);
                                  setTimeout(() => document.getElementById(`day-${dateKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                                };
                                const cellW = isNarrow ? 150 : 100;
                                const cellH = isNarrow ? 106 : 70;
                                return (
                                <div key={img.id} style={{ position: "relative", flexShrink: 0 }}
                                  // Skip the cut-off hover preview on touch; tapping selects instead.
                                  onMouseEnter={isNarrow ? undefined : (e) => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setHoverPreview({ url: img.publicUrl, x: r.right + 12, y: Math.max(8, Math.min(r.top, window.innerHeight - 400)) });
                                  }}
                                  onMouseLeave={isNarrow ? undefined : () => setHoverPreview(null)}
                                >
                                  {isDriveVideo(img.publicUrl) ? (
                                    <div onClick={useImage} title="Click to use this video" style={{ position: "relative", width: cellW, height: cellH, flexShrink: 0, cursor: "pointer" }}>
                                      <img
                                        src={driveThumbUrl(img.publicUrl) ?? ""}
                                        alt=""
                                        style={{ width: cellW, height: cellH, objectFit: "cover", borderRadius: 6, display: "block", border: "2px solid #e0f2fe" }}
                                      />
                                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(0,0,0,0.28)" }}>
                                        <span style={{ fontSize: 18, color: "#fff", lineHeight: 1 }}>▶</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <img
                                      src={img.publicUrl}
                                      alt=""
                                      title="Click to use this photo"
                                      onClick={useImage}
                                      style={{ width: cellW, height: cellH, objectFit: "cover", borderRadius: 6, display: "block", border: "2px solid #e0f2fe", cursor: "pointer" }}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={useImage}
                                    style={{
                                      position: "absolute", bottom: isNarrow ? 6 : 4, right: isNarrow ? 6 : 4,
                                      padding: isNarrow ? "6px 14px" : "2px 6px", borderRadius: isNarrow ? 8 : 4, border: "none",
                                      background: "rgba(0,0,0,0.72)", color: "#fff",
                                      fontSize: isNarrow ? 13 : 10, fontWeight: 700, cursor: "pointer",
                                    }}
                                  >
                                    Use
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClientImage(img.id, img.table)}
                                    style={{
                                      position: "absolute", top: 4, right: 4,
                                      width: 18, height: 18, borderRadius: "50%",
                                      border: "none", background: "rgba(0,0,0,0.55)",
                                      color: "#fff", fontSize: 11, lineHeight: "18px",
                                      textAlign: "center", cursor: "pointer", padding: 0,
                                    }}
                                    title="Remove from library"
                                  >
                                    ×
                                  </button>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        </BottomSheet>
                      )}

                      {/* Pexels stock panel */}
                      <BottomSheet
                        open={stockOpen}
                        asSheet={isNarrow}
                        title="Stock photos"
                        onClose={() => setPexelsPostKey(null)}
                      >
                        <div style={isNarrow ? undefined : { border: "1px solid #e9d5ff", borderRadius: 10, background: "#faf5ff", padding: "10px 12px 12px" }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
                            <input
                              type="text"
                              value={pexelsQuery}
                              onChange={(e) => setPexelsQuery(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handlePexelsSearch(pexelsQuery); }}
                              placeholder="Search Pexels…"
                              style={{
                                flex: 1, padding: "4px 8px", borderRadius: 6,
                                border: "1px solid #d8b4fe", fontSize: 11,
                                outline: "none", minWidth: 0,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handlePexelsSearch(pexelsQuery)}
                              disabled={pexelsLoading}
                              style={{
                                padding: "4px 10px", borderRadius: 6, border: "none",
                                background: "#7c3aed", color: "#fff",
                                fontSize: 11, fontWeight: 600, cursor: pexelsLoading ? "wait" : "pointer", flexShrink: 0,
                              }}
                            >
                              {pexelsLoading ? "…" : "Search"}
                            </button>
                          </div>

                          {pexelsError && (
                            <div style={{ fontSize: 11, color: "#991b1b", marginBottom: 8 }}>{pexelsError}</div>
                          )}

                          {pexelsPhotos.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: isNarrow ? 8 : 6 }}>
                              {pexelsPhotos.map((photo) => {
                                const selectPhoto = () => {
                                  addMediaUrl(dateKey, activePlatform, photo.full);
                                  setPexelsPostKey(null);
                                  setHoverPreview(null);
                                  setTimeout(() => document.getElementById(`day-${dateKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                                };
                                return (
                                <div key={photo.id} style={{ position: "relative", flexShrink: 0 }}
                                  // Hover-preview is a desktop affordance; on touch it just pops a
                                  // cut-off overlay you can't act on, so skip it and let the tap select.
                                  onMouseEnter={isNarrow ? undefined : (e) => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setHoverPreview({ url: photo.full, credit: photo.photographer, x: r.right + 12, y: Math.max(8, Math.min(r.top, window.innerHeight - 400)) });
                                  }}
                                  onMouseLeave={isNarrow ? undefined : () => setHoverPreview(null)}
                                >
                                  <img
                                    src={photo.thumb}
                                    alt={photo.photographer}
                                    title="Click to use this photo"
                                    // The whole photo is the click/tap target on every device — the
                                    // "Use" button is just an extra affordance. (Previously desktop
                                    // clicks did nothing, so the photo felt unselectable.)
                                    onClick={selectPhoto}
                                    style={{ width: isNarrow ? 150 : 100, height: isNarrow ? 106 : 70, objectFit: "cover", borderRadius: 6, display: "block", border: "2px solid #e9d5ff", cursor: "pointer" }}
                                  />
                                  <button
                                    type="button"
                                    onClick={selectPhoto}
                                    style={{
                                      position: "absolute", bottom: isNarrow ? 6 : 4, right: isNarrow ? 6 : 4,
                                      padding: isNarrow ? "6px 14px" : "2px 6px", borderRadius: isNarrow ? 8 : 4, border: "none",
                                      background: "rgba(0,0,0,0.72)", color: "#fff",
                                      fontSize: isNarrow ? 13 : 10, fontWeight: 700, cursor: "pointer",
                                    }}
                                  >
                                    Use
                                  </button>
                                  <div style={{
                                    position: "absolute", bottom: isNarrow ? 6 : 4, left: isNarrow ? 6 : 4,
                                    fontSize: 9, color: "rgba(255,255,255,0.85)",
                                    background: "rgba(0,0,0,0.45)", borderRadius: 3, padding: "1px 3px",
                                    maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {photo.photographer}
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          )}

                          {!pexelsLoading && pexelsPhotos.length === 0 && !pexelsError && (
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>Type a search term above</div>
                          )}

                          <div style={{ fontSize: 9, color: "#a78bfa", marginTop: 8 }}>
                            Photos from Pexels · free to use
                          </div>
                        </div>
                      </BottomSheet>

                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <input
                          type="time"
                          value={draft.publishTime}
                          onChange={(e) => updateDraft(dateKey, activePlatform, { publishTime: e.target.value })}
                          disabled={isLocked}
                          style={{
                            padding: isNarrow ? "9px 10px" : "4px 6px",
                            borderRadius: isNarrow ? 10 : 6,
                            border: "1px solid #e4e4e7",
                            fontSize: isNarrow ? 15 : 11,
                            color: "#18181b",
                            background: "#fff",
                            fontFamily: "inherit",
                            width: isNarrow ? 130 : 90,
                          }}
                        />
                        <span style={{ fontSize: isNarrow ? 11 : 9, color: "#a1a1aa" }}>
                          Publish (GMT)
                          {(() => {
                            // Show the local equivalent whenever the display
                            // zone renders a different clock than plain GMT —
                            // e.g. UK summer time (BST) or another region.
                            const local = formatUtcClockInZone(
                              dateKey,
                              draft.publishTime,
                              timeZone
                            );
                            const gmt = formatUtcClockInZone(
                              dateKey,
                              draft.publishTime,
                              "Etc/GMT"
                            );
                            return local && local !== gmt ? (
                              <span style={{ color: "#6366f1", fontWeight: 600 }}>
                                {" · "}
                                {local}
                              </span>
                            ) : null;
                          })()}
                        </span>
                      </div>
                    </div>
                  );
                  })()}
                </div>

                <div
                  style={
                    isNarrow
                      ? { display: "contents" }
                      : {
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          minWidth: 0,
                        }
                  }
                >



                  {(() => {
                    const previewIdx = previewIdxMap[key] ?? 0;
                    const safeIdx = Math.min(previewIdx, Math.max(0, draft.mediaUrls.length - 1));
                    const activeUrl = draft.mediaUrls[safeIdx] ?? "";
                    const setPreviewIdx = (n: number) => setPreviewIdxMap((prev) => ({ ...prev, [key]: n }));
                    return (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        order: isNarrow ? 2 : undefined,
                        // Status dots drop below the card on a phone rather than
                        // stealing width from it.
                        flexDirection: isNarrow ? "column" : "row",
                        alignItems: isNarrow ? "stretch" : "center",
                        minWidth: 0,
                      }}
                    >
                    <div
                      style={{
                        flex: 1,
                        maxWidth: isNarrow ? "100%" : 500,
                        minWidth: 0,
                        background: "#fff",
                        border: "1px solid #e4e4e7",
                        borderRadius: 12,
                        overflow: "hidden",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      }}
                    >
                      {/* Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: isNarrow ? "8px 12px" : "10px 12px",
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
                          {(clients.find((c) => c.id === clientId)?.name ?? "?").charAt(0).toUpperCase()}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#18181b", lineHeight: 1.2 }}>
                            {clients.find((c) => c.id === clientId)?.name ?? "Client"}
                          </span>
                          {/* The day header directly above already states the
                              date on mobile — repeating it here is a wasted
                              line inside a screen-width card. */}
                          {!isNarrow && (
                            <span style={{ fontSize: 11, color: "#71717a", lineHeight: 1.2 }}>
                              {formatDayLong(d)}
                            </span>
                          )}
                        </div>

                        {draft.pillarId && pillarsById.get(draft.pillarId) && (
                          <span
                            style={{
                              marginLeft: "auto",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 999,
                              background: `${pillarsById.get(draft.pillarId)!.color}15`,
                              border: `1px solid ${pillarsById.get(draft.pillarId)!.color}`,
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
                                background: pillarsById.get(draft.pillarId)!.color,
                                display: "inline-block",
                              }}
                            />
                            {pillarsById.get(draft.pillarId)!.name}
                          </span>
                        )}
                      </div>

                      {/* Image */}
                      <div
                        style={{
                          width: "100%",
                          // An empty square preview eats most of a phone screen,
                          // so shrink the placeholder until there's media to show.
                          aspectRatio: isNarrow && !activeUrl ? undefined : "1 / 1",
                          height: isNarrow && !activeUrl ? 90 : undefined,
                          background: "#f4f4f5",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        {activeUrl ? (
                          isDriveVideo(activeUrl) ? (
                            <iframe
                              src={`https://drive.google.com/file/d/${driveVideoFileId(activeUrl)}/preview`}
                              style={{ display: "block", width: "100%", height: "100%", border: "none" }}
                              allow="autoplay"
                              title="Video preview"
                            />
                          ) : isVideoUrl(activeUrl) ? (
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
                              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", fontSize: 30, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: safeIdx === 0 ? 0.25 : 1 }}>‹</button>
                            <button type="button" onClick={() => setPreviewIdx(Math.min(draft.mediaUrls.length - 1, safeIdx + 1))} disabled={safeIdx === draft.mediaUrls.length - 1}
                              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", fontSize: 30, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: safeIdx === draft.mediaUrls.length - 1 ? 0.25 : 1 }}>›</button>
                            <div style={{ position: "absolute", top: 8, right: 10, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: 99 }}>{safeIdx + 1}/{draft.mediaUrls.length}</div>
                          </>
                        )}

                        {/* Per-image controls — only show when there are unsaved changes, so saved posts are browse-only */}
                        {activeUrl && !isLocked && hasDraft && (
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

                      {/* Editable caption */}
                      <div style={{ borderTop: "1px solid #f4f4f5" }}>
                        {(() => {
                          const captionProps = {
                            value: draft.caption,
                            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
                              updateDraft(dateKey, activePlatform, { caption: e.target.value }),
                            onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
                              if (!isLocked) handlePasteMedia(e, dateKey, activePlatform, postKey(dateKey, activePlatform));
                            },
                            placeholder: "Write a caption... (or paste an image to attach it)",
                            disabled: isLocked,
                            style: {
                              display: "block",
                              width: "100%",
                              padding: isNarrow ? "12px 14px 8px" : "8px 12px 4px",
                              border: "none",
                              outline: "none",
                              // 16px keeps iOS from zooming the page in on focus.
                              fontSize: isNarrow ? 16 : 13,
                              color: "#18181b",
                              lineHeight: 1.45,
                              fontFamily: "inherit",
                              background: "transparent",
                              opacity: isLocked ? 0.7 : 1,
                              cursor: isLocked ? "not-allowed" : "text",
                              boxSizing: "border-box" as const,
                            },
                          };
                          // The composer grows with the caption on a phone, the
                          // way a chat input does; desktop keeps its fixed box.
                          return isNarrow ? (
                            <AutoGrowTextarea {...captionProps} minHeight={150} maxHeight={480} />
                          ) : (
                            <textarea {...captionProps} rows={12} style={{ ...captionProps.style, resize: "none" }} />
                          );
                        })()}
                        {pasteUploadKey === postKey(dateKey, activePlatform) && (
                          <div style={{ padding: "0 12px 8px", fontSize: 11, fontWeight: 600, color: "#5b21b6" }}>
                            Uploading pasted image…
                          </div>
                        )}
                      </div>

                      {/* Modifier buttons + Clear */}
                      {(draft.caption.trim() || post || hasDraft) && (
                        <div
                          // On a phone the AI actions become a single swipeable
                          // row of chips instead of a wrap that buries them.
                          className={isNarrow ? "mobile-strip" : undefined}
                          style={{
                            padding: isNarrow ? "2px 12px 12px" : "0 12px 12px",
                            display: "flex",
                            gap: isNarrow ? 8 : 6,
                            flexWrap: isNarrow ? "nowrap" : "wrap",
                            alignItems: "center",
                          }}
                        >
                          {draft.caption.trim() && (["regenerate", "new_hook", "shorter", "more_playful", "more_premium", "stronger_cta"] as const).map((mod) => {
                            const labels: Record<string, string> = {
                              regenerate: "↺",
                              new_hook: "Hook",
                              shorter: "Shorter",
                              more_playful: "Fun",
                              more_premium: "Premium",
                              stronger_cta: "CTA",
                            };
                            const activeModifier = captionModifying[postKey(dateKey, activePlatform)];
                            const isThisOne = activeModifier === mod;
                            const anyRunning = !!activeModifier;
                            return (
                              <button
                                key={mod}
                                type="button"
                                disabled={anyRunning || isLocked}
                                onClick={() => {
                                  haptic(8);
                                  handleModifyCaption(dateKey, activePlatform, mod);
                                }}
                                style={{
                                  flexShrink: 0,
                                  padding: isNarrow ? "8px 14px" : "3px 9px",
                                  borderRadius: 99,
                                  border: "1px solid #e4e4e7",
                                  background: isThisOne ? "#e0f2fe" : "#fff",
                                  color: isThisOne ? "#0369a1" : "#52525b",
                                  fontSize: isNarrow ? 13 : 11,
                                  fontWeight: 600,
                                  cursor: anyRunning || isLocked ? "wait" : "pointer",
                                  opacity: anyRunning && !isThisOne ? 0.45 : 1,
                                  transition: "background 140ms ease",
                                }}
                              >
                                {isThisOne ? "Rewriting…" : labels[mod]}
                              </button>
                            );
                          })}
                          {(post || hasDraft) && !isLocked && (
                            standalone && confirmClearKey === key ? (
                              // Inline confirm right next to Clear.
                              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDelete(dateKey, activePlatform, true);
                                    setConfirmClearKey(null);
                                  }}
                                  disabled={isPending}
                                  style={{
                                    padding: isNarrow ? "8px 14px" : "3px 10px",
                                    borderRadius: 99,
                                    border: "1px solid #b91c1c",
                                    background: "#b91c1c",
                                    color: "#fff",
                                    fontSize: isNarrow ? 13 : 11,
                                    fontWeight: 700,
                                    cursor: isPending ? "wait" : "pointer",
                                  }}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmClearKey(null)}
                                  style={{
                                    padding: isNarrow ? "8px 12px" : "3px 9px",
                                    borderRadius: 99,
                                    border: "1px solid #e4e4e7",
                                    background: "#fff",
                                    color: "#52525b",
                                    fontSize: isNarrow ? 13 : 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  standalone
                                    ? setConfirmClearKey(key)
                                    : handleDelete(dateKey, activePlatform)
                                }
                                disabled={isPending}
                                style={{
                                  flexShrink: 0,
                                  padding: isNarrow ? "8px 14px" : "3px 9px",
                                  borderRadius: 99,
                                  border: "1px solid #fca5a5",
                                  background: "#fff",
                                  color: "#991b1b",
                                  fontSize: isNarrow ? 13 : 11,
                                  fontWeight: 600,
                                  cursor: isPending ? "wait" : "pointer",
                                  marginLeft: "auto",
                                }}
                              >
                                Clear
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status dots — the save action. Vertically beside the card
                        on desktop; a labelled row underneath on a phone, where
                        an unlabelled dot is too easy to miss. */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        gap: isNarrow ? 8 : 8,
                        alignItems: "center",
                        justifyContent: isNarrow ? "space-between" : undefined,
                        flexShrink: 0,
                        ...(isNarrow
                          ? {
                              padding: 8,
                              borderRadius: 14,
                              border: "1px solid #e4e4e7",
                              background: "#fff",
                            }
                          : {
                              flexDirection: "column",
                              // Standalone: nudge the traffic lights right and
                              // lift them up so they sit on the image (the card's
                              // header/caption otherwise pull the centre down).
                              ...(standalone
                                ? { marginLeft: 14, alignSelf: "center", marginTop: -140 }
                                : {}),
                            }),
                      }}
                    >
                      {["proofed", "check", "improve"].map((statusValue) => {
                        const btn = STATUS_BUTTONS.find((b) => b.value === statusValue)!;
                        const active = effectiveStatus === statusValue;
                        const disableThisButton = isPending || (isLocked && statusValue !== "proofed" && statusValue !== "improve" && statusValue !== "check");
                        const isCheckBtn = statusValue === "check";
                        const isDisabled = disableThisButton || (isCheckBtn && !post && !hasDraft);
                        // Short labels for the phone row — the desktop tooltip
                        // text is too long to sit under a dot.
                        const shortLabel =
                          statusValue === "proofed"
                            ? "Scheduled"
                            : statusValue === "check"
                            ? "Check"
                            : "Improve";
                        const dot = (
                          <span
                            style={{
                              display: "block",
                              width: isNarrow ? 22 : standalone ? 24 : 16,
                              height: isNarrow ? 22 : standalone ? 24 : 16,
                              borderRadius: "50%",
                              border: "1px solid #e4e4e7",
                              background: btn.dot,
                              boxShadow: active && isNarrow ? `0 0 0 3px ${btn.bg}` : "none",
                            }}
                          />
                        );
                        return (
                          <button
                            key={btn.value}
                            type="button"
                            title={btn.label}
                            aria-label={btn.label}
                            aria-pressed={active}
                            onClick={() => {
                              haptic(active ? 8 : [10, 40, 14]);
                              handleStatus(dateKey, activePlatform, statusValue as ProoferStatus);
                            }}
                            disabled={isDisabled}
                            style={{
                              padding: isNarrow ? "7px 6px" : 0,
                              width: isNarrow ? undefined : standalone ? 24 : 16,
                              height: isNarrow ? undefined : standalone ? 24 : 16,
                              flex: isNarrow ? 1 : undefined,
                              borderRadius: isNarrow ? 10 : "50%",
                              border: isNarrow ? "none" : "1px solid #e4e4e7",
                              background: isNarrow ? (active ? btn.bg : "transparent") : btn.dot,
                              cursor: isDisabled ? "not-allowed" : "pointer",
                              boxShadow: "none",
                              opacity: isDisabled ? 0.3 : active || isNarrow ? 1 : 0.35,
                              transition: "opacity 120ms ease, background 140ms ease",
                              display: isNarrow ? "flex" : undefined,
                              flexDirection: isNarrow ? "column" : undefined,
                              alignItems: isNarrow ? "center" : undefined,
                              gap: isNarrow ? 5 : undefined,
                            }}
                            onMouseEnter={(e) => { if (!isNarrow && !isDisabled && !active) e.currentTarget.style.opacity = "0.75"; }}
                            onMouseLeave={(e) => { if (!isNarrow && !isDisabled && !active) e.currentTarget.style.opacity = "0.35"; }}
                          >
                            {isNarrow ? (
                              <>
                                <span style={{ opacity: isDisabled || active ? 1 : 0.4 }}>{dot}</span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: 0.2,
                                    color: active ? btn.color : "#71717a",
                                  }}
                                >
                                  {shortLabel}
                                </span>
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
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
                      order: isNarrow ? 5 : undefined,
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
          // Keeps the label on one line inside the mobile media strip.
          whiteSpace: "nowrap",
          flexShrink: 0,
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

function smoothScrollTo(targetY: number, duration = 650) {
  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const startY = window.scrollY;
  const distance = Math.max(0, targetY) - startY;
  if (Math.abs(distance) < 2) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function smoothScrollToTop() {
  smoothScrollTo(0);
}

function smoothScrollDayInto(dateKey: string) {
  const el = document.getElementById(`day-${dateKey}`);
  if (!el) return;
  smoothScrollTo(el.getBoundingClientRect().top + window.scrollY - 72);
}

/**
 * The worst status across every platform on a day — "improve" wins over
 * scheduled, scheduled over needs-check. Drives both the desktop scrubber and
 * the mobile date strip.
 */
type DayColor = "red" | "green" | "yellow" | "grey";

function dayColorFor(
  dateKey: string,
  postsByKey: Map<string, ProoferPost>
): DayColor {
  let color: DayColor = "grey";
  for (const p of PROOFER_PLATFORMS) {
    const post = postsByKey.get(postKey(dateKey, p));
    if (!post) continue;
    if (post.status === "improve") return "red";
    if (post.status === "proofed" || post.status === "approved") {
      color = "green";
    } else if (post.status === "check" && color !== "green") {
      color = "yellow";
    }
  }
  return color;
}

const DAY_COLOR_HEX: Record<DayColor, string> = {
  red: "#fca5a5",
  green: "#86efac",
  yellow: "#fef08a",
  grey: "#e4e4e7",
};

/**
 * Mobile replacement for the desktop scrubber rail: a sticky horizontal strip
 * of dates. Tapping one focuses that day; the status colour rides underneath as
 * a dot so you can see at a glance which days are scheduled.
 */
function MobileDateStrip({
  days,
  postsByKey,
  focusedKey,
  onFocus,
}: {
  days: Date[];
  postsByKey: Map<string, ProoferPost>;
  focusedKey: string;
  onFocus: (dateKey: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Keep the focused chip in view when the day changes from a swipe or arrow.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const chip = strip.querySelector<HTMLElement>(`[data-date="${focusedKey}"]`);
    if (!chip) return;
    const target = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [focusedKey]);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 25,
        margin: "0 -12px",
        padding: "6px 0 8px",
        background: "rgba(244,244,245,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e4e4e7",
      }}
    >
      <div ref={stripRef} className="mobile-strip" style={{ gap: 6, padding: "0 12px" }}>
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const isFocused = dateKey === focusedKey;
          const color = dayColorFor(dateKey, postsByKey);
          const rel = relativeDayLabel(d);
          return (
            <button
              key={dateKey}
              type="button"
              data-date={dateKey}
              onClick={() => onFocus(dateKey)}
              aria-current={isFocused ? "date" : undefined}
              style={{
                flexShrink: 0,
                width: 54,
                padding: "7px 0 6px",
                borderRadius: 12,
                border: isFocused ? "1px solid #18181b" : "1px solid #e4e4e7",
                background: isFocused ? "#18181b" : "#fff",
                color: isFocused ? "#fff" : "#3f3f46",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                transition: "background 140ms ease, border-color 140ms ease",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  opacity: isFocused ? 0.72 : 0.55,
                }}
              >
                {rel === "Today"
                  ? "TDY"
                  : d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                {d.getDate()}
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color === "grey" ? "transparent" : DAY_COLOR_HEX[color],
                  border:
                    color === "grey"
                      ? `1px solid ${isFocused ? "rgba(255,255,255,0.3)" : "#e4e4e7"}`
                      : "none",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
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
      {/* Back-to-top: a compact dark box above day 1 that returns to the top
          of the page. Fixed height (doesn't flex-grow like the day cells). */}
      <button
        type="button"
        aria-label="Back to top"
        title="Back to top"
        onClick={() => smoothScrollToTop()}
        style={{
          width: 36,
          height: 28,
          flex: "0 0 auto",
          background: "#3f3f46",
          color: "#fafafa",
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderBottom: "1px solid #d4d4d8",
          cursor: "pointer",
          transition: "filter 120ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.filter = "brightness(1.35)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.filter = "none";
        }}
      >
        ↑
      </button>
      {days.map((d, i) => {
        const dateKey = toDateKey(d);
        const color = dayColorFor(dateKey, postsByKey);

        const isElapsed = d.getTime() < todayStart.getTime();
        const bg =
          color !== "grey"
            ? DAY_COLOR_HEX[color]
            : isElapsed
            ? "#d4d4d8"
            : "#e4e4e7";
        const fg = "#a1a1aa";

        return (
          <a
            key={dateKey}
            href={`#day-${dateKey}`}
            title={formatDayLong(d)}
            onClick={(e) => {
              e.preventDefault();
              smoothScrollDayInto(dateKey);
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

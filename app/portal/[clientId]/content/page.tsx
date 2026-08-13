// ---------------------------------------------------------------------------
// /portal/[clientId]/content — the client's Content (proofer) board.
//
// Mirrors the operator's proofer view: every planned post for a month, with
// its media and caption. Here the client can edit + save, approve / unapprove,
// add images or videos, and comment (which notifies the operator in-app).
//
// Reads go through the service-role admin client *after* the page-level
// canViewClient gate — the same pattern the Connect page uses — because the
// proofer_comments table is admin-only under RLS.
// ---------------------------------------------------------------------------

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayTimezone } from "@/lib/app-settings";
import { canViewClient, getViewer } from "../../../admin-panel/lib/viewer";
import { getViewerMaxVideoUploadBytes } from "@/lib/billing/team-billing";
import ClientContentBoard, {
  type ClientPost,
  type ClientComment,
} from "./ClientContentBoard";

export const dynamic = "force-dynamic";

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function isValidMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const endDate = new Date(Date.UTC(y, m, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1)));
}

export default async function PortalContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);
  if (!Number.isFinite(clientId)) notFound();

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const admin = createAdminClient();

  // Gate on the per-client toggle (defence-in-depth for direct URL hits).
  const { data: clientRow } = await admin
    .from("clients")
    .select("id, name, portal_show_content")
    .eq("id", clientId)
    .maybeSingle();
  if (!clientRow) notFound();
  if ((clientRow as { portal_show_content?: boolean }).portal_show_content === false) {
    notFound();
  }

  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : currentMonth();
  const { start, end } = monthBounds(month);

  let timeZone = "Etc/GMT";
  try {
    timeZone = await getDisplayTimezone(admin);
  } catch (err) {
    console.error("Portal content timezone load error:", err);
  }

  const { data: postRows } = await admin
    .from("proofer_posts")
    .select("id, post_date, platform, caption, image_url, media_urls, publish_time, status")
    .eq("client_id", clientId)
    .gte("post_date", start)
    .lt("post_date", end)
    .order("post_date", { ascending: true })
    .order("publish_time", { ascending: true });

  const rawPosts = (postRows ?? []) as Array<{
    id: string | number;
    post_date: string;
    platform: string;
    caption: string | null;
    image_url: string | null;
    media_urls: string[] | null;
    publish_time: string | null;
    status: string | null;
  }>;

  // Only surface posts that actually have something to review — a caption or
  // media. Empty operator-planning slots stay hidden from the client.
  const meaningful = rawPosts.filter(
    (p) => (p.caption ?? "").trim() !== "" || (p.media_urls ?? []).length > 0 || (p.image_url ?? "").trim() !== ""
  );

  const postIds = meaningful.map((p) => String(p.id));
  const commentsByPost = new Map<string, ClientComment[]>();

  // Which of these posts have actually gone out — so the client sees
  // "Published" rather than an approve button on things already live.
  const publishedIds = new Set<string>();
  if (postIds.length > 0) {
    const { data: queueRows } = await admin
      .from("proofer_publish_queue")
      .select("post_id, status")
      .in("post_id", postIds)
      .eq("status", "published");
    for (const r of (queueRows ?? []) as Array<{ post_id: string | number | null }>) {
      if (r.post_id != null) publishedIds.add(String(r.post_id));
    }
  }

  if (postIds.length > 0) {
    const { data: commentRows } = await admin
      .from("proofer_comments")
      .select("id, post_id, comment, created_by, author_role, resolved, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    for (const row of (commentRows ?? []) as Array<{
      id: string | number;
      post_id: string | number;
      comment: string | null;
      created_by: string | null;
      author_role: string | null;
      resolved: boolean | null;
      created_at: string | null;
    }>) {
      const pid = String(row.post_id);
      const list = commentsByPost.get(pid) ?? [];
      list.push({
        id: String(row.id),
        comment: row.comment ?? "",
        author: row.created_by ?? "",
        authorRole: row.author_role === "client" ? "client" : "admin",
        resolved: Boolean(row.resolved),
        createdAt: row.created_at ?? "",
      });
      commentsByPost.set(pid, list);
    }
  }

  const posts: ClientPost[] = meaningful.map((p) => ({
    id: String(p.id),
    postDate: p.post_date,
    platform: p.platform,
    caption: p.caption ?? "",
    mediaUrls:
      (p.media_urls ?? []).length > 0
        ? (p.media_urls ?? [])
        : (p.image_url ?? "").trim()
        ? [(p.image_url ?? "").trim()]
        : [],
    publishTime: p.publish_time ?? "18:00",
    status: p.status ?? "none",
    published: publishedIds.has(String(p.id)),
    comments: commentsByPost.get(String(p.id)) ?? [],
  }));

  const videoMaxBytes = await getViewerMaxVideoUploadBytes();

  return (
    <ClientContentBoard
      clientId={clientId}
      month={month}
      monthLabel={monthLabel(month)}
      prevMonth={shiftMonth(month, -1)}
      nextMonth={shiftMonth(month, 1)}
      posts={posts}
      timeZone={timeZone}
      videoMaxBytes={videoMaxBytes}
    />
  );
}

import { createClient } from "../../../lib/supabase/server";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbSuggestionToUiSuggestion,
} from "./mappers";
import type {
  Ad,
  Client,
  Suggestion,
  ContentProgress,
  VideoIdea,
  ContentTheme,
  CarouselIdea,
  CarouselTheme,
  StoryIdea,
  StoryTheme,
  Task,
  TaskCategory,
  TaskStatus,
  TaskRecurrence,
  ProoferPost,
  ProoferStatus,
  ProoferPlatform,
  ProoferPublishQueueItem,
  PublishQueueStatus,
  PublishQueuePlatform,
} from "./types";

// The legacy `actions` table used to power the dashboard's "Today's Actions"
// list. That surface has been replaced by <TopPriorities />, which reads from
// the modern ad_actions / ad_decisions tables, so the dashboard no longer
// needs to fetch from `actions` here. The campaign detail page still reads
// the legacy table directly — that cleanup is a separate task.
export async function getDashboardData(): Promise<{
  clients: Client[];
  ads: Ad[];
  suggestions: Suggestion[];
}> {
  const supabase = await createClient();

  const [clientsRes, adsRes, suggestionsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase.from("ads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("suggestions")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (adsRes.error) throw new Error(`ads: ${adsRes.error.message}`);
  if (suggestionsRes.error) {
    throw new Error(`suggestions: ${suggestionsRes.error.message}`);
  }

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);

  const adCountByClient = new Map<string, number>();
  for (const a of ads) {
    const key = String(a.clientId);
    adCountByClient.set(key, (adCountByClient.get(key) ?? 0) + 1);
  }

  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = adCountByClient.get(String(row.id)) ?? 0;
    return mapDbClientToUiClient(row, adCount);
  });

  const suggestions = (suggestionsRes.data ?? []).map(
    mapDbSuggestionToUiSuggestion
  );

  return { clients, ads, suggestions };
}

export async function getContentDashboardData(): Promise<{
  clients: { id: string; name: string }[];
  progress: ContentProgress[];
}> {
  const supabase = await createClient();

  const [clientsRes, progressRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase.from("content_progress").select("*"),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (progressRes.error) {
    throw new Error(`content_progress: ${progressRes.error.message}`);
  }

  const clients = (clientsRes.data ?? [])
    .filter((row) => row.status !== "needs_attention")
    .map((row) => ({
      id: row.id,
      name: row.name ?? "Untitled client",
    }));

  const progress: ContentProgress[] = (progressRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    month: row.month,
    status: row.status ?? "not_started",
  }));

  return { clients, progress };
}

export async function getVideoIdeasData(): Promise<{
  clients: { id: string; name: string }[];
  themes: ContentTheme[];
  ideas: VideoIdea[];
}> {
  const supabase = await createClient();

  const [clientsRes, themesRes, ideasRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("content_themes")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("video_ideas")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (themesRes.error) {
    throw new Error(`content_themes: ${themesRes.error.message}`);
  }
  if (ideasRes.error) throw new Error(`video_ideas: ${ideasRes.error.message}`);

  const clients = (clientsRes.data ?? [])
    .filter((row) => row.status !== "needs_attention")
    .map((row) => ({
      id: row.id,
      name: row.name ?? "Untitled client",
    }));

  const themes: ContentTheme[] = (themesRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    monthLabel: row.month_label ?? "",
    theme: row.theme ?? "",
    goal: row.goal ?? "",
    notes: row.notes ?? "",
    sortOrder: row.sort_order ?? 0,
  }));

  const ideas: VideoIdea[] = (ideasRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    themeId: row.theme_id ?? null,
    idea: row.idea ?? "",
    category: row.category ?? "general",
    month: row.month ?? "",
    designLink: row.design_link ?? "",
    createdBy: row.created_by ?? "",
    createdAt: row.created_at ?? "",
  }));

  return { clients, themes, ideas };
}

export async function getTasksData(): Promise<{
  tasks: Task[];
  currentUserEmail: string;
  knownUsers: string[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserEmail = user?.email ?? "";

  const { data: tasksData, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (tasksError) throw new Error(`tasks: ${tasksError.message}`);

  const tasks: Task[] = (tasksData ?? []).map((row) => ({
    id: String(row.id),
    title: row.title ?? "",
    description: row.description ?? "",
    category: (row.category ?? "general") as TaskCategory,
    assignee: row.assignee ?? "",
    createdBy: row.created_by ?? "",
    dueDate: row.due_date ?? "",
    status: (row.status ?? "open") as TaskStatus,
    recurrence: (row.recurrence ?? "none") as TaskRecurrence,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }));

  const userSet = new Set<string>();
  if (currentUserEmail) userSet.add(currentUserEmail);
  tasks.forEach((t) => {
    if (t.assignee) userSet.add(t.assignee);
    if (t.createdBy) userSet.add(t.createdBy);
  });

  const [videoRes, carouselRes, storyRes] = await Promise.all([
    supabase.from("video_ideas").select("created_by"),
    supabase.from("carousel_ideas").select("created_by"),
    supabase.from("story_ideas").select("created_by"),
  ]);

  [videoRes.data, carouselRes.data, storyRes.data].forEach((rows) => {
    (rows ?? []).forEach((r: { created_by?: string | null }) => {
      if (r.created_by) userSet.add(r.created_by);
    });
  });

  const knownUsers = Array.from(userSet)
    .filter((u) => u && u !== "unknown")
    .sort((a, b) => a.localeCompare(b));

  return { tasks, currentUserEmail, knownUsers };
}

export async function getCarouselIdeasData(): Promise<{
  clients: { id: string; name: string }[];
  themes: CarouselTheme[];
  ideas: CarouselIdea[];
}> {
  const supabase = await createClient();

  const [clientsRes, themesRes, ideasRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("carousel_themes")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("carousel_ideas")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (themesRes.error) {
    throw new Error(`carousel_themes: ${themesRes.error.message}`);
  }
  if (ideasRes.error) {
    throw new Error(`carousel_ideas: ${ideasRes.error.message}`);
  }

  const clients = (clientsRes.data ?? [])
    .filter((row) => row.status !== "needs_attention")
    .map((row) => ({
      id: row.id,
      name: row.name ?? "Untitled client",
    }));

  const themes: CarouselTheme[] = (themesRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    monthLabel: row.month_label ?? "",
    theme: row.theme ?? "",
    goal: row.goal ?? "",
    notes: row.notes ?? "",
    sortOrder: row.sort_order ?? 0,
  }));

  const ideas: CarouselIdea[] = (ideasRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    themeId: row.theme_id ?? null,
    idea: row.idea ?? "",
    category: row.category ?? "general",
    month: row.month ?? "",
    captions: Array.isArray(row.captions) ? row.captions : [],
    captionImages: Array.isArray(row.caption_images)
      ? row.caption_images
      : [],
    designLink: row.design_link ?? "",
    createdBy: row.created_by ?? "",
    createdAt: row.created_at ?? "",
  }));

  return { clients, themes, ideas };
}

export async function getStoryIdeasData(): Promise<{
  clients: { id: string; name: string }[];
  themes: StoryTheme[];
  ideas: StoryIdea[];
}> {
  const supabase = await createClient();

  const [clientsRes, themesRes, ideasRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("story_themes")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("story_ideas")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (themesRes.error) {
    throw new Error(`story_themes: ${themesRes.error.message}`);
  }
  if (ideasRes.error) throw new Error(`story_ideas: ${ideasRes.error.message}`);

  const clients = (clientsRes.data ?? [])
    .filter((row) => row.status !== "needs_attention")
    .map((row) => ({
      id: row.id,
      name: row.name ?? "Untitled client",
    }));

  const themes: StoryTheme[] = (themesRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    monthLabel: row.month_label ?? "",
    theme: row.theme ?? "",
    goal: row.goal ?? "",
    notes: row.notes ?? "",
    sortOrder: row.sort_order ?? 0,
  }));

  const ideas: StoryIdea[] = (ideasRes.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    themeId: row.theme_id ?? null,
    idea: row.idea ?? "",
    category: row.category ?? "general",
    month: row.month ?? "",
    designLink: row.design_link ?? "",
    createdBy: row.created_by ?? "",
    createdAt: row.created_at ?? "",
  }));

  return { clients, themes, ideas };
}

// Proofer: one caption+image slot per (client, day). Returns the list of
// active clients and (optionally) the posts for a specific client+month.
export async function getProoferData(
  clientId?: string,
  month?: string
): Promise<{
  clients: { id: string; name: string }[];
  posts: ProoferPost[];
}> {
  const supabase = await createClient();

  const clientsRes = await supabase
    .from("clients")
    .select("id, name, status")
    .eq("archived", false)
    .order("name", { ascending: true });

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);

  const clients = (clientsRes.data ?? [])
    .filter((row) => row.status !== "needs_attention")
    .map((row) => ({
      id: String(row.id),
      name: row.name ?? "Untitled client",
    }));

  if (!clientId || !month) {
    return { clients, posts: [] };
  }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const m = Number(monthStr);

  if (!year || !m) {
    return { clients, posts: [] };
  }

  const start = `${yearStr}-${monthStr}-01`;
  const nextMonthDate = new Date(year, m, 1);
  const end = `${nextMonthDate.getFullYear()}-${String(
    nextMonthDate.getMonth() + 1
  ).padStart(2, "0")}-01`;

  const postsRes = await supabase
    .from("proofer_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("post_date", start)
    .lt("post_date", end)
    .order("post_date", { ascending: true });

  if (postsRes.error) {
    throw new Error(`proofer_posts: ${postsRes.error.message}`);
  }

  const posts: ProoferPost[] = (postsRes.data ?? []).map((row) => {
    const mediaUrls: string[] = Array.isArray(row.media_urls)
      ? row.media_urls.filter(
          (url: unknown): url is string => typeof url === "string" && url !== ""
        )
      : [];

    return {
      id: String(row.id),
      clientId: String(row.client_id),
      postDate: row.post_date ?? "",
      platform: (row.platform ?? "instagram_feed") as ProoferPlatform,
      caption: row.caption ?? "",
      imageUrl: row.image_url ?? "",
      mediaUrls,
      status: (row.status ?? "none") as ProoferStatus,
      createdBy: row.created_by ?? "",
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? "",
    };
  });

  const postIds = posts.map((p) => p.id);

  const commentsMap = new Map<string, ProoferPost["comments"]>();
  const publishQueueMap = new Map<string, ProoferPublishQueueItem[]>();

  if (postIds.length > 0) {
    const [commentsRes, queueRes] = await Promise.all([
      supabase
        .from("proofer_comments")
        .select("*")
        .in("post_id", postIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("proofer_publish_queue")
        .select("*")
        .in("post_id", postIds)
        .order("created_at", { ascending: true }),
    ]);

    if (commentsRes.error) {
      throw new Error(`proofer_comments: ${commentsRes.error.message}`);
    }

    if (queueRes.error) {
      throw new Error(`proofer_publish_queue: ${queueRes.error.message}`);
    }

    (commentsRes.data ?? []).forEach((commentRow) => {
      const postId = String(commentRow.post_id);
      const existing = commentsMap.get(postId) ?? [];

      existing.push({
        id: String(commentRow.id),
        postId,
        comment: commentRow.comment ?? "",
        createdBy: commentRow.created_by ?? "",
        resolved: commentRow.resolved ?? false,
        createdAt: commentRow.created_at ?? "",
      });

      commentsMap.set(postId, existing);
    });

    (queueRes.data ?? []).forEach((queueRow) => {
      const postId = String(queueRow.post_id);
      const existing = publishQueueMap.get(postId) ?? [];

      existing.push({
        id: String(queueRow.id),
        postId,
        platform: (queueRow.platform ?? "instagram") as PublishQueuePlatform,
        status: (queueRow.status ?? "queued") as PublishQueueStatus,
        scheduledFor: queueRow.scheduled_for ?? null,
        publishedAt: queueRow.published_at ?? null,
        publishUrl: queueRow.publish_url ?? null,
        notes: queueRow.notes ?? null,
        createdBy: queueRow.created_by ?? "",
        createdAt: queueRow.created_at ?? "",
        updatedAt: queueRow.updated_at ?? "",
      });

      publishQueueMap.set(postId, existing);
    });
  }

  const postsWithRelations: ProoferPost[] = posts.map((post) => ({
    ...post,
    comments: commentsMap.get(post.id) ?? [],
    publishQueue: publishQueueMap.get(post.id) ?? [],
  }));

  return { clients, posts: postsWithRelations };
}

export async function getProoferPublishQueueData(): Promise<{
  readyPosts: Array<ProoferPost & { clientName: string }>;
  queueItems: Array<
    ProoferPublishQueueItem & {
      clientName: string;
      postDate: string;
      caption: string;
      imageUrl: string;
      postStatus: ProoferStatus;
    }
  >;
}> {
  const supabase = await createClient();

  const [postsRes, clientsRes, queueRes] = await Promise.all([
    supabase
      .from("proofer_posts")
      .select("*")
      .eq("status", "approved")
      .order("post_date", { ascending: true }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("archived", false),
    supabase
      .from("proofer_publish_queue")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  if (postsRes.error) {
    throw new Error(`proofer_posts: ${postsRes.error.message}`);
  }
  if (clientsRes.error) {
    throw new Error(`clients: ${clientsRes.error.message}`);
  }
  if (queueRes.error) {
    throw new Error(`proofer_publish_queue: ${queueRes.error.message}`);
  }

  const clientNameById = new Map<string, string>();
  (clientsRes.data ?? []).forEach((row) => {
    clientNameById.set(String(row.id), row.name ?? "Untitled client");
  });

  const posts: ProoferPost[] = (postsRes.data ?? []).map((row) => {
    const mediaUrls: string[] = Array.isArray(row.media_urls)
      ? row.media_urls.filter(
          (url: unknown): url is string => typeof url === "string" && url !== ""
        )
      : [];

    return {
      id: String(row.id),
      clientId: String(row.client_id),
      postDate: row.post_date ?? "",
      platform: (row.platform ?? "instagram_feed") as ProoferPlatform,
      caption: row.caption ?? "",
      imageUrl: row.image_url ?? "",
      mediaUrls,
      status: (row.status ?? "none") as ProoferStatus,
      createdBy: row.created_by ?? "",
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? "",
    };
  });

  const queueItems: ProoferPublishQueueItem[] = (queueRes.data ?? []).map(
    (row) => ({
      id: String(row.id),
      postId: String(row.post_id),
      platform: (row.platform ?? "instagram") as PublishQueuePlatform,
      status: (row.status ?? "queued") as PublishQueueStatus,
      scheduledFor: row.scheduled_for ?? null,
      publishedAt: row.published_at ?? null,
      publishUrl: row.publish_url ?? null,
      notes: row.notes ?? null,
      createdBy: row.created_by ?? "",
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? "",
    })
  );

  const queueByPostId = new Map<string, ProoferPublishQueueItem[]>();
  queueItems.forEach((item) => {
    const existing = queueByPostId.get(item.postId) ?? [];
    existing.push(item);
    queueByPostId.set(item.postId, existing);
  });

  const readyPosts = posts
    .filter((post) => (queueByPostId.get(post.id) ?? []).length === 0)
    .map((post) => ({
      ...post,
      clientName: clientNameById.get(post.clientId) ?? "Untitled client",
      publishQueue: [],
    }));

  const postById = new Map<string, ProoferPost>();
  posts.forEach((post) => {
    postById.set(post.id, post);
  });

  const enrichedQueueItems = queueItems
    .map((item) => {
      const post = postById.get(item.postId);
      if (!post) return null;

      return {
        ...item,
        clientName: clientNameById.get(post.clientId) ?? "Untitled client",
        postDate: post.postDate,
        caption: post.caption,
        imageUrl: post.imageUrl,
        postStatus: post.status,
      };
    })
    .filter(
      (
        item
      ): item is ProoferPublishQueueItem & {
        clientName: string;
        postDate: string;
        caption: string;
        imageUrl: string;
        postStatus: ProoferStatus;
      } => Boolean(item)
    );

  return {
    readyPosts,
    queueItems: enrichedQueueItems,
  };
}

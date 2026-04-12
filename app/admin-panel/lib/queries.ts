import { createClient } from "../../../lib/supabase/server";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbActionToUiAction,
  mapDbSuggestionToUiSuggestion,
} from "./mappers";
import type { Ad, Client, Action, Suggestion, ContentProgress, VideoIdea, ContentTheme, CarouselIdea, CarouselTheme, StoryIdea, StoryTheme, Task, TaskCategory, TaskStatus, TaskRecurrence } from "./types";

export async function getDashboardData(): Promise<{
  clients: Client[];
  ads: Ad[];
  actions: Action[];
  suggestions: Suggestion[];
}> {
  const supabase = await createClient();

  const [clientsRes, adsRes, actionsRes, suggestionsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("archived", false).order("created_at", { ascending: false }),
    supabase.from("ads").select("*").order("created_at", { ascending: false }),
    supabase.from("actions").select("*").order("created_at", { ascending: false }),
    supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (adsRes.error) throw new Error(`ads: ${adsRes.error.message}`);
  if (actionsRes.error) throw new Error(`actions: ${actionsRes.error.message}`);
  if (suggestionsRes.error) throw new Error(`suggestions: ${suggestionsRes.error.message}`);

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);

  // Build O(1) lookup maps to avoid quadratic client/ad/action matching
  const adCountByClient = new Map<string, number>();
  for (const a of ads) {
    const key = String(a.clientId);
    adCountByClient.set(key, (adCountByClient.get(key) ?? 0) + 1);
  }

  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = adCountByClient.get(String(row.id)) ?? 0;
    return mapDbClientToUiClient(row, adCount);
  });

  const clientNameById = new Map<string, string>();
  for (const c of clients) {
    clientNameById.set(String(c.id), c.name);
  }

  const actions = (actionsRes.data ?? []).map((row) => {
    const name = clientNameById.get(String(row.client_id)) ?? "Unknown client";
    return mapDbActionToUiAction(row, name);
  });

  const suggestions = (suggestionsRes.data ?? []).map(mapDbSuggestionToUiSuggestion);

  return { clients, ads, actions, suggestions };
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
  if (progressRes.error)
    throw new Error(`content_progress: ${progressRes.error.message}`);

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
  if (themesRes.error) throw new Error(`content_themes: ${themesRes.error.message}`);
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
    category: ((row.category ?? "general") as TaskCategory),
    assignee: row.assignee ?? "",
    createdBy: row.created_by ?? "",
    dueDate: row.due_date ?? "",
    status: ((row.status ?? "open") as TaskStatus),
    recurrence: ((row.recurrence ?? "none") as TaskRecurrence),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }));

  // Build a distinct list of known users from existing task rows + current user
  const userSet = new Set<string>();
  if (currentUserEmail) userSet.add(currentUserEmail);
  tasks.forEach((t) => {
    if (t.assignee) userSet.add(t.assignee);
    if (t.createdBy) userSet.add(t.createdBy);
  });

  // Also include any users who have created content ideas (so you can assign to teammates)
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
  if (themesRes.error) throw new Error(`carousel_themes: ${themesRes.error.message}`);
  if (ideasRes.error) throw new Error(`carousel_ideas: ${ideasRes.error.message}`);

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
    captionImages: Array.isArray(row.caption_images) ? row.caption_images : [],
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
  if (themesRes.error) throw new Error(`story_themes: ${themesRes.error.message}`);
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

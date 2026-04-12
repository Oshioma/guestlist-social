import { createClient } from "../../../lib/supabase/server";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbSuggestionToUiSuggestion,
} from "./mappers";
import type { Ad, Client, Suggestion, ContentProgress, VideoIdea, ContentTheme, CarouselIdea, CarouselTheme, StoryIdea, StoryTheme } from "./types";

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
    supabase.from("clients").select("*").eq("archived", false).order("created_at", { ascending: false }),
    supabase.from("ads").select("*").order("created_at", { ascending: false }),
    supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (adsRes.error) throw new Error(`ads: ${adsRes.error.message}`);
  if (suggestionsRes.error) throw new Error(`suggestions: ${suggestionsRes.error.message}`);

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);

  // Build O(1) lookup map to avoid quadratic client/ad matching
  const adCountByClient = new Map<string, number>();
  for (const a of ads) {
    const key = String(a.clientId);
    adCountByClient.set(key, (adCountByClient.get(key) ?? 0) + 1);
  }

  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = adCountByClient.get(String(row.id)) ?? 0;
    return mapDbClientToUiClient(row, adCount);
  });

  const suggestions = (suggestionsRes.data ?? []).map(mapDbSuggestionToUiSuggestion);

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

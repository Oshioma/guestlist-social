import { createClient } from "../../../lib/supabase/server";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbActionToUiAction,
  mapDbSuggestionToUiSuggestion,
} from "./mappers";
import type { Ad, Client, Action, Suggestion, ContentProgress, VideoIdea, ContentTheme } from "./types";

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

  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = ads.filter((a) => a.clientId === row.id).length;
    return mapDbClientToUiClient(row, adCount);
  });

  const actions = (actionsRes.data ?? []).map((row) => {
    const client = clients.find((c) => c.id === row.client_id);
    return mapDbActionToUiAction(row, client?.name ?? "Unknown client");
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
      .select("id, name")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase.from("content_progress").select("*"),
  ]);

  if (clientsRes.error) throw new Error(`clients: ${clientsRes.error.message}`);
  if (progressRes.error)
    throw new Error(`content_progress: ${progressRes.error.message}`);

  const clients = (clientsRes.data ?? []).map((row) => ({
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
      .select("id, name")
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

  const clients = (clientsRes.data ?? []).map((row) => ({
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
    createdAt: row.created_at ?? "",
  }));

  return { clients, themes, ideas };
}

import { createClient } from "../../../lib/supabase/server";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbActionToUiAction,
  mapDbSuggestionToUiSuggestion,
} from "./mappers";
import type { Ad, Client, Action, Suggestion } from "./types";

export async function getDashboardData(): Promise<{
  clients: Client[];
  ads: Ad[];
  actions: Action[];
  suggestions: Suggestion[];
}> {
  const supabase = await createClient();

  const [clientsRes, adsRes, actionsRes, suggestionsRes] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
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

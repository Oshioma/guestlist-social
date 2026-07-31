import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "../../admin-panel/lib/viewer";

export type PortalSection =
  | "portal_show_content"
  | "portal_show_ads"
  | "portal_show_reviews"
  | "portal_show_consultation";

/**
 * Returns true when the given portal section is visible for a client.
 *
 * Admins previewing always see the section (so operators can inspect a page
 * even when it's hidden from the client). For client viewers the per-client
 * toggle decides. Missing column (pre-migration) or read error defaults to
 * visible, preserving prior behavior.
 */
export async function isPortalSectionVisible(
  clientId: number,
  viewer: Viewer | null,
  section: PortalSection
): Promise<boolean> {
  if (viewer?.role !== "client") return true;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .select(section)
    .eq("id", clientId)
    .maybeSingle();

  if (error || !data) return true;
  return (data as Record<string, boolean | null>)[section] !== false;
}

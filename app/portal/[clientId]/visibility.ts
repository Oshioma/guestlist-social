import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "../../admin-panel/lib/viewer";

export type PortalSection =
  | "portal_show_content"
  | "portal_show_ads"
  | "portal_show_reviews"
  | "portal_show_consultation";

// Keep in sync with middleware.ts / app/proofer/base.ts.
const PROOFER_HOSTS = new Set(["postproofer.com", "www.postproofer.com"]);

/** Is this request on the standalone Post Proofer domain? */
export async function isProoferHostRequest(): Promise<boolean> {
  try {
    const host = (await headers()).get("host")?.toLowerCase().split(":")[0] ?? "";
    return PROOFER_HOSTS.has(host);
  } catch {
    return false;
  }
}

// Agency-only sections: Post Proofer clients come for content approval, so the
// portal on that domain never shows Ads or Reviews (for clients and admin
// previews alike), whatever the per-client toggle says.
const PROOFER_HIDDEN_SECTIONS: ReadonlySet<PortalSection> = new Set([
  "portal_show_ads",
  "portal_show_reviews",
]);

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
  if (PROOFER_HIDDEN_SECTIONS.has(section) && (await isProoferHostRequest())) return false;
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

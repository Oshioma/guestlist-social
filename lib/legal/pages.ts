import "server-only";

// Server-side loader for a legal page: the owner's stored override merged over
// the built-in default. Resilient — if the legal_pages table is missing
// (migration not yet applied) or the read fails, the code default is used so the
// public pages never break.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getLegalDef,
  defaultLegalValues,
  type LegalPageValues,
} from "./registry";

type StoredRow = { title: string | null; body_html: string | null };

export async function getLegalPage(
  key: string
): Promise<(LegalPageValues & { slug: string }) | null> {
  const def = getLegalDef(key);
  if (!def) return null;

  let values = defaultLegalValues(def);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("legal_pages")
      .select("title, body_html")
      .eq("key", key)
      .maybeSingle<StoredRow>();
    if (!error && data && data.title && data.body_html) {
      values = { title: data.title, bodyHtml: data.body_html };
    } else if (error && error.code !== "42P01") {
      console.warn(`[legal] load ${key} failed:`, error.message);
    }
  } catch (e) {
    console.warn(`[legal] load ${key} threw:`, e);
  }

  return { ...values, slug: def.slug };
}

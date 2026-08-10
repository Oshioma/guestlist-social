"use server";

// Super-admin actions for the Legal tab: load every legal page (stored override
// merged over the default) for the editor, and save/reset an override. Gated on
// isSuperAdmin — the underlying table is service-role only.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/permissions";
import {
  LEGAL_PAGES,
  getLegalDef,
  defaultLegalValues,
  type LegalPageValues,
} from "./registry";

export type LegalEditorItem = {
  key: string;
  slug: string;
  navLabel: string;
  current: LegalPageValues;
  default: LegalPageValues;
  isCustom: boolean;
};

export type SaveLegalState = {
  error?: string | null;
  success?: boolean;
  message?: string;
  savedKey?: string;
};

type StoredRow = { key: string; title: string | null; body_html: string | null };

export async function loadLegalPagesForEditor(): Promise<LegalEditorItem[]> {
  if (!(await isSuperAdmin())) return [];

  const admin = createAdminClient();
  const stored = new Map<string, StoredRow>();
  try {
    const { data, error } = await admin
      .from("legal_pages")
      .select("key, title, body_html");
    if (error && error.code !== "42P01") {
      console.warn("[legal] editor load failed:", error.message);
    }
    for (const row of (data ?? []) as StoredRow[]) stored.set(row.key, row);
  } catch (e) {
    console.warn("[legal] editor load threw:", e);
  }

  return LEGAL_PAGES.map((def) => {
    const def_ = defaultLegalValues(def);
    const row = stored.get(def.key);
    const hasOverride = Boolean(row && row.title && row.body_html);
    const current: LegalPageValues = hasOverride
      ? { title: row!.title!, bodyHtml: row!.body_html! }
      : def_;
    return {
      key: def.key,
      slug: def.slug,
      navLabel: def.navLabel,
      current,
      default: def_,
      isCustom: hasOverride,
    };
  });
}

export async function saveLegalPage(
  _prev: SaveLegalState | null,
  formData: FormData
): Promise<SaveLegalState> {
  if (!(await isSuperAdmin())) {
    return { error: "Only the super admin can edit legal pages." };
  }

  const key = String(formData.get("key") ?? "");
  const def = getLegalDef(key);
  if (!def) return { error: "Unknown legal page." };

  const title = String(formData.get("title") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();
  if (!title) return { error: "Give the page a title.", savedKey: key };
  if (!bodyHtml) return { error: "The page body can't be empty.", savedKey: key };

  let updatedBy: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    updatedBy = user?.id ?? null;
  } catch {
    /* best-effort attribution */
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("legal_pages").upsert(
      {
        key,
        title,
        body_html: bodyHtml,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.code === "42P01") {
        return {
          error:
            "The legal_pages table isn't set up yet — run the pending database migration, then try again.",
          savedKey: key,
        };
      }
      return { error: `Couldn't save: ${error.message}`, savedKey: key };
    }
  } catch (e) {
    console.error("saveLegalPage threw:", e);
    return {
      error: e instanceof Error ? `Couldn't save: ${e.message}` : "Couldn't save.",
      savedKey: key,
    };
  }

  revalidatePath("/proofer/super-admin");
  revalidatePath(`/${def.slug}`);
  return { success: true, message: `"${def.navLabel}" saved and published.`, savedKey: key };
}

export async function resetLegalPage(
  _prev: SaveLegalState | null,
  formData: FormData
): Promise<SaveLegalState> {
  if (!(await isSuperAdmin())) {
    return { error: "Only the super admin can edit legal pages." };
  }
  const key = String(formData.get("key") ?? "");
  const def = getLegalDef(key);
  if (!def) return { error: "Unknown legal page." };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("legal_pages").delete().eq("key", key);
    if (error && error.code !== "42P01") {
      return { error: `Couldn't reset: ${error.message}`, savedKey: key };
    }
  } catch (e) {
    console.error("resetLegalPage threw:", e);
    return {
      error: e instanceof Error ? `Couldn't reset: ${e.message}` : "Couldn't reset.",
      savedKey: key,
    };
  }

  revalidatePath("/proofer/super-admin");
  revalidatePath(`/${def.slug}`);
  return { success: true, message: `"${def.navLabel}" reset to default.`, savedKey: key };
}

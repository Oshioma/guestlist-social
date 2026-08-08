"use server";

// Super-admin actions for the Emails tab: load every email template (stored
// override merged over the built-in default) for the editor, and save an
// override. Gated on isSuperAdmin — the underlying table is service-role only.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/permissions";
import {
  EMAIL_TEMPLATES,
  getTemplateDef,
  defaultValuesFor,
  type EmailPlaceholder,
  type EmailTemplateValues,
} from "./render";

export type EmailTemplateEditorItem = {
  key: string;
  name: string;
  description: string;
  primaryLinkVar: string | null;
  placeholders: EmailPlaceholder[];
  current: EmailTemplateValues;
  default: EmailTemplateValues;
  isCustom: boolean;
};

export type SaveTemplateState = {
  error?: string | null;
  success?: boolean;
  message?: string;
  savedKey?: string;
};

type StoredRow = {
  key: string;
  subject: string | null;
  body_html: string | null;
  button_label: string | null;
};

// Load all templates with any stored overrides applied. Super-admin only.
export async function loadEmailTemplatesForEditor(): Promise<
  EmailTemplateEditorItem[]
> {
  if (!(await isSuperAdmin())) return [];

  const admin = createAdminClient();
  const stored = new Map<string, StoredRow>();
  try {
    const { data, error } = await admin
      .from("email_templates")
      .select("key, subject, body_html, button_label");
    if (error && error.code !== "42P01") {
      console.warn("[email-templates] editor load failed:", error.message);
    }
    for (const row of (data ?? []) as StoredRow[]) stored.set(row.key, row);
  } catch (e) {
    console.warn("[email-templates] editor load threw:", e);
  }

  return EMAIL_TEMPLATES.map((def) => {
    const def_ = defaultValuesFor(def);
    const row = stored.get(def.key);
    const hasOverride = Boolean(row && row.subject && row.body_html);
    const current: EmailTemplateValues = hasOverride
      ? {
          subject: row!.subject!,
          bodyHtml: row!.body_html!,
          buttonLabel: row!.button_label,
        }
      : def_;
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      primaryLinkVar: def.primaryLinkVar,
      placeholders: def.placeholders,
      current,
      default: def_,
      isCustom: hasOverride,
    };
  });
}

// Save (upsert) an override for one template. Super-admin only.
export async function saveEmailTemplate(
  _prev: SaveTemplateState | null,
  formData: FormData
): Promise<SaveTemplateState> {
  if (!(await isSuperAdmin())) {
    return { error: "Only the super admin can edit emails." };
  }

  const key = String(formData.get("key") ?? "");
  const def = getTemplateDef(key);
  if (!def) return { error: "Unknown email template." };

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();
  const buttonLabelRaw = String(formData.get("button_label") ?? "").trim();
  const buttonLabel = buttonLabelRaw.length > 0 ? buttonLabelRaw : null;

  if (!subject) return { error: "Give the email a subject line.", savedKey: key };
  if (!bodyHtml) return { error: "The email body can't be empty.", savedKey: key };

  let updatedBy: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    updatedBy = user?.id ?? null;
  } catch {
    // best-effort attribution only
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("email_templates").upsert(
      {
        key,
        subject,
        body_html: bodyHtml,
        button_label: buttonLabel,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.code === "42P01") {
        return {
          error:
            "The email_templates table isn't set up yet — run the pending database migration, then try again.",
          savedKey: key,
        };
      }
      return { error: `Couldn't save: ${error.message}`, savedKey: key };
    }
  } catch (e) {
    console.error("saveEmailTemplate threw:", e);
    return {
      error: e instanceof Error ? `Couldn't save: ${e.message}` : "Couldn't save.",
      savedKey: key,
    };
  }

  revalidatePath("/proofer/super-admin");
  return { success: true, message: `“${def.name}” saved.`, savedKey: key };
}

// Reset a template back to the built-in default (delete its override).
export async function resetEmailTemplate(
  _prev: SaveTemplateState | null,
  formData: FormData
): Promise<SaveTemplateState> {
  if (!(await isSuperAdmin())) {
    return { error: "Only the super admin can edit emails." };
  }
  const key = String(formData.get("key") ?? "");
  const def = getTemplateDef(key);
  if (!def) return { error: "Unknown email template." };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("email_templates").delete().eq("key", key);
    if (error && error.code !== "42P01") {
      return { error: `Couldn't reset: ${error.message}`, savedKey: key };
    }
  } catch (e) {
    console.error("resetEmailTemplate threw:", e);
    return {
      error: e instanceof Error ? `Couldn't reset: ${e.message}` : "Couldn't reset.",
      savedKey: key,
    };
  }

  revalidatePath("/proofer/super-admin");
  return { success: true, message: `“${def.name}” reset to default.`, savedKey: key };
}

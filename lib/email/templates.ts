import "server-only";

// ---------------------------------------------------------------------------
// Server-side email template rendering: loads the owner's stored override for a
// template (if any) via the service-role client, falls back to the built-in
// default, and renders subject/html/text with the given vars.
//
// Resilient by design: if the email_templates table is missing (migration not
// yet applied) or the read fails, we silently use the code default so no send
// ever breaks on a template lookup.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTemplateDef,
  defaultValuesFor,
  renderEmailFromValues,
  type EmailTemplateValues,
  type RenderedEmail,
  type TemplateVars,
} from "./render";

type StoredRow = {
  subject: string | null;
  body_html: string | null;
  button_label: string | null;
};

// Load the owner's override for a template, or null to use the default.
async function getStoredValues(key: string): Promise<EmailTemplateValues | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("email_templates")
      .select("subject, body_html, button_label")
      .eq("key", key)
      .maybeSingle<StoredRow>();
    // 42P01 = table missing (migration not applied yet) → fall back silently.
    if (error) {
      if (error.code !== "42P01") {
        console.warn(`[email-templates] load ${key} failed:`, error.message);
      }
      return null;
    }
    if (!data || !data.subject || !data.body_html) return null;
    return {
      subject: data.subject,
      bodyHtml: data.body_html,
      buttonLabel: data.button_label,
    };
  } catch (e) {
    console.warn(`[email-templates] load ${key} threw:`, e);
    return null;
  }
}

// Render an email by key. Unknown key throws (programming error). A missing
// override falls back to the registry default.
export async function renderEmailTemplate(
  key: string,
  vars: TemplateVars
): Promise<RenderedEmail> {
  const def = getTemplateDef(key);
  if (!def) throw new Error(`Unknown email template: ${key}`);
  const values = (await getStoredValues(key)) ?? defaultValuesFor(def);
  return renderEmailFromValues(def, values, vars);
}

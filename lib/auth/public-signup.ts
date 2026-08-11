// Public self-serve sign-up is OFF by default. The app is invite-only unless
// switched on — this keeps the anti-bot guardrail the codebase deliberately
// shipped, while letting the owner open self-serve sign-up when ready.
//
// Two layers, DB wins:
//   1. app_settings key `public_signup_enabled` — the live toggle in
//      Super admin → System. When set, it is authoritative.
//   2. ENABLE_PUBLIC_SIGNUP env var — the initial default when no toggle has
//      been saved yet.
//
// Server-only: read in server components/actions and the /sign-up route +
// sign-in link. A client that forces its way to the form still hits the same
// check in signUpWithPassword().

import { createAdminClient } from "@/lib/supabase/admin";

export const PUBLIC_SIGNUP_KEY = "public_signup_enabled";

function envDefault(): boolean {
  return process.env.ENABLE_PUBLIC_SIGNUP === "true";
}

export async function publicSignupEnabled(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", PUBLIC_SIGNUP_KEY)
      .maybeSingle<{ value: unknown }>();
    if (data && data.value != null) {
      const v = data.value;
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.trim().toLowerCase() === "true";
      if (typeof v === "object" && "enabled" in (v as Record<string, unknown>)) {
        return Boolean((v as { enabled?: unknown }).enabled);
      }
    }
  } catch {
    // Fall through to the env default — never hard-fail the auth pages on a
    // settings read.
  }
  return envDefault();
}

// Persist the live toggle. Caller must be authorized (super admin).
export async function setPublicSignupEnabled(enabled: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("app_settings").upsert(
    { key: PUBLIC_SIGNUP_KEY, value: enabled, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(`save public signup: ${error.message}`);
}

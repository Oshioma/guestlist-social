"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { setPublicSignupEnabled } from "@/lib/auth/public-signup";

// Toggle public self-serve sign-up on/off from Super admin → System.
// Super-admin gated; persists to app_settings (DB overrides the env default).
export async function setPublicSignupAction(
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { ok: false, error: "Only the super admin can change this." };
  }
  try {
    await setPublicSignupEnabled(enabled);
    revalidatePath("/proofer/super-admin");
    return { ok: true };
  } catch (e) {
    console.error("setPublicSignupAction error:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save." };
  }
}

"use server";

// Server actions for operator-tunable agency settings. One customer right
// now (reaper thresholds); named generically so the next knob can land
// here without inventing a parallel module.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_REAPER_SETTINGS,
  REAPER_BOUNDS,
  setReaperSettings,
  type ReaperSettings,
} from "@/lib/app-settings";

// Display shape: percent integer for the UI, integer for the count.
// Returned by the actions so the form/page never have to redo the
// 0–1 ↔ percent conversion themselves.
export type ReaperSettingsDisplay = {
  minDecisiveVerdicts: number;
  negRatioPercent: number;
};

export type SaveReaperResult =
  | { ok: true; saved: ReaperSettingsDisplay }
  | { ok: false; error: string };

function toDisplay(s: ReaperSettings): ReaperSettingsDisplay {
  return {
    minDecisiveVerdicts: s.minDecisiveVerdicts,
    negRatioPercent: Math.round(s.negRatio * 100),
  };
}

export async function saveReaperSettings(
  formData: FormData
): Promise<SaveReaperResult> {
  // Form posts the negative ratio as a percentage (50–95) because that's
  // what the operator is reading on the screen. Convert back to the 0–1
  // float the storage layer expects.
  const minRaw = Number(formData.get("minDecisiveVerdicts"));
  const pctRaw = Number(formData.get("negRatioPercent"));

  if (!Number.isFinite(minRaw) || !Number.isFinite(pctRaw)) {
    return { ok: false, error: "Both fields need to be numbers." };
  }

  const minDecisive = Math.round(minRaw);
  const negRatio = pctRaw / 100;

  const minBounds = REAPER_BOUNDS.minDecisiveVerdicts;
  if (minDecisive < minBounds.min || minDecisive > minBounds.max) {
    return {
      ok: false,
      error: `Minimum tries must be between ${minBounds.min} and ${minBounds.max}.`,
    };
  }

  const ratioBounds = REAPER_BOUNDS.negRatio;
  if (negRatio < ratioBounds.min || negRatio > ratioBounds.max) {
    return {
      ok: false,
      error: `Failure rate must be between ${Math.round(
        ratioBounds.min * 100
      )}% and ${Math.round(ratioBounds.max * 100)}%.`,
    };
  }

  const next: ReaperSettings = { minDecisiveVerdicts: minDecisive, negRatio };

  try {
    await setReaperSettings(createAdminClient(), next);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  revalidatePath("/admin-panel/settings");
  return { ok: true, saved: toDisplay(next) };
}

export async function resetReaperSettings(): Promise<SaveReaperResult> {
  try {
    await setReaperSettings(createAdminClient(), DEFAULT_REAPER_SETTINGS);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  revalidatePath("/admin-panel/settings");
  return { ok: true, saved: toDisplay(DEFAULT_REAPER_SETTINGS) };
}

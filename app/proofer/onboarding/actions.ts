"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferAccess } from "@/lib/auth/permissions";
import { getOnboardingState } from "@/lib/onboarding";
import { saveProoferPostAction } from "@/app/admin-panel/lib/proofer-actions";

// ---------------------------------------------------------------------------
// Server actions backing the guided first-run tour. Everything here writes to
// the REAL tables through the same helpers the app already uses — the account,
// the post and the events are all genuine. The one safety rail: the tour only
// ever saves a post as status "check" (yellow / saved), never "proofed"
// (green / scheduled), so nothing the user does in onboarding can publish.
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;
type VoidResult = { ok: true } | Err;

async function requirePoster() {
  const access = await getProoferAccess();
  if (!access) return null;
  return access;
}

// Fire-and-forget funnel logging. Never throws into the caller — analytics must
// not be able to break the flow.
export async function logOnboardingEvent(
  event: string,
  step?: number,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    const access = await getProoferAccess();
    if (!access) return;
    const admin = createAdminClient();
    await admin.from("onboarding_events").insert({
      user_id: access.userId,
      event,
      step: typeof step === "number" ? step : null,
      meta: meta ?? null,
    });
  } catch (err) {
    console.error("logOnboardingEvent failed:", err);
  }
}

async function patchState(
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("user_onboarding").upsert(
    { user_id: userId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}

// Step 1 — mark the tour started (resumable from here on).
export async function startOnboardingAction(): Promise<VoidResult> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };
  try {
    await patchState(access.userId, {
      onboarding_started: true,
      onboarding_skipped: false,
      // Clear a stale completion so an explicit restart genuinely re-runs
      // (e.g. a user who finished once but ended up with no account).
      onboarding_completed: false,
      onboarding_step: 1,
    });
    await logOnboardingEvent("onboarding_started", 1);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start." };
  }
}

// Persist the current step so a refresh / sign-out resumes in place.
export async function saveOnboardingStepAction(
  step: number
): Promise<VoidResult> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };
  try {
    await patchState(access.userId, {
      onboarding_started: true,
      onboarding_step: Math.max(0, Math.floor(step)),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function skipOnboardingAction(
  step?: number
): Promise<VoidResult> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };
  try {
    await patchState(access.userId, { onboarding_skipped: true });
    await logOnboardingEvent("onboarding_skipped", step);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not skip." };
  }
}

export async function completeOnboardingAction(): Promise<VoidResult> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };
  try {
    await patchState(access.userId, {
      onboarding_completed: true,
      onboarding_step: 11,
    });
    await logOnboardingEvent("onboarding_completed", 11);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not finish." };
  }
}

// Resolve the poster's own team (the personal team created at sign-up). Prefers
// a team they own, else any team they manage. Returns id + name so we can give
// their first account a sensible default name without asking.
async function resolveOwnTeam(
  userId: string
): Promise<{ id: string; name: string } | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"]);
  if (!rows || rows.length === 0) return null;
  const owned = rows.find((r) => r.role === "owner");
  const teamId = String((owned ?? rows[0]).team_id);
  const { data: team } = await admin
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();
  return { id: teamId, name: (team?.name as string) ?? "" };
}

// A friendly default brand name derived from the personal team ("Oshi's Team"
// → "Oshi"). The user can rename it inline; nothing is blocked on it.
function defaultAccountName(teamName: string): string {
  const trimmed = (teamName ?? "").trim();
  const stripped = trimmed.replace(/['’]s Team$/i, "").replace(/ Team$/i, "").trim();
  return stripped || trimmed || "My business";
}

// Step 2 — make sure the user has a real account to post to, WITHOUT asking
// them to "add a client". Auto-provisions one (named from their team) the first
// time, links it to their team, and is idempotent thereafter. This is what lets
// onboarding lead straight into connecting a social platform.
export async function ensureOnboardingAccountAction(): Promise<
  Result<{ clientId: string; name: string }>
> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };

  try {
    const admin = createAdminClient();
    const existing = await getOnboardingState(access.userId);
    if (existing.accountClientId) {
      // Reuse only if the account actually still exists AND is still in one of
      // the user's teams (a prior tour's account could have been deleted or
      // removed). Otherwise fall through and provision a fresh one.
      const { data: clientRow } = await admin
        .from("clients")
        .select("id, name, archived")
        .eq("id", existing.accountClientId)
        .maybeSingle();
      if (clientRow && !clientRow.archived) {
        const { data: link } = await admin
          .from("team_accounts")
          .select("team_id")
          .eq("client_id", existing.accountClientId)
          .limit(1)
          .maybeSingle();
        if (link) {
          return {
            ok: true,
            clientId: existing.accountClientId,
            name: (clientRow.name as string) ?? "",
          };
        }
      }
    }

    const team = await resolveOwnTeam(access.userId);
    if (!team) {
      return {
        ok: false,
        error: "We couldn't find your team. Please refresh and try again.",
      };
    }

    const name = defaultAccountName(team.name);
    const { data: client, error } = await admin
      .from("clients")
      .insert({ name, platform: "Meta", status: "testing", monthly_budget: 0 })
      .select("id")
      .single();
    if (error || !client) {
      return { ok: false, error: error?.message ?? "Could not set up your account." };
    }

    const { error: linkErr } = await admin
      .from("team_accounts")
      .upsert(
        { team_id: team.id, client_id: client.id },
        { onConflict: "team_id,client_id" }
      );
    if (linkErr) {
      return { ok: false, error: `Account created, but linking failed: ${linkErr.message}` };
    }

    const clientId = String(client.id);
    await patchState(access.userId, {
      onboarding_started: true,
      account_client_id: client.id,
      onboarding_step: 2,
    });
    await logOnboardingEvent("account_created", 2, { clientId });
    return { ok: true, clientId, name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not set up your account." };
  }
}

// Optional inline rename of the tour account (so the auto-name isn't final).
export async function renameOnboardingAccountAction(
  nameRaw: string
): Promise<VoidResult> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };
  const name = (nameRaw ?? "").trim();
  if (!name) return { ok: false, error: "Please enter a name." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };
  try {
    const state = await getOnboardingState(access.userId);
    if (!state.accountClientId) return { ok: false, error: "No account yet." };
    const admin = createAdminClient();
    const { error } = await admin
      .from("clients")
      .update({ name })
      .eq("id", state.accountClientId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not rename." };
  }
}

// Which platforms the tour account has connected via Meta OAuth (for the "✓
// connected" state). Scoped to the user's own account.
export async function getConnectedPlatformsAction(
  clientId: string
): Promise<Result<{ platforms: string[] }>> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };
  try {
    // Confirm the account really belongs to this user before reading it.
    const state = await getOnboardingState(access.userId);
    if (state.accountClientId !== String(clientId)) {
      return { ok: false, error: "Unknown account." };
    }
    const admin = createAdminClient();
    const { data } = await admin
      .from("connected_meta_accounts")
      .select("platform")
      .eq("client_id", clientId);
    const platforms = Array.from(new Set((data ?? []).map((r) => String(r.platform))));
    if (platforms.length > 0) {
      await logOnboardingEvent("social_connected", 2, { platforms });
    }
    return { ok: true, platforms };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not check connection." };
  }
}

// Step 9 — save the first post FOR REAL, as status "check" (yellow / saved).
// Reuses the app's own saveProoferPostAction so the row is byte-for-byte a
// normal post; then reads its id back to remember it (dedupe on replay).
export async function saveFirstPostAction(input: {
  clientId: string;
  caption: string;
  mediaUrls: string[];
  postDate: string; // YYYY-MM-DD
  publishTime: string; // HH:MM
}): Promise<Result<{ postId: string }>> {
  const access = await requirePoster();
  if (!access) return { ok: false, error: "Not signed in." };

  const clientId = String(input.clientId ?? "").trim();
  const caption = String(input.caption ?? "");
  const postDate = String(input.postDate ?? "").trim();
  const publishTime = /^\d{2}:\d{2}$/.test(input.publishTime) ? input.publishTime : "18:00";
  const mediaUrls = Array.isArray(input.mediaUrls)
    ? input.mediaUrls.filter((u) => typeof u === "string" && u.trim())
    : [];

  if (!clientId) return { ok: false, error: "No account selected." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postDate)) return { ok: false, error: "Invalid date." };
  if (!caption.trim() && mediaUrls.length === 0) {
    return { ok: false, error: "Add a caption or an image first." };
  }

  try {
    // Guard: only the user's own tour account may be written here.
    const state = await getOnboardingState(access.userId);
    if (state.accountClientId !== clientId) {
      return { ok: false, error: "Unknown account." };
    }

    // Real save — ends as status "check" (yellow). Never proofed/green.
    await saveProoferPostAction(
      clientId,
      postDate,
      "instagram_feed",
      caption,
      mediaUrls,
      null,
      null,
      null,
      publishTime,
      ["instagram"]
    );

    const admin = createAdminClient();
    const { data: post } = await admin
      .from("proofer_posts")
      .select("id")
      .eq("client_id", clientId)
      .eq("post_date", postDate)
      .eq("platform", "instagram_feed")
      .maybeSingle();

    const postId = post?.id != null ? String(post.id) : "";
    await patchState(access.userId, {
      onboarding_started: true,
      first_post_id: post?.id ?? null,
      onboarding_step: 9,
    });
    await logOnboardingEvent("first_post_saved", 9, { postId });
    revalidatePath("/proofer");
    revalidatePath("/app/proofer");
    return { ok: true, postId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save your post." };
  }
}

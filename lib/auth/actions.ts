"use server";

// Server actions for the auth surface. Password auth runs here (not in the
// browser) so validation is authoritative and the Supabase call is never
// exposed to client JS.
//
// Flows:
//   - signInWithPassword   → redirect /post-login?next=<safeNext>
//   - sendPasswordReset    → reset link back to /auth/callback?type=recovery
//   - updatePassword       → redirect /post-login (viewer is authed via recovery session)
//   - signOut              → invalidate Supabase session, redirect /sign-in
//
// There is deliberately no public sign-up action. Admission is invite-only:
// new accounts are created by an admin via inviteMember (lib/auth/
// member-actions.ts), which is the only path that grants access. This removes
// the open self-service door that let unknown users/bots register.

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSafeNext } from "@/lib/auth/next";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { publicSignupEnabled } from "@/lib/auth/public-signup";

export type ActionState = {
  error?: string | null;
  fieldErrors?: Partial<Record<string, string[]>>;
  success?: boolean;
  message?: string;
};

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  next: z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Public self-serve sign-up. OFF unless ENABLE_PUBLIC_SIGNUP=true (see
// public-signup.ts) — this re-checks the flag server-side even if a client
// reaches the form. On success it creates the auth user and, for a genuinely
// new account, its personal team ("<First>'s Team", owner, free) via
// ensure_personal_team, fulfilling "sign up → you already have a team".
export async function signUpWithPassword(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  if (!publicSignupEnabled()) {
    return { error: "Sign-up is invite-only right now." };
  }

  try {
    await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Verification failed." };
  }

  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/callback?type=signup`,
    },
  });

  if (error) return { error: error.message };

  // Supabase obfuscates existing-email sign-ups by returning a user with no
  // identities. Only provision a personal team for a genuinely new account.
  const userId = data.user?.id;
  const isNewUser = (data.user?.identities?.length ?? 0) > 0;
  if (userId && isNewUser) {
    const firstName = parsed.data.fullName.split(/\s+/)[0] || parsed.data.fullName;
    const admin = createAdminClient();
    const { error: teamErr } = await admin.rpc("ensure_personal_team", {
      p_user: userId,
      p_name: `${firstName}'s Team`,
    });
    if (teamErr) {
      // Non-fatal — the account exists; the team can be created later.
      console.error("ensure_personal_team failed:", teamErr.message);
    }
  }

  // If email confirmation is disabled, sign-up returns a live session — go
  // straight in. Otherwise prompt the user to confirm via email.
  if (data.session) {
    redirect("/post-login");
  }

  return {
    success: true,
    message: "Check your email to confirm your account, then sign in.",
  };
}

export async function signInWithPassword(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Verification failed." };
  }

  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    next: (formData.get("next") as string) || undefined,
  };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  const next = getSafeNext(parsed.data.next);
  redirect(`/post-login?next=${encodeURIComponent(next)}`);
}

export async function sendPasswordReset(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Verification failed." };
  }

  const raw = { email: formData.get("email") as string };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  callbackUrl.searchParams.set("type", "recovery");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    return { error: error.message };
  }

  // Deliberately generic — don't leak whether the address exists.
  return {
    success: true,
    message: "If that address is registered, a reset link has been sent.",
  };
}

export async function updatePassword(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const raw = {
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
  };

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/post-login");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

"use server";

// Server actions for the auth surface. Password auth runs here (not in the
// browser) so validation is authoritative and the Supabase call is never
// exposed to client JS.
//
// Flows:
//   - signInWithPassword   → redirect /post-login?next=<safeNext>
//   - signUpWithPassword   → email-verify link back to /auth/callback
//   - sendPasswordReset    → reset link back to /auth/callback?type=recovery
//   - updatePassword       → redirect /post-login (viewer is authed via recovery session)
//   - signOut              → invalidate Supabase session, redirect /sign-in

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSafeNext } from "@/lib/auth/next";
import { verifyTurnstile } from "@/lib/auth/turnstile";

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

const signUpSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required."),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
    next: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
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

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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

export async function signUpWithPassword(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Verification failed." };
  }

  const raw = {
    fullName: formData.get("fullName") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
    next: (formData.get("next") as string) || undefined,
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  const safeNext = getSafeNext(parsed.data.next);
  if (safeNext !== "/post-login") callbackUrl.searchParams.set("next", safeNext);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: "Check your email for a confirmation link.",
  };
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

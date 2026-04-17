"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionState = {
  error?: string | null;
  fieldErrors?: Partial<Record<string, string[]>>;
};

const schema = z
  .object({
    fullName: z.string().min(1, "Full name is required."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function acceptInvite(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = schema.safeParse({
    fullName: formData.get("fullName") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { full_name: parsed.data.fullName },
  });

  if (error) return { error: error.message };

  redirect("/post-login");
}

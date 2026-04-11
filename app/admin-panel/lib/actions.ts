"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "./supabase";

export async function createAction(input: {
  clientId: string | null;
  title: string;
  priority: "low" | "medium" | "high";
  kind: "pause" | "scale" | "creative" | "review";
}) {
  const { error } = await supabase.from("actions").insert({
    client_id: input.clientId,
    title: input.title,
    priority: input.priority,
    kind: input.kind,
    is_complete: false,
  });

  if (error) {
    throw new Error(`Failed to create action: ${error.message}`);
  }

  revalidatePath("/admin-panel/dashboard");
}

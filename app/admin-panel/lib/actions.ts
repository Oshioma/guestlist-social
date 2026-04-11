"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export async function createAction(input: {
  clientId: string | null;
  title: string;
  priority: "low" | "medium" | "high";
  kind: "pause" | "scale" | "creative" | "review";
}) {
  const supabase = await createClient();

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

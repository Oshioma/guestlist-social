"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

const VALID_TAGS = [
  "creative",
  "process",
  "deadline",
  "budget",
  "strategy",
] as const;

export async function createMemory(formData: FormData) {
  const supabase = await createClient();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const tag = String(formData.get("tag") ?? "strategy").trim();

  if (!clientId) throw new Error("Please select a client.");
  if (!note) throw new Error("Note is required.");

  const safeTag = VALID_TAGS.includes(tag as (typeof VALID_TAGS)[number])
    ? tag
    : "strategy";

  const { error } = await supabase.from("memories").insert({
    client_id: clientId,
    note,
    tag: safeTag,
  });

  if (error) {
    console.error("createMemory error:", error);
    throw new Error("Could not save memory.");
  }

  revalidatePath("/app/memory");
}

export async function deleteMemory(memoryId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", memoryId);

  if (error) {
    console.error("deleteMemory error:", error);
    throw new Error("Could not delete memory.");
  }

  revalidatePath("/app/memory");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

function normalizeStatus(status: string) {
  if (status === "active" || status === "paused" || status === "onboarding") {
    return status;
  }
  return "onboarding";
}

export async function createClientAction(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "Meta").trim();
  const monthlyBudget = Number(formData.get("monthlyBudget") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "onboarding"));

  if (!name) {
    throw new Error("Client name is required.");
  }

  const dbStatus =
    status === "active"
      ? "growing"
      : status === "paused"
      ? "needs_attention"
      : "testing";

  const { error } = await supabase.from("clients").insert({
    name,
    platform,
    monthly_budget: monthlyBudget,
    status: dbStatus,
  });

  if (error) {
    console.error("createClientAction error:", error);
    throw new Error("Could not create client.");
  }

  revalidatePath("/app/clients");
  revalidatePath("/app/dashboard");
  redirect("/app/clients");
}

export async function updateClientAction(clientId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "Meta").trim();
  const monthlyBudget = Number(formData.get("monthlyBudget") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "onboarding"));

  if (!clientId) {
    throw new Error("Missing client id.");
  }

  if (!name) {
    throw new Error("Client name is required.");
  }

  const dbStatus =
    status === "active"
      ? "growing"
      : status === "paused"
      ? "needs_attention"
      : "testing";

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      platform,
      monthly_budget: monthlyBudget,
      status: dbStatus,
    })
    .eq("id", clientId);

  if (error) {
    console.error("updateClientAction error:", error);
    throw new Error("Could not update client.");
  }

  revalidatePath("/app/clients");
  revalidatePath("/app/dashboard");
  revalidatePath(`/app/clients/${clientId}`);
  redirect("/app/clients");
}

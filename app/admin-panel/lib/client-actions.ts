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
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

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
    website_url: websiteUrl || null,
    notes: notes || null,
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
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

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
      website_url: websiteUrl || null,
      notes: notes || null,
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

export async function archiveClientAction(clientId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({ archived: true })
    .eq("id", clientId);

  if (error) {
    console.error("archiveClientAction error:", error);
    throw new Error("Could not archive client.");
  }

  revalidatePath("/app/clients");
  revalidatePath("/app/dashboard");
  redirect("/app/clients");
}

export async function deleteClientAction(clientId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId);

  if (error) {
    console.error("deleteClientAction error:", error);
    throw new Error("Could not delete client.");
  }

  revalidatePath("/app/clients");
  revalidatePath("/app/dashboard");
  redirect("/app/clients");
}

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
  const industry = String(formData.get("industry") ?? "").trim();

  if (!name) {
    throw new Error("Client name is required.");
  }

  const dbStatus =
    status === "active"
      ? "growing"
      : status === "paused"
      ? "needs_attention"
      : "testing";

  const insertPayload: Record<string, unknown> = {
    name,
    platform,
    monthly_budget: monthlyBudget,
    status: dbStatus,
    website_url: websiteUrl || null,
    notes: notes || null,
  };

  if (industry) {
    insertPayload.industry = industry;
  }

  let { error } = await supabase.from("clients").insert(insertPayload);

  // If industry column doesn't exist, retry without it
  if (error && insertPayload.industry !== undefined) {
    delete insertPayload.industry;
    const retry = await supabase.from("clients").insert(insertPayload);
    error = retry.error;
  }

  if (error) {
    console.error("createClientAction error:", error);
    throw new Error("Could not create client.");
  }

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
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
  const industry = String(formData.get("industry") ?? "").trim();
  const metaAdAccountId = String(formData.get("metaAdAccountId") ?? "").trim();

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

  const updatePayload: Record<string, unknown> = {
    name,
    platform,
    monthly_budget: monthlyBudget,
    status: dbStatus,
    website_url: websiteUrl || null,
    notes: notes || null,
    meta_ad_account_id: metaAdAccountId || null,
  };

  if (industry) {
    updatePayload.industry = industry;
  }

  let { error } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", clientId);

  // If industry column doesn't exist, retry without it
  if (error && updatePayload.industry !== undefined) {
    delete updatePayload.industry;
    const retry = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", clientId);
    error = retry.error;
  }

  if (error) {
    console.error("updateClientAction error:", error);
    throw new Error("Could not update client.");
  }

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
  revalidatePath(`/admin-panel/clients/${clientId}`);
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

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
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

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
  redirect("/app/clients");
}

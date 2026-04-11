"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export async function createClientAction(input: {
  name: string;
  platform: string;
  monthlyBudget: number;
  status: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("clients").insert({
    name: input.name,
    platform: input.platform,
    monthly_budget: input.monthlyBudget,
    status: input.status,
  });

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  revalidatePath("/admin-panel/clients");
  redirect("/app/clients");
}

export async function updateClientAction(
  clientId: string,
  input: {
    name: string;
    platform: string;
    monthlyBudget: number;
    status: string;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({
      name: input.name,
      platform: input.platform,
      monthly_budget: input.monthlyBudget,
      status: input.status,
    })
    .eq("id", clientId);

  if (error) {
    throw new Error(`Failed to update client: ${error.message}`);
  }

  revalidatePath("/admin-panel/clients");
  redirect(`/app/clients/${clientId}`);
}

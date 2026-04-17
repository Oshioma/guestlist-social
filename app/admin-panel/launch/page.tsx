import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdsAccess } from "@/lib/auth/permissions";
import LaunchForm from "@/app/admin-panel/components/LaunchForm";

export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  await requireAdsAccess();
  const supabase = await createClient();

  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  const clients = (clientRows ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
  }));

  async function handleLaunch(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const clientId = String(formData.get("clientId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const audience = String(formData.get("audience") ?? "").trim();
    const budget = Number(formData.get("budget") ?? 0);
    const status = String(formData.get("status") ?? "live").trim();
    const objective = String(formData.get("objective") ?? "engagement").trim();

    if (!clientId) throw new Error("Please select a client.");
    if (!name) throw new Error("Campaign name is required.");

    const { error } = await supabase.from("campaigns").insert({
      client_id: clientId,
      name,
      objective,
      audience: audience || null,
      budget,
      status,
    });

    if (error) {
      console.error("Launch campaign error:", error);
      throw new Error("Could not create campaign.");
    }

    revalidatePath(`/admin-panel/clients/${clientId}`);
    revalidatePath("/admin-panel/dashboard");
    revalidatePath("/admin-panel/launch");
  }

  return <LaunchForm clients={clients} onLaunch={handleLaunch} />;
}

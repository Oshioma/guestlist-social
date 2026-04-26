import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "../../../../../../lib/supabase/server";
import { requireAdsAccess } from "@/lib/auth/permissions";
import { getCreativeSourcesForClient } from "@/lib/creative-sources";
import CampaignCreator from "../../../../components/CampaignCreator";
import ClientMemories from "../../../../components/ClientMemories";
import { createCampaignAction } from "../../../../lib/campaign-actions";
import { getCampaignSuggestions } from "../../../../lib/campaign-suggestions";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function NewCampaignPage({ params }: Props) {
  await requireAdsAccess();
  const { clientId } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: memoryRows }, suggestions] =
    await Promise.all([
      supabase.from("clients").select("name, industry, website_url").eq("id", clientId).single(),
      supabase
        .from("memories")
        .select("id, note, tag")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      getCampaignSuggestions(clientId),
    ]);

  if (error || !client) {
    notFound();
  }

  const memories = (memoryRows ?? []).map((m) => ({
    id: String(m.id),
    note: String(m.note),
    tag: String(m.tag),
  }));

  let creativeSources: Awaited<ReturnType<typeof getCreativeSourcesForClient>> = [];
  try {
    creativeSources = await getCreativeSourcesForClient(clientId);
  } catch { /* degrade gracefully */ }

  async function action(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";

    try {
      await createCampaignAction(clientId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not create campaign.",
      };
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/app/clients/${clientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
          }}
        >
          &larr; {client.name}
        </Link>
        <span style={{ color: "#d4d4d8" }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>New campaign</span>
      </div>

      <CampaignCreator
        clientId={clientId}
        clientIndustry={(client as any).industry ?? ""}
        clientWebsite={(client as any).website_url ?? ""}
        existingCreatives={creativeSources}
        action={action}
        suggestions={suggestions}
      />
    </div>
  );
}

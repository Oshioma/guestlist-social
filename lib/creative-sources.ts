import { createClient } from "./supabase/server";

export type CreativeSource = {
  url: string;
  name: string;
  source: "meta" | "ads" | "proofer";
  ctr?: number | null;
  spend?: number | null;
  status?: string | null;
};

const API_VERSION = "v25.0";

export async function getCreativeSourcesForClient(
  clientId: string
): Promise<CreativeSource[]> {
  const supabase = await createClient();
  const sources: CreativeSource[] = [];
  const seenUrls = new Set<string>();

  function add(item: CreativeSource) {
    if (!item.url || seenUrls.has(item.url)) return;
    seenUrls.add(item.url);
    sources.push(item);
  }

  // 1. From existing ads (with performance data)
  const { data: adRows } = await supabase
    .from("ads")
    .select(
      "creative_image_url, name, ctr, spend, performance_status"
    )
    .eq("client_id", clientId)
    .not("creative_image_url", "is", null)
    .order("performance_score", { ascending: false })
    .limit(30);

  for (const row of adRows ?? []) {
    if (row.creative_image_url) {
      add({
        url: row.creative_image_url,
        name: row.name ?? "Ad creative",
        source: "ads",
        ctr: row.ctr != null ? Number(row.ctr) : null,
        spend: row.spend != null ? Number(row.spend) : null,
        status: row.performance_status,
      });
    }
  }

  // 2. From proofer posts (organic content that could work as ads)
  const { data: prooferRows } = await supabase
    .from("proofer_posts")
    .select("image_url, media_urls, caption, post_date")
    .eq("client_id", clientId)
    .not("image_url", "is", null)
    .order("post_date", { ascending: false })
    .limit(30);

  for (const row of prooferRows ?? []) {
    const imageUrl = row.image_url as string | null;
    if (imageUrl) {
      const caption = (row.caption as string) ?? "";
      add({
        url: imageUrl,
        name: caption.slice(0, 60) || `Post ${row.post_date}`,
        source: "proofer",
      });
    }
    const mediaUrls = Array.isArray(row.media_urls) ? row.media_urls : [];
    for (const mUrl of mediaUrls) {
      if (typeof mUrl === "string" && mUrl && !mUrl.match(/\.(mp4|mov|webm)/i)) {
        add({
          url: mUrl,
          name: `Post ${row.post_date}`,
          source: "proofer",
        });
      }
    }
  }

  // 3. Meta ad account creatives — skipped for the picker because Meta
  // CDN URLs (thumbnail_url, image_url) are temporary and expire. When
  // used in a new ad creative, Meta rejects them. Only permanent URLs
  // (Supabase Storage from our own uploads) are reliable for ad creation.

  return sources;
}

import { createClient } from "./supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";

export type CreativeSource = {
  url: string;
  name: string;
  source: "meta" | "ads" | "proofer" | "storage";
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

  // 3. From client photo library (site images + uploads from edit page)
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey) {
      const admin = createAdminSupabase(sbUrl, sbKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const [siteRes, uploadRes] = await Promise.all([
        admin.from("client_site_images").select("id, public_url").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30),
        admin.from("client_upload_images").select("id, public_url").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30),
      ]);

      for (const row of siteRes.data ?? []) {
        if (row.public_url) {
          add({ url: row.public_url, name: "Website image", source: "storage" });
        }
      }
      for (const row of uploadRes.data ?? []) {
        if (row.public_url) {
          add({ url: row.public_url, name: "Uploaded image", source: "storage" });
        }
      }

      // Also check storage bucket folders
      const folders = [`ad-creatives/${clientId}`, `proofer/${clientId}`];
      for (const folder of folders) {
        const { data: files } = await admin.storage
          .from("postimages")
          .list(folder, { limit: 20, sortBy: { column: "created_at", order: "desc" } });
        for (const file of files ?? []) {
          if (file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const { data: urlData } = admin.storage.from("postimages").getPublicUrl(`${folder}/${file.name}`);
            if (urlData?.publicUrl) {
              add({ url: urlData.publicUrl, name: file.name, source: "storage" });
            }
          }
        }
      }
    }
  } catch { /* storage listing is best-effort */ }

  return sources;
}

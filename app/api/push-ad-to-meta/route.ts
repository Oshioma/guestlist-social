import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaAd } from "@/lib/meta-ad-create";

// Reaches an external service (Meta ad writes); the platform default is not a
// safe assumption for it.
export const maxDuration = 60;


export async function POST(req: Request) {
  try {
    const { adId } = await req.json();
    if (!adId) {
      return NextResponse.json({ ok: false, error: "adId required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: ad, error: adErr } = await supabase
      .from("ads")
      .select("*, campaigns(meta_adset_id)")
      .eq("id", adId)
      .single();

    if (adErr || !ad) {
      return NextResponse.json({ ok: false, error: "Ad not found" }, { status: 404 });
    }

    if (ad.meta_id) {
      return NextResponse.json({ ok: true, alreadyExists: true, metaId: ad.meta_id });
    }

    const adsetMetaId = (ad.campaigns as any)?.meta_adset_id;
    if (!adsetMetaId) {
      return NextResponse.json(
        { ok: false, error: "Campaign has no Meta ad set. Create the campaign with Meta first." },
        { status: 400 }
      );
    }

    const result = await createMetaAd({
      adsetMetaId,
      name: ad.name ?? "Untitled ad",
      imageUrl: ad.creative_image_url ?? "",
      headline: ad.creative_headline ?? "",
      body: ad.creative_body ?? "",
      ctaType: ad.creative_cta ?? "learn_more",
      // A real ad pointed at example.com is worse than an obvious failure, so
      // make the substitution loud even though it stays permissive for ads
      // saved before the destination column existed.
      destinationUrl: ad.creative_destination_url ?? "https://example.com",
    });

    if (!ad.creative_destination_url) {
      console.error(
        `push-ad-to-meta: ad has no destination URL — pushing to Meta with the example.com placeholder`
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: `Meta ${result.step}: ${result.error}` },
        { status: 500 }
      );
    }

    await supabase
      .from("ads")
      .update({ meta_id: result.adId })
      .eq("id", adId);

    return NextResponse.json({ ok: true, metaId: result.adId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/ai-creative
 *
 * Two modes:
 *   1. Always: generates a creative brief (text description of ideal image)
 *   2. When enabled: generates an actual image via DALL-E and uploads to
 *      Supabase Storage, returning a public URL the ad form can use.
 *
 * Body: { clientId, objective, campaignName, headline?, body? }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getAiSourceSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing supabase env vars.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY not configured." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const clientId = String(body.clientId ?? "");
    const objective = String(body.objective ?? "engagement");
    const campaignName = String(body.campaignName ?? "");
    const headline = String(body.headline ?? "");
    const adBody = String(body.body ?? "");

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const sources = await getAiSourceSettings(supabase);

    // Gather context about winning creative styles
    const context: string[] = [];

    const { data: client } = await supabase
      .from("clients")
      .select("name, industry")
      .eq("id", clientId)
      .single();

    if (client) {
      context.push(`Client: ${client.name}, Industry: ${client.industry ?? "unknown"}`);
    }

    const { data: winners } = await supabase
      .from("ads")
      .select("name, creative_image_url, hook_type, format_style, ctr, creative_headline")
      .eq("client_id", clientId)
      .eq("performance_status", "winner")
      .not("creative_image_url", "is", null)
      .order("performance_score", { ascending: false })
      .limit(5);

    if (winners && winners.length > 0) {
      context.push("Winning creative styles:");
      for (const w of winners) {
        const parts = [
          w.format_style ? `format: ${w.format_style}` : null,
          w.hook_type ? `hook: ${w.hook_type}` : null,
          w.ctr ? `CTR: ${Number(w.ctr).toFixed(1)}%` : null,
          w.creative_headline ? `headline: "${w.creative_headline}"` : null,
        ].filter(Boolean);
        context.push(`  - ${parts.join(", ")}`);
      }
    }

    // Generate brief via Claude
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const briefPrompt = `You are an expert ad creative director.

Client: ${client?.name ?? "Unknown"} (${client?.industry ?? "unknown industry"})
Campaign: "${campaignName || "New campaign"}"
Objective: ${objective}
${headline ? `Headline: "${headline}"` : ""}
${adBody ? `Body copy: "${adBody}"` : ""}

${context.length > 0 ? context.join("\n") : "No historical creative data."}

Write a creative brief for the ad image. Be VERY specific and visual — this will be used to generate the image or brief a designer.

Format EXACTLY:
BRIEF: [1-2 sentence description of the ideal image — include: subject, setting, lighting, mood, colours, angle, style (photo/illustration/flat lay)]
RATIONALE: [1 sentence on why this visual approach works for this client + objective]
DALLE_PROMPT: [A detailed DALL-E prompt that would generate this image — include style, composition, mood, no text in image]`;

    const briefMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: briefPrompt }],
    });

    const briefText = briefMessage.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const briefMatch = briefText.match(/BRIEF:\s*([\s\S]*?)(?:RATIONALE:|$)/i);
    const rationaleMatch = briefText.match(/RATIONALE:\s*([\s\S]*?)(?:DALLE_PROMPT:|$)/i);
    const dalleMatch = briefText.match(/DALLE_PROMPT:\s*([\s\S]*?)$/i);

    const brief = (briefMatch?.[1] ?? "").trim();
    const rationale = (rationaleMatch?.[1] ?? "").trim();
    const dallePrompt = (dalleMatch?.[1] ?? "").trim();

    // If image generation is enabled and we have an OpenAI key, generate
    const openaiKey = process.env.OPENAI_API_KEY;
    let generatedImageUrl: string | null = null;

    if (sources.imageGeneration && openaiKey && dallePrompt) {
      try {
        const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: `Professional Facebook/Instagram ad image. ${dallePrompt}. No text, no words, no letters in the image.`,
            n: 1,
            size: "1024x1024",
            quality: "standard",
          }),
        });

        if (dalleRes.ok) {
          const dalleData = await dalleRes.json();
          const tempUrl = dalleData.data?.[0]?.url;

          if (tempUrl) {
            // Download the image and upload to Supabase Storage so the
            // URL doesn't expire (DALL-E URLs are temporary)
            const imageRes = await fetch(tempUrl);
            if (imageRes.ok) {
              const imageBlob = await imageRes.blob();
              const fileName = `ai-generated/${Date.now()}_${clientId}.png`;

              const { error: uploadErr } = await supabase.storage
                .from("postimages")
                .upload(fileName, imageBlob, {
                  contentType: "image/png",
                  upsert: false,
                });

              if (!uploadErr) {
                const { data: publicUrl } = supabase.storage
                  .from("postimages")
                  .getPublicUrl(fileName);
                generatedImageUrl = publicUrl.publicUrl;
              }
            }
          }
        }
      } catch {
        // Image gen failed — brief still works, degrade gracefully
      }
    }

    return NextResponse.json({
      ok: true,
      brief,
      rationale,
      dallePrompt,
      generatedImageUrl,
      imageGenerationEnabled: sources.imageGeneration && !!openaiKey,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

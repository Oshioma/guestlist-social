/**
 * POST /api/ai-write-ad-copy
 *
 * AI generates headline + body + CTA for an ad, using the same data
 * sources as /api/ai-suggest but returning all three fields at once.
 *
 * Body: { clientId, objective, campaignName, imageDescription? }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getAiSourceSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

const GRAPH_VERSION = "v19.0";

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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY not configured." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const clientId = String(body.clientId ?? "");
    const objective = String(body.objective ?? "engagement");
    const campaignName = String(body.campaignName ?? "");
    const imageDescription = String(body.imageDescription ?? "");

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const sources = await getAiSourceSettings(supabase);
    const context: string[] = [];

    // Internal data
    if (sources.internalData) {
      const { data: client } = await supabase
        .from("clients")
        .select("name, industry, notes")
        .eq("id", clientId)
        .single();

      if (client) {
        context.push(`Client: ${client.name}, Industry: ${client.industry ?? "unknown"}`);
        if (client.notes) context.push(`Notes: ${client.notes}`);
      }

      const { data: winners } = await supabase
        .from("ads")
        .select("creative_headline, creative_body, creative_cta, ctr, hook_type")
        .eq("client_id", clientId)
        .eq("performance_status", "winner")
        .order("performance_score", { ascending: false })
        .limit(5);

      if (winners && winners.length > 0) {
        context.push("Winning ad copy from this client:");
        for (const w of winners) {
          const parts = [
            w.creative_headline ? `headline: "${w.creative_headline}"` : null,
            w.creative_body ? `body: "${(w.creative_body as string).slice(0, 100)}"` : null,
            w.creative_cta ? `CTA: ${w.creative_cta}` : null,
            w.ctr ? `CTR: ${Number(w.ctr).toFixed(2)}%` : null,
            w.hook_type ? `hook: ${w.hook_type}` : null,
          ].filter(Boolean);
          context.push(`  - ${parts.join(", ")}`);
        }
      }

      // Losing ads — what to avoid
      const { data: losers } = await supabase
        .from("ads")
        .select("creative_headline, creative_body, ctr, performance_reason")
        .eq("client_id", clientId)
        .eq("performance_status", "losing")
        .order("performance_score", { ascending: true })
        .limit(3);

      if (losers && losers.length > 0) {
        context.push("AVOID these patterns (they failed):");
        for (const l of losers) {
          const parts = [
            l.creative_headline ? `headline: "${l.creative_headline}"` : null,
            l.ctr ? `CTR: ${Number(l.ctr).toFixed(2)}%` : null,
            l.performance_reason ? `reason: ${l.performance_reason}` : null,
          ].filter(Boolean);
          context.push(`  ✗ ${parts.join(", ")}`);
        }
      }

      const { data: posts } = await supabase
        .from("proofer_posts")
        .select("caption")
        .eq("client_id", clientId)
        .not("caption", "is", null)
        .order("post_date", { ascending: false })
        .limit(3);

      if (posts && posts.length > 0) {
        context.push("Recent organic captions (brand voice):");
        for (const p of posts) {
          if (p.caption) context.push(`  - "${(p.caption as string).slice(0, 120)}"`);
        }
      }
    }

    // Meta Ad Library
    if (sources.metaAdLibrary) {
      try {
        const token = process.env.META_ACCESS_TOKEN;
        const { data: client } = await supabase
          .from("clients")
          .select("industry, name")
          .eq("id", clientId)
          .single();

        const searchTerm = client?.industry ?? client?.name ?? "";
        if (token && searchTerm) {
          const url = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive?search_terms=${encodeURIComponent(searchTerm)}&ad_reached_countries=GB&ad_active_status=ACTIVE&fields=ad_creative_bodies,ad_creative_link_titles,page_name&limit=8&access_token=${token}`;
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const ads = data.data ?? [];
            if (ads.length > 0) {
              context.push(`Competitor ads running now in "${searchTerm}":`);
              for (const ad of ads.slice(0, 6)) {
                const titles = (ad.ad_creative_link_titles ?? []).slice(0, 1);
                const bodies = (ad.ad_creative_bodies ?? []).slice(0, 1);
                const parts = [
                  ad.page_name ? `by ${ad.page_name}` : null,
                  titles[0] ? `headline: "${titles[0]}"` : null,
                  bodies[0] ? `copy: "${(bodies[0] as string).slice(0, 80)}"` : null,
                ].filter(Boolean);
                context.push(`  - ${parts.join(", ")}`);
              }
            }
          }
        }
      } catch { /* degrade gracefully */ }
    }

    // Client website
    if (sources.clientWebsite && sources.clientWebsiteUrl) {
      try {
        const res = await fetch(sources.clientWebsiteUrl, {
          headers: { "User-Agent": "GuestlistSocial/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
          if (titleMatch || descMatch) {
            context.push(`Client website:`);
            if (titleMatch) context.push(`  Title: ${titleMatch[1].trim()}`);
            if (descMatch) context.push(`  Description: ${descMatch[1].trim()}`);
          }
        }
      } catch { /* degrade gracefully */ }
    }

    const contextBlock = context.length > 0
      ? context.join("\n")
      : "No historical data available — use general best practices.";

    const prompt = `You are an expert Facebook/Instagram ad copywriter for a social media agency.

Campaign: "${campaignName || "New campaign"}"
Objective: ${objective}
${imageDescription ? `Image being used: ${imageDescription}` : ""}

${contextBlock}

Write ad copy for this campaign. You are a senior copywriter who writes ads that CONVERT, not just sound nice.

Return EXACTLY this JSON format (no markdown, no code fences):
{"headline":"your headline here (max 40 chars)","body":"your body text here (max 125 chars for primary line)","cta":"one of: learn_more, shop_now, sign_up, contact_us, book_now, apply_now, watch_more, download, get_quote","reasoning":"2 sentences explaining your choices, referencing specific data"}

RULES:
- Headline: punchy, under 40 chars, mention the actual product/service by name
- Body: hook attention in first line, under 125 chars, use the brand voice from their organic posts
- If winning ads had certain headlines/hooks that got high CTR, use similar patterns
- If losing ads had certain copy that failed, avoid those patterns
- CTA must match the objective: traffic→Learn More, conversions→Shop Now, leads→Sign Up
- Reference what competitors are running and differentiate
- NO generic marketing fluff like "Elevate your experience" — be specific to THIS business
- Write like a human, not a marketing textbook`;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Parse JSON from Claude's response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: "AI returned unexpected format" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      headline: string;
      body: string;
      cta: string;
      reasoning: string;
    };

    return NextResponse.json({
      ok: true,
      headline: parsed.headline,
      body: parsed.body,
      cta: parsed.cta,
      reasoning: parsed.reasoning,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

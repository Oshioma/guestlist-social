/**
 * POST /api/ai-suggest-all
 *
 * Batch endpoint: generates suggestions for all fields in one Claude call.
 * Returns { audience, headline, budget } each with suggestion + reasoning.
 * Used by the campaign form to pre-load suggestions on page load.
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
      return NextResponse.json({ ok: false, error: "No ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const clientId = String(body.clientId ?? "");
    const objective = String(body.objective ?? "engagement");

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const sources = await getAiSourceSettings(supabase);
    const context: string[] = [];

    if (sources.internalData) {
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
        .select("name, audience, ctr, spend, creative_headline, creative_cta, hook_type")
        .eq("client_id", clientId)
        .eq("performance_status", "winner")
        .order("performance_score", { ascending: false })
        .limit(3);

      if (winners && winners.length > 0) {
        context.push("Top winners:");
        for (const w of winners) {
          const parts = [
            w.audience ? `audience: ${w.audience}` : null,
            w.ctr ? `CTR: ${Number(w.ctr).toFixed(1)}%` : null,
            w.spend ? `£${Number(w.spend).toFixed(0)} spend` : null,
            w.creative_headline ? `headline: "${w.creative_headline}"` : null,
          ].filter(Boolean);
          context.push(`  - ${parts.join(", ")}`);
        }
      }

      const { data: playbook } = await supabase
        .from("client_playbooks")
        .select("category, insight")
        .eq("client_id", clientId)
        .order("avg_reliability", { ascending: false })
        .limit(3);

      if (playbook && playbook.length > 0) {
        context.push("Playbook: " + playbook.map((p) => p.insight).join("; "));
      }
    }

    if (sources.metaAdLibrary) {
      try {
        const token = process.env.META_ACCESS_TOKEN;
        const { data: client } = await supabase
          .from("clients")
          .select("industry")
          .eq("id", clientId)
          .single();
        const term = client?.industry ?? "";
        if (token && term) {
          const url = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive?search_terms=${encodeURIComponent(term)}&ad_reached_countries=GB&ad_active_status=ACTIVE&fields=ad_creative_link_titles,ad_creative_bodies&limit=5&access_token=${token}`;
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const ads = data.data ?? [];
            if (ads.length > 0) {
              context.push("Competitor ads: " + ads.slice(0, 3).map((a: any) =>
                (a.ad_creative_link_titles?.[0] ?? "") + " — " + ((a.ad_creative_bodies?.[0] ?? "") as string).slice(0, 60)
              ).join("; "));
            }
          }
        }
      } catch { /* skip */ }
    }

    const contextBlock = context.length > 0 ? context.join("\n") : "No data yet.";

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are an expert Facebook/Instagram ads strategist. Based on this data, give quick suggestions for a ${objective} campaign.

${contextBlock}

Return EXACTLY this JSON (no markdown, no fences):
{"audience":{"suggestion":"short suggestion (max 60 chars)","reasoning":"1 sentence why"},"budget":{"suggestion":"£X–£Y/day","reasoning":"1 sentence why"},"headline":{"suggestion":"short headline suggestion (max 40 chars)","reasoning":"1 sentence why"}}

Be specific. Use the data. Keep suggestions SHORT — they appear as one-liners next to form fields.`,
      }],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: "Unexpected format" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, suggestions: parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

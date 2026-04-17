/**
 * POST /api/ai-suggest-all
 *
 * Batch endpoint: generates suggestions for all campaign fields in one
 * Claude call. Gathers rich context from: client profile, winning ads,
 * losing ads, organic captions, playbook, competitor ads.
 *
 * Body: { clientId, objective }
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
      // Client profile — name, industry, notes, website
      const { data: client } = await supabase
        .from("clients")
        .select("name, industry, notes, website, platform")
        .eq("id", clientId)
        .single();

      if (client) {
        context.push(`CLIENT PROFILE:`);
        context.push(`Name: ${client.name}`);
        context.push(`Industry: ${client.industry ?? "not set"}`);
        if (client.website) context.push(`Website: ${client.website}`);
        if (client.notes) context.push(`Notes: ${client.notes}`);
      }

      // Per-client AI instructions
      const { data: clientFull } = await supabase
        .from("clients")
        .select("ai_instructions")
        .eq("id", clientId)
        .single();
      if (clientFull?.ai_instructions) {
        context.push(`\nCLIENT-SPECIFIC RULES (always follow for this client):\n${clientFull.ai_instructions}`);
      }

      // Winning ads — what worked, with detail
      const { data: winners } = await supabase
        .from("ads")
        .select("name, audience, ctr, spend, creative_headline, creative_body, creative_cta, hook_type, format_style")
        .eq("client_id", clientId)
        .eq("performance_status", "winner")
        .order("performance_score", { ascending: false })
        .limit(5);

      if (winners && winners.length > 0) {
        context.push(`\nWINNING ADS (what worked):`);
        for (const w of winners) {
          const parts = [
            `"${w.name}"`,
            w.audience ? `targeted: ${w.audience}` : null,
            w.ctr ? `CTR: ${Number(w.ctr).toFixed(2)}%` : null,
            w.spend ? `spent £${Number(w.spend).toFixed(0)}` : null,
            w.creative_headline ? `headline: "${w.creative_headline}"` : null,
            w.creative_body ? `copy: "${(w.creative_body as string).slice(0, 80)}"` : null,
            w.creative_cta ? `CTA: ${w.creative_cta}` : null,
            w.hook_type ? `hook style: ${w.hook_type}` : null,
          ].filter(Boolean);
          context.push(`  ✓ ${parts.join(", ")}`);
        }
      }

      // Losing ads — what to avoid
      const { data: losers } = await supabase
        .from("ads")
        .select("name, audience, ctr, spend, creative_headline, creative_body, performance_reason")
        .eq("client_id", clientId)
        .eq("performance_status", "losing")
        .order("performance_score", { ascending: true })
        .limit(3);

      if (losers && losers.length > 0) {
        context.push(`\nLOSING ADS (avoid these patterns):`);
        for (const l of losers) {
          const parts = [
            `"${l.name}"`,
            l.audience ? `targeted: ${l.audience}` : null,
            l.ctr ? `CTR: ${Number(l.ctr).toFixed(2)}%` : null,
            l.spend ? `spent £${Number(l.spend).toFixed(0)}` : null,
            l.creative_headline ? `headline: "${l.creative_headline}"` : null,
            l.performance_reason ? `failed because: ${l.performance_reason}` : null,
          ].filter(Boolean);
          context.push(`  ✗ ${parts.join(", ")}`);
        }
      }

      // Organic captions — the brand voice
      const { data: posts } = await supabase
        .from("proofer_posts")
        .select("caption")
        .eq("client_id", clientId)
        .not("caption", "is", null)
        .order("post_date", { ascending: false })
        .limit(5);

      if (posts && posts.length > 0) {
        const captions = posts
          .map((p) => p.caption as string)
          .filter((c) => c && c.length > 20);
        if (captions.length > 0) {
          context.push(`\nBRAND VOICE (from their organic posts — match this tone):`);
          for (const c of captions.slice(0, 3)) {
            context.push(`  "${c.slice(0, 120)}"`);
          }
        }
      }

      // Playbook insights
      const { data: playbook } = await supabase
        .from("client_playbooks")
        .select("category, insight, avg_reliability")
        .eq("client_id", clientId)
        .order("avg_reliability", { ascending: false })
        .limit(5);

      if (playbook && playbook.length > 0) {
        context.push(`\nPROVEN PLAYBOOK RULES:`);
        for (const p of playbook) {
          context.push(`  • ${p.insight} (${Math.round(Number(p.avg_reliability))}% reliable)`);
        }
      }
    }

    // Competitor ads from Meta Ad Library
    if (sources.metaAdLibrary) {
      try {
        const token = process.env.META_ACCESS_TOKEN;
        const { data: client } = await supabase
          .from("clients")
          .select("industry, name")
          .eq("id", clientId)
          .single();
        const term = client?.industry || client?.name || "";
        if (token && term) {
          const url = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive?search_terms=${encodeURIComponent(term)}&ad_reached_countries=GB&ad_active_status=ACTIVE&fields=ad_creative_link_titles,ad_creative_bodies,page_name&limit=8&access_token=${token}`;
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const ads = data.data ?? [];
            if (ads.length > 0) {
              context.push(`\nCOMPETITOR ADS RUNNING RIGHT NOW in "${term}" (UK):`);
              for (const a of ads.slice(0, 5)) {
                const title = a.ad_creative_link_titles?.[0] ?? "";
                const body = (a.ad_creative_bodies?.[0] ?? "") as string;
                const page = a.page_name ?? "";
                if (title || body) {
                  context.push(`  • ${page}: "${title}" — "${body.slice(0, 100)}"`);
                }
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    // Client website scrape
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
            context.push(`\nCLIENT WEBSITE:`);
            if (titleMatch) context.push(`  Title: ${titleMatch[1].trim()}`);
            if (descMatch) context.push(`  Description: ${descMatch[1].trim()}`);
          }
        }
      } catch { /* skip */ }
    }

    if (sources.customInstructions) {
      context.push(`\nAGENCY CUSTOM RULES (always follow these):\n${sources.customInstructions}`);
    }

    const contextBlock = context.length > 0 ? context.join("\n") : "No historical data available yet — use general best practices for a new account.";

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `You are a senior paid social strategist at a performance marketing agency. You've managed millions in ad spend across Facebook and Instagram. You give specific, actionable advice — never generic marketing fluff.

A colleague is setting up a new ${objective} campaign for this client:

${contextBlock}

Based on everything above, suggest:

1. CAMPAIGN NAME: A specific, memorable campaign name that reflects the brand and objective. Not generic — reference the actual product/service.

2. BUDGET: A specific daily budget in £. Factor in: what spend levels produced winners for this client, minimum to get meaningful data for ${objective} campaigns, and what competitors are likely spending.

3. AUDIENCE: A specific target audience with age range, location, interests. Reference what audiences worked in winning ads and avoid what failed in losing ads.

Return EXACTLY this JSON (no markdown, no code fences):
{"audience":{"suggestion":"specific audience description","reasoning":"why this audience, referencing the data"},"budget":{"suggestion":"£X/day","reasoning":"why this amount"},"headline":{"suggestion":"specific campaign name","reasoning":"why this name"}}

RULES:
- Be SPECIFIC to this client. Reference their actual products, services, winning patterns.
- If winners used certain audiences/hooks that worked, lean into those.
- If losers failed with certain approaches, explicitly avoid them.
- Match the brand voice from their organic posts.
- Keep suggestions SHORT (max 60 chars) but specific.
- Budget suggestion should be a single number like "£15/day", not a range.`
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

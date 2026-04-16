/**
 * POST /api/ai-suggest
 *
 * Per-field AI suggestions for the campaign creation form.
 * Reads internal data + optional external sources, sends to Claude,
 * returns a suggestion + reasoning.
 *
 * Body: { clientId, field, objective?, budget?, campaignName? }
 * field: "audience" | "headline" | "body" | "cta" | "budget" | "creative"
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getAiSourceSettings, type AiSourceSettings } from "@/lib/app-settings";

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

type Field = "audience" | "headline" | "body" | "cta" | "budget" | "creative";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY not configured. Add it in Settings → Vercel env vars." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const clientId = String(body.clientId ?? "");
    const field = String(body.field ?? "") as Field;
    const objective = String(body.objective ?? "engagement");
    const budget = Number(body.budget ?? 0);
    const campaignName = String(body.campaignName ?? "");

    if (!clientId || !field) {
      return NextResponse.json({ ok: false, error: "clientId and field required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const sources = await getAiSourceSettings(supabase);

    // Gather context from enabled sources
    const context: string[] = [];

    if (sources.internalData) {
      const internal = await gatherInternalData(supabase, clientId, field);
      if (internal) context.push(internal);
    }

    if (sources.metaAdLibrary) {
      const adLibrary = await gatherMetaAdLibrary(clientId, supabase);
      if (adLibrary) context.push(adLibrary);
    }

    if (sources.clientWebsite && sources.clientWebsiteUrl) {
      const website = await gatherWebsiteData(sources.clientWebsiteUrl);
      if (website) context.push(website);
    }

    const prompt = buildPrompt(field, objective, budget, campaignName, context);

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Parse suggestion and reasoning from Claude's response
    const suggestionMatch = text.match(/SUGGESTION:\s*([\s\S]*?)(?:REASONING:|$)/i);
    const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)$/i);

    const suggestion = (suggestionMatch?.[1] ?? text).trim();
    const reasoning = (reasoningMatch?.[1] ?? "").trim();

    return NextResponse.json({
      ok: true,
      field,
      suggestion,
      reasoning,
      sourcesUsed: {
        internal: sources.internalData,
        metaAdLibrary: sources.metaAdLibrary,
        clientWebsite: sources.clientWebsite && !!sources.clientWebsiteUrl,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function gatherInternalData(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string,
  field: Field
): Promise<string | null> {
  const parts: string[] = ["INTERNAL DATA:"];

  // Client info
  const { data: client } = await supabase
    .from("clients")
    .select("name, industry, notes")
    .eq("id", clientId)
    .single();
  if (client) {
    parts.push(`Client: ${client.name}, Industry: ${client.industry ?? "unknown"}`);
    if (client.notes) parts.push(`Notes: ${client.notes}`);
  }

  // Winning ads
  const { data: winners } = await supabase
    .from("ads")
    .select("name, audience, ctr, spend, creative_headline, creative_body, creative_cta, hook_type, format_style, performance_status")
    .eq("client_id", clientId)
    .eq("performance_status", "winner")
    .order("performance_score", { ascending: false })
    .limit(5);

  if (winners && winners.length > 0) {
    parts.push(`\nTop ${winners.length} winning ads:`);
    for (const w of winners) {
      const details = [
        w.name,
        w.audience ? `audience: ${w.audience}` : null,
        w.ctr ? `CTR: ${Number(w.ctr).toFixed(2)}%` : null,
        w.spend ? `spend: £${Number(w.spend).toFixed(0)}` : null,
        w.creative_headline ? `headline: "${w.creative_headline}"` : null,
        w.creative_body ? `body: "${(w.creative_body as string).slice(0, 100)}"` : null,
        w.creative_cta ? `CTA: ${w.creative_cta}` : null,
        w.hook_type ? `hook: ${w.hook_type}` : null,
        w.format_style ? `format: ${w.format_style}` : null,
      ].filter(Boolean);
      parts.push(`  - ${details.join(", ")}`);
    }
  }

  // Losing ads (to avoid)
  const { data: losers } = await supabase
    .from("ads")
    .select("name, audience, ctr, creative_headline, creative_cta")
    .eq("client_id", clientId)
    .eq("performance_status", "losing")
    .order("performance_score", { ascending: true })
    .limit(3);

  if (losers && losers.length > 0) {
    parts.push(`\nAds that performed poorly (avoid these patterns):`);
    for (const l of losers) {
      const details = [
        l.name,
        l.audience ? `audience: ${l.audience}` : null,
        l.ctr ? `CTR: ${Number(l.ctr).toFixed(2)}%` : null,
        l.creative_headline ? `headline: "${l.creative_headline}"` : null,
      ].filter(Boolean);
      parts.push(`  - ${details.join(", ")}`);
    }
  }

  // Playbook
  const { data: playbook } = await supabase
    .from("client_playbooks")
    .select("category, insight, avg_reliability")
    .eq("client_id", clientId)
    .order("avg_reliability", { ascending: false })
    .limit(5);

  if (playbook && playbook.length > 0) {
    parts.push(`\nClient playbook insights:`);
    for (const p of playbook) {
      parts.push(`  - [${p.category}] ${p.insight} (${Math.round(Number(p.avg_reliability))}% reliable)`);
    }
  }

  // Global learnings
  const { data: globals } = await supabase
    .from("global_learnings")
    .select("pattern_label, action_summary, consistency_score, unique_clients")
    .gte("unique_clients", 2)
    .order("consistency_score", { ascending: false })
    .limit(5);

  if (globals && globals.length > 0) {
    parts.push(`\nAgency-wide patterns (across all clients):`);
    for (const g of globals) {
      parts.push(`  - ${g.action_summary ?? g.pattern_label} (${Math.round(Number(g.consistency_score))}% consistent, ${g.unique_clients} clients)`);
    }
  }

  // Proofer captions (organic voice)
  if (field === "body" || field === "headline") {
    const { data: posts } = await supabase
      .from("proofer_posts")
      .select("caption")
      .eq("client_id", clientId)
      .not("caption", "is", null)
      .order("post_date", { ascending: false })
      .limit(5);

    if (posts && posts.length > 0) {
      parts.push(`\nRecent organic post captions (brand voice reference):`);
      for (const p of posts) {
        if (p.caption) parts.push(`  - "${(p.caption as string).slice(0, 150)}"`);
      }
    }
  }

  return parts.length > 1 ? parts.join("\n") : null;
}

async function gatherMetaAdLibrary(
  clientId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<string | null> {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) return null;

    // Get client industry for search term
    const { data: client } = await supabase
      .from("clients")
      .select("industry, name")
      .eq("id", clientId)
      .single();

    const searchTerm = client?.industry ?? client?.name ?? "";
    if (!searchTerm) return null;

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive?search_terms=${encodeURIComponent(searchTerm)}&ad_reached_countries=GB&ad_active_status=ACTIVE&fields=ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,page_name&limit=10&access_token=${token}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const data = await res.json();
    const ads = data.data ?? [];
    if (ads.length === 0) return null;

    const parts: string[] = [`META AD LIBRARY — active ads in "${searchTerm}" (UK):`];
    for (const ad of ads.slice(0, 8)) {
      const titles = (ad.ad_creative_link_titles ?? []).slice(0, 2);
      const bodies = (ad.ad_creative_bodies ?? []).slice(0, 1);
      const page = ad.page_name ?? "Unknown";
      const details = [
        `page: ${page}`,
        titles.length > 0 ? `headline: "${titles[0]}"` : null,
        bodies.length > 0 ? `copy: "${(bodies[0] as string).slice(0, 120)}"` : null,
      ].filter(Boolean);
      parts.push(`  - ${details.join(", ")}`);
    }
    return parts.join("\n");
  } catch {
    return null;
  }
}

async function gatherWebsiteData(websiteUrl: string): Promise<string | null> {
  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": "GuestlistSocial/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract useful bits: title, meta description, h1s, key text
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const h1s = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
      .map((m) => m[1].replace(/<[^>]*>/g, "").trim())
      .filter(Boolean)
      .slice(0, 5);

    const parts: string[] = [`CLIENT WEBSITE (${websiteUrl}):`];
    if (titleMatch) parts.push(`Title: ${titleMatch[1].trim()}`);
    if (descMatch) parts.push(`Description: ${descMatch[1].trim()}`);
    if (h1s.length > 0) parts.push(`Headlines: ${h1s.join(" | ")}`);

    return parts.length > 1 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

function buildPrompt(
  field: Field,
  objective: string,
  budget: number,
  campaignName: string,
  context: string[]
): string {
  const contextBlock = context.length > 0
    ? `\n\nHere is the data I have:\n\n${context.join("\n\n")}`
    : "\n\nNo historical data available yet — give general best-practice advice.";

  const fieldInstructions: Record<Field, string> = {
    audience: `Suggest a target audience for this ad campaign. Be specific: age range, gender (if relevant), location, interests, and any exclusions. Base it on what's worked before for this client and what competitors are targeting.`,
    headline: `Suggest 3 headline options for this ad. Each should be under 40 characters, punchy, and match the campaign objective. Reference hooks and headlines that have worked before. Include one safe option and one bold option.`,
    body: `Suggest ad body copy (primary text) for this ad. Keep it under 125 characters for the main line, with an optional second line. Match the client's organic voice if available. Reference copy patterns that have performed well.`,
    cta: `Recommend the best call-to-action button for this campaign. Choose from: Learn More, Shop Now, Sign Up, Contact Us, Book Now, Apply Now, Watch More, Download, Get Quote. Explain why this CTA fits the objective and what's worked before.`,
    budget: `Recommend a daily budget for this campaign. Consider: what spend levels have produced winners for this client, what's the minimum to get meaningful data, and what the objective requires. Give a specific £/day number with reasoning.`,
    creative: `Suggest a creative direction for this ad. What format style (static image, carousel, video, UGC), what hook type (question, statistic, testimonial, before/after), and what visual approach would work best. Reference what's performed well and what competitors are doing.`,
  };

  return `You are an expert Facebook/Instagram ads strategist helping an agency create a campaign.

Campaign: "${campaignName || "New campaign"}"
Objective: ${objective}
${budget > 0 ? `Budget: £${budget}/day` : "Budget: not set yet"}

Task: ${fieldInstructions[field]}
${contextBlock}

Format your response EXACTLY like this:
SUGGESTION: [your specific recommendation — this will be inserted into the form field]
REASONING: [2-3 sentences explaining why, referencing the data you used]

Be specific and actionable. No generic advice.`;
}

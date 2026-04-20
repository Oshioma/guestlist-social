/**
 * POST /api/generate-post-ideas
 *
 * Generates AI post idea suggestions for empty proofer calendar slots.
 *
 * Body: {
 *   clientId: string
 *   month: string         // "YYYY-MM"
 *   platform: string      // instagram_feed | instagram_story | instagram_reel | facebook
 *   prompt: string        // user's generation prompt
 *   ideasPerSlot?: number // default 1
 * }
 *
 * The AI reads brand context, content pillars, existing posts for the month,
 * and generates one structured idea per empty slot. Never overwrites existing posts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CONTENT_MIX = [
  { type: "engagement", pct: 30, description: "questions, polls, conversation starters, relatable moments" },
  { type: "educational", pct: 25, description: "tips, how-tos, facts, behind-the-scenes process" },
  { type: "lifestyle/brand", pct: 20, description: "atmosphere, values, aspirational moments" },
  { type: "offer/sales", pct: 15, description: "products, menus, bookings, soft-sell" },
  { type: "behind the scenes", pct: 10, description: "team, kitchen, sourcing, prep" },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function daysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let i = 1; i <= last; i++) {
    const mo = String(month).padStart(2, "0");
    const day = String(i).padStart(2, "0");
    days.push(`${year}-${mo}-${day}`);
  }
  return days;
}

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long" });
}

function positionInMonth(index: number, total: number): string {
  const pct = index / total;
  if (pct < 0.25) return "start of month";
  if (pct < 0.5) return "mid-month";
  if (pct < 0.75) return "late month";
  return "end of month";
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
    const clientId = String(body.clientId ?? "").trim();
    const month = String(body.month ?? "").trim(); // "YYYY-MM"
    const platform = String(body.platform ?? "instagram_feed").trim();
    const userPrompt = String(body.prompt ?? "").trim();
    const ideasPerSlot = Math.min(Math.max(Number(body.ideasPerSlot ?? 1), 1), 3);

    if (!clientId || !month) {
      return NextResponse.json({ ok: false, error: "clientId and month required." }, { status: 400 });
    }

    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const m = Number(monthStr);
    if (!year || !m) {
      return NextResponse.json({ ok: false, error: "Invalid month format." }, { status: 400 });
    }

    const supabase = getSupabase();

    // Load client
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, industry, notes, ai_instructions, brand_context")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    }

    const brandCtx = (client.brand_context ?? {}) as Record<string, string>;

    // Load content pillars
    const { data: pillars } = await supabase
      .from("content_pillars")
      .select("id, name, description, color")
      .eq("client_id", clientId)
      .eq("archived", false)
      .order("sort_order", { ascending: true });

    // Load existing posts for the month (so we don't fill them or repeat their topics)
    const start = `${yearStr}-${monthStr}-01`;
    const nextMonthDate = new Date(year, m, 1);
    const end = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

    const { data: existingPosts } = await supabase
      .from("proofer_posts")
      .select("post_date, platform, caption, status")
      .eq("client_id", clientId)
      .gte("post_date", start)
      .lt("post_date", end)
      .order("post_date", { ascending: true });

    // Find empty slots (no post for this platform on this date)
    const filledSlots = new Set<string>();
    for (const p of existingPosts ?? []) {
      if (p.platform === platform) {
        filledSlots.add(p.post_date?.slice(0, 10) ?? "");
      }
    }

    const allDays = daysInMonth(year, m);
    // Cap at 15 slots per request to stay well within timeout limits
    const emptySlots = allDays.filter((d) => !filledSlots.has(d)).slice(0, 15);

    if (emptySlots.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No empty slots found for this platform in this month.",
        ideas: [],
        runId: null,
        emptySlotsFound: 0,
      });
    }

    // Summarise existing posts for context (avoid repetition)
    const existingCaptions = (existingPosts ?? [])
      .filter((p) => p.caption)
      .map((p) => `${p.post_date?.slice(0, 10)} (${p.platform}): "${(p.caption as string).slice(0, 80)}"`)
      .join("\n");

    // Build the system prompt
    const pillarList =
      pillars && pillars.length > 0
        ? pillars.map((p) => `  - ${p.name}${p.description ? ": " + p.description : ""}`).join("\n")
        : "  (no pillars defined — use varied content types)";

    const contentMixList = CONTENT_MIX.map(
      (c) => `  ${c.pct}% ${c.type}: ${c.description}`
    ).join("\n");

    const platformLabel: Record<string, string> = {
      instagram_feed: "Instagram Feed",
      instagram_story: "Instagram Story",
      instagram_reel: "Instagram Reel",
      facebook: "Facebook",
    };

    const brandBlock = [
      client.name ? `Business: ${client.name}` : null,
      client.industry ? `Industry: ${client.industry}` : null,
      brandCtx.toneOfVoice ? `Tone of voice: ${brandCtx.toneOfVoice}` : null,
      brandCtx.targetAudience ? `Target audience: ${brandCtx.targetAudience}` : null,
      brandCtx.offers ? `Products/offers: ${brandCtx.offers}` : null,
      brandCtx.bannedWords ? `BANNED words/phrases (never use): ${brandCtx.bannedWords}` : null,
      brandCtx.ctaStyle ? `CTA style: ${brandCtx.ctaStyle}` : null,
      brandCtx.visualStyle ? `Visual style: ${brandCtx.visualStyle}` : null,
      brandCtx.hashtagsPolicy ? `Hashtags policy: ${brandCtx.hashtagsPolicy}` : null,
      brandCtx.platformRules ? `Platform rules: ${brandCtx.platformRules}` : null,
      client.ai_instructions ? `Additional rules:\n${client.ai_instructions}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Slot descriptions for the prompt
    const slotDescriptions = emptySlots
      .map((date, i) => {
        const dow = dayOfWeek(date);
        const pos = positionInMonth(allDays.indexOf(date), allDays.length);
        return `  - ${date} (${dow}, ${pos})`;
      })
      .join("\n");

    const systemPrompt = `You are an expert social media content strategist. You generate structured post ideas for a social media content calendar.

BRAND:
${brandBlock || "(no brand context set — use professional defaults)"}

CONTENT PILLARS (tag each idea to one if possible):
${pillarList}

TARGET CONTENT MIX for this month:
${contentMixList}

PLATFORM: ${platformLabel[platform] ?? platform}

EXISTING POSTS THIS MONTH (do not repeat these topics or copy these captions):
${existingCaptions || "(none yet)"}

RULES:
- Vary content type across the month — avoid consecutive same-type posts
- Match day of week to content: weekdays suit educational/behind-scenes, weekends suit lifestyle/offers
- Never repeat product names or themes back-to-back
- Keep the tone consistent with the brand
- Separate caption idea from image idea — do NOT merge them
- The caption_idea is the written copy (words, hooks, emojis if appropriate)
- The image_idea is the visual concept for the photographer/designer
- first_line is the hook that appears before "more" — make it stop-the-scroll
- format is one of: single_image, carousel, reel, story_static, story_video
- The cta must match the brand's CTA style`;

    const userMessage = `${userPrompt ? `Extra direction from the team: "${userPrompt}"\n\n` : ""}Generate ${ideasPerSlot} idea${ideasPerSlot > 1 ? "s" : ""} for each of these empty ${platformLabel[platform] ?? platform} slots:

${slotDescriptions}

Return EXACTLY this JSON (no markdown, no code fences):
{
  "ideas": [
    {
      "post_slot_date": "YYYY-MM-DD",
      "title": "short internal title (5 words max)",
      "first_line": "scroll-stopping opening line",
      "caption_idea": "full caption text",
      "image_idea": "visual concept description for photographer/designer",
      "cta": "call to action text",
      "format": "single_image|carousel|reel|story_static|story_video",
      "hashtags": "#tag1 #tag2 #tag3",
      "content_type": "engagement|educational|lifestyle|offer|behind_the_scenes",
      "pillar_name": "exact pillar name from the list above, or null"
    }
  ]
}

Generate ${emptySlots.length * ideasPerSlot} ideas total (${ideasPerSlot} per slot, covering all ${emptySlots.length} empty slots).`;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: Math.min(6000, emptySlots.length * ideasPerSlot * 400 + 500),
      messages: [
        { role: "user", content: systemPrompt + "\n\n" + userMessage },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { ok: false, error: "AI returned unexpected format." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawIdeas: Record<string, unknown>[] = Array.isArray(parsed.ideas)
      ? parsed.ideas
      : [];

    if (rawIdeas.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "AI returned no ideas.",
        ideas: [],
        runId: null,
        emptySlotsFound: emptySlots.length,
      });
    }

    // Build pillar lookup by name
    const pillarByName = new Map<string, string>();
    for (const p of pillars ?? []) {
      pillarByName.set(p.name.toLowerCase().trim(), p.id);
    }

    // Save generation run
    const { data: runRow } = await supabase
      .from("ai_generation_runs")
      .insert({
        client_id: clientId,
        month,
        platform,
        prompt: userPrompt || null,
        brand_context_snapshot: brandCtx,
        number_of_ideas: rawIdeas.length,
        empty_slots_found: emptySlots.length,
        created_by: "admin",
      })
      .select("id")
      .single();

    const runId = runRow?.id ?? null;

    // Insert ideas
    const toInsert = rawIdeas.map((idea) => {
      const pillarName = String(idea.pillar_name ?? "").toLowerCase().trim();
      const pillarId = pillarByName.get(pillarName) ?? null;
      return {
        client_id: clientId,
        post_slot_date: String(idea.post_slot_date ?? ""),
        platform,
        generation_run_id: runId,
        prompt_used: userPrompt || null,
        title: String(idea.title ?? "").slice(0, 200) || null,
        caption_idea: String(idea.caption_idea ?? "") || null,
        image_idea: String(idea.image_idea ?? "") || null,
        cta: String(idea.cta ?? "") || null,
        format: String(idea.format ?? "") || null,
        hashtags: String(idea.hashtags ?? "") || null,
        first_line: String(idea.first_line ?? "") || null,
        content_pillar_id: pillarId,
        status: "idea",
        is_weak: false,
        generated_by: "ai",
        brand_context_snapshot: brandCtx,
      };
    });

    const { data: insertedIdeas, error: insertError } = await supabase
      .from("post_ideas")
      .insert(toInsert)
      .select("id, post_slot_date, platform, title, caption_idea, image_idea, cta, format, hashtags, first_line, content_pillar_id, status, is_weak, created_at, updated_at");

    if (insertError) {
      console.error("generate-post-ideas insert error:", insertError);
      return NextResponse.json(
        { ok: false, error: "Could not save ideas." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      runId,
      emptySlotsFound: emptySlots.length,
      ideas: insertedIdeas ?? [],
    });
  } catch (err) {
    console.error("generate-post-ideas error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 }
    );
  }
}

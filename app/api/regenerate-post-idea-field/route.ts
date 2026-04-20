/**
 * POST /api/regenerate-post-idea-field
 *
 * Rewrites a single field of an existing post idea.
 *
 * Body: {
 *   ideaId: string
 *   field: "caption_idea" | "image_idea" | "cta" | "first_line" | "hashtags"
 *   modifier: "shorter" | "stronger_cta" | "more_premium" | "more_playful" | "regenerate" | "add_stronger_cta"
 * }
 *
 * Returns: { ok: true, value: string }
 * The caller is responsible for saving via updatePostIdeaFieldAction.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

type Field = "caption_idea" | "image_idea" | "cta" | "first_line" | "hashtags";
type Modifier =
  | "shorter"
  | "stronger_cta"
  | "more_premium"
  | "more_playful"
  | "regenerate"
  | "add_stronger_cta";

const VALID_FIELDS: Field[] = [
  "caption_idea",
  "image_idea",
  "cta",
  "first_line",
  "hashtags",
];

const VALID_MODIFIERS: Modifier[] = [
  "shorter",
  "stronger_cta",
  "more_premium",
  "more_playful",
  "regenerate",
  "add_stronger_cta",
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const MODIFIER_INSTRUCTIONS: Record<Modifier, string> = {
  shorter: "Rewrite this to be shorter and punchier. Keep the same core message but cut unnecessary words.",
  stronger_cta: "Rewrite this with a stronger, more compelling call to action. Make the reader feel they need to act now.",
  more_premium: "Rewrite this to feel more premium, aspirational, and high-end. Elevate the language. No casual slang.",
  more_playful: "Rewrite this to be more playful, fun, and light. Add personality. Use conversational language.",
  regenerate: "Write a completely fresh version of this. Different angle, different opening, different approach.",
  add_stronger_cta: "Add a strong call to action at the end if there isn't one already, or replace a weak one.",
};

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
    const ideaId = String(body.ideaId ?? "").trim();
    const field = String(body.field ?? "") as Field;
    const modifier = String(body.modifier ?? "regenerate") as Modifier;

    if (!ideaId) {
      return NextResponse.json({ ok: false, error: "ideaId required." }, { status: 400 });
    }
    if (!VALID_FIELDS.includes(field)) {
      return NextResponse.json(
        { ok: false, error: `field must be one of: ${VALID_FIELDS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_MODIFIERS.includes(modifier)) {
      return NextResponse.json(
        { ok: false, error: `modifier must be one of: ${VALID_MODIFIERS.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: idea } = await supabase
      .from("post_ideas")
      .select("*, clients(name, brand_context, ai_instructions)")
      .eq("id", ideaId)
      .single();

    if (!idea) {
      return NextResponse.json({ ok: false, error: "Idea not found." }, { status: 404 });
    }

    const client = (idea.clients ?? {}) as Record<string, unknown>;
    const brandCtx = (client.brand_context ?? {}) as Record<string, string>;

    const currentValue = String((idea as Record<string, unknown>)[field] ?? "");

    const fieldLabels: Record<Field, string> = {
      caption_idea: "caption",
      image_idea: "image/visual concept",
      cta: "call to action",
      first_line: "opening hook line",
      hashtags: "hashtags",
    };

    const brandBlock = [
      client.name ? `Business: ${client.name}` : null,
      brandCtx.toneOfVoice ? `Tone: ${brandCtx.toneOfVoice}` : null,
      brandCtx.bannedWords ? `BANNED: ${brandCtx.bannedWords}` : null,
      brandCtx.ctaStyle ? `CTA style: ${brandCtx.ctaStyle}` : null,
      (client.ai_instructions as string) ? `Rules: ${client.ai_instructions}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const context = [
      idea.title ? `Post title: ${idea.title}` : null,
      idea.caption_idea && field !== "caption_idea"
        ? `Caption: ${(idea.caption_idea as string).slice(0, 200)}`
        : null,
      idea.image_idea && field !== "image_idea"
        ? `Image concept: ${idea.image_idea}`
        : null,
      `Post date: ${idea.post_slot_date}`,
      `Platform: ${idea.platform}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are rewriting the ${fieldLabels[field]} for a social media post.

BRAND CONTEXT:
${brandBlock || "(no brand context)"}

POST CONTEXT:
${context}

CURRENT ${fieldLabels[field].toUpperCase()}:
"${currentValue}"

INSTRUCTION: ${MODIFIER_INSTRUCTIONS[modifier]}

Return ONLY the new ${fieldLabels[field]} text. No explanation, no quotes, no markdown, no prefix labels. Just the raw text.`;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const newValue = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    return NextResponse.json({ ok: true, value: newValue });
  } catch (err) {
    console.error("regenerate-post-idea-field error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 }
    );
  }
}

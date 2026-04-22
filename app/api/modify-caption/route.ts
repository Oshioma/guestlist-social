/**
 * POST /api/modify-caption
 *
 * Rewrites a caption draft using an AI modifier.
 * Body: { clientId, text, modifier }
 * Returns: { ok: true, value: string }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

type Modifier = "shorter" | "stronger_cta" | "more_premium" | "more_playful" | "regenerate" | "new_hook";

const VALID_MODIFIERS: Modifier[] = ["shorter", "stronger_cta", "more_premium", "more_playful", "regenerate", "new_hook"];

const MODIFIER_INSTRUCTIONS: Record<Modifier, string> = {
  shorter: "Rewrite this to be shorter and punchier. Keep the same core message but cut unnecessary words.",
  stronger_cta: "Rewrite this with a stronger, more compelling call to action at the end.",
  more_premium: "Rewrite this to feel more premium, aspirational, and high-end. Elevate the language. No casual slang.",
  more_playful: "Rewrite this to be more playful, fun, and light. Add personality. Use conversational language.",
  regenerate: "Write a completely fresh version. Different angle, different opening, different approach.",
  new_hook: "Rewrite ONLY the opening line (first sentence) to be a stronger scroll-stopping hook. Keep the rest of the caption exactly the same.",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });

    const body = await req.json();
    const clientId = String(body.clientId ?? "").trim();
    const text = String(body.text ?? "").trim();
    const modifier = String(body.modifier ?? "regenerate") as Modifier;

    if (!text) return NextResponse.json({ ok: false, error: "text required." }, { status: 400 });
    if (!VALID_MODIFIERS.includes(modifier)) return NextResponse.json({ ok: false, error: "invalid modifier." }, { status: 400 });

    let brandBlock = "";
    if (clientId) {
      const supabase = getSupabase();
      const [clientRes, consultationRes] = await Promise.all([
        supabase.from("clients").select("name, ai_instructions").eq("id", clientId).single(),
        supabase.from("consultation_submissions")
          .select("consultation_answers(question_prompt, answer_text)")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (clientRes.data) {
        const client = clientRes.data;
        type A = { question_prompt: string; answer_text: string };
        const answers = ((consultationRes.data as { consultation_answers: A[] } | null)?.consultation_answers ?? []).filter((a) => a.answer_text?.trim());
        const consultationBlock = answers.map((a) => `Q: ${a.question_prompt}\nA: ${a.answer_text}`).join("\n\n");
        brandBlock = [
          client.name ? `Business: ${client.name}` : null,
          consultationBlock || null,
          client.ai_instructions ? `Rules: ${client.ai_instructions}` : null,
        ].filter(Boolean).join("\n\n");
      }
    }

    const prompt = `You are rewriting a social media caption.${brandBlock ? `\n\nCLIENT CONTEXT:\n${brandBlock}` : ""}

CURRENT CAPTION:
"${text}"

INSTRUCTION: ${MODIFIER_INSTRUCTIONS[modifier]}

Return ONLY the new caption text. No explanation, no quotes, no markdown. Just the raw caption.`;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const newValue = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    return NextResponse.json({ ok: true, value: newValue });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}

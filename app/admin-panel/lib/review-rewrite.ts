"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Claude rewrite pass for the cover narrative of a review.
//
// The deterministic engine fills the JSON blocks (what_improved, what_we_tested,
// what_we_learned, what_next, metrics_snapshot) — those are facts. This action
// asks Claude to rewrite ONLY the headline / subhead / what_happened so the
// cover reads like a human wrote it. The JSON blocks stay untouched and remain
// the source of truth, so the rewrite is safe to re-run any time before send.
//
// Trust principles baked into the prompt:
//   - lead with the WHY (what changed and why it matters)
//   - separate facts from interpretation (numbers stay numbers)
//   - admit uncertainty when the data is thin
//   - avoid hype words ("crushing", "exploding", "killer")
// ---------------------------------------------------------------------------

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const RewriteSchema = z.object({
  headline: z
    .string()
    .min(4)
    .max(120)
    .describe(
      "One short sentence that captures the most important thing that happened this period. Plain English. No hype."
    ),
  subhead: z
    .string()
    .min(8)
    .max(220)
    .describe(
      "One supporting sentence that adds context to the headline. Hint at the why or what's next, but stay concrete."
    ),
  what_happened: z
    .string()
    .min(40)
    .max(900)
    .describe(
      "Two to four short sentences explaining what actually happened this period in plain language. Lead with the WHY behind the moves. Reference specific numbers from the facts where it helps. If the data is thin, say so."
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "How confident the rewrite is in its own narrative. Low when data is thin or signals are mixed."
    ),
});

type RewriteResult = z.infer<typeof RewriteSchema>;

const SYSTEM_PROMPT = `You are the senior account manager at Guestlist Social, a paid-social agency. You write client-facing review narratives that build trust.

Your job: rewrite the cover narrative (headline, subhead, what_happened) for one client review based on the deterministic facts the engine has already pulled. You are NOT allowed to invent numbers, ad names, or outcomes — only restate, contextualise, and explain what the JSON facts already say.

Trust principles you must follow on every rewrite:

1. Clarity. Plain English. Short sentences. No agency jargon ("synergy", "leveraging", "ROAS-optimised funnel"). No hype words ("crushing", "exploding", "killer", "smashing it").
2. Why before what. Before stating a move, explain why it's happening. "CTR was below 1% so we swapped the hook" beats "We swapped the hook."
3. Facts vs interpretation. Numbers and ad names are facts — keep them exact. Words like "winning", "losing", "scale" are interpretation — use them sparingly and only when the underlying delta supports it.
4. Admit uncertainty. If signals are mixed or volume is small, say so. "Still early — we want another week before calling it" is more trustworthy than a confident guess.
5. Before → after. When you reference an improvement, show the move. "Hook test on 'Late checkout' lifted CTR from 0.8% to 1.3%" beats "CTR up".
6. No surprises. Everything in the narrative must be traceable to the facts blob. Don't promise actions that aren't already in what_next.

Output JSON matching the schema. Set confidence:
- "high" when the deltas are clear and there is meaningful spend in the period
- "medium" when there is signal but it's mixed or volume is moderate
- "low" when the period is thin, brand new, or improvements are flat

Tone: calm, controlled, like a control room briefing. Not a casino.`;

// ---------------------------------------------------------------------------
// rewriteReviewWithClaude: pull a draft review, ask Claude to rewrite the
// narrative blocks, and persist them back. The deterministic JSON blocks are
// preserved so the rewrite can be re-run any number of times.
// ---------------------------------------------------------------------------
export async function rewriteReviewWithClaude(reviewId: number): Promise<{
  ok: boolean;
  error?: string;
  result?: RewriteResult;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    };
  }

  const supabase = admin();

  const { data: reviewRow, error } = await supabase
    .from("reviews")
    .select(
      "id, client_id, status, period_label, period_type, headline, subhead, what_happened, what_improved, what_we_tested, what_we_learned, what_next, metrics_snapshot, clients(name)"
    )
    .eq("id", reviewId)
    .single();
  if (error || !reviewRow) {
    return { ok: false, error: error?.message ?? "Review not found" };
  }

  const review = reviewRow as {
    id: number;
    client_id: number;
    status: string;
    period_label: string;
    period_type: string;
    headline: string | null;
    subhead: string | null;
    what_happened: string | null;
    what_improved: unknown;
    what_we_tested: unknown;
    what_we_learned: unknown;
    what_next: unknown;
    metrics_snapshot: unknown;
    clients: { name: string } | { name: string }[] | null;
  };

  if (review.status !== "draft") {
    return {
      ok: false,
      error: "Only draft reviews can be rewritten. Reset the review first.",
    };
  }

  const clientName = Array.isArray(review.clients)
    ? review.clients[0]?.name
    : review.clients?.name;

  const facts = {
    client: clientName ?? "Unknown client",
    period_label: review.period_label,
    period_type: review.period_type,
    current_narrative: {
      headline: review.headline,
      subhead: review.subhead,
      what_happened: review.what_happened,
    },
    what_improved: review.what_improved ?? [],
    what_we_tested: review.what_we_tested ?? [],
    what_we_learned: review.what_we_learned ?? [],
    what_next: review.what_next ?? [],
    metrics_snapshot: review.metrics_snapshot ?? {},
  };

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: zodOutputFormat(RewriteSchema),
      },
      messages: [
        {
          role: "user",
          content: `Rewrite the cover narrative for this review. The facts blob below is the source of truth — do not invent anything beyond it.\n\nFACTS:\n${JSON.stringify(
            facts,
            null,
            2
          )}`,
        },
      ],
    });

    const parsed = message.parsed_output;
    if (!parsed) {
      return { ok: false, error: "Claude did not return a parseable result." };
    }

    const { error: updErr } = await supabase
      .from("reviews")
      .update({
        headline: parsed.headline,
        subhead: parsed.subhead,
        what_happened: parsed.what_happened,
      })
      .eq("id", review.id);
    if (updErr) {
      return { ok: false, error: updErr.message };
    }

    revalidatePath(
      `/app/clients/${review.client_id}/reviews/${review.id}`
    );
    revalidatePath(`/app/clients/${review.client_id}/reviews`);

    return { ok: true, result: parsed };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return { ok: false, error: `Claude API error: ${e.message}` };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

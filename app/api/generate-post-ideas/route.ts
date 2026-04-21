/**
 * POST /api/generate-post-ideas
 *
 * Streams AI post ideas for every empty slot in a month.
 * Generates in weekly batches and streams each idea as NDJSON so the UI
 * can display them live, top-to-bottom, without waiting for the full month.
 *
 * Body: { clientId, month, platform, prompt }
 *
 * Stream format (newline-delimited JSON):
 *   { type: "status", emptySlotsFound: number }
 *   { type: "idea", idea: PostIdea }   — repeats for each idea
 *   { type: "done", totalGenerated: number }
 *   { type: "error", error: string }
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_SIZE = 7; // one week at a time

const CONTENT_MIX = [
  { type: "engagement",        pct: 30, description: "questions, polls, conversation starters, relatable moments" },
  { type: "educational",       pct: 25, description: "tips, how-tos, facts, behind-the-scenes process" },
  { type: "lifestyle/brand",   pct: 20, description: "atmosphere, values, aspirational moments" },
  { type: "offer/sales",       pct: 15, description: "products, menus, bookings, soft-sell" },
  { type: "behind the scenes", pct: 10, description: "team, kitchen, sourcing, prep" },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function daysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let i = 1; i <= last; i++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
  }
  return days;
}

function dayOfWeek(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long" });
}

function positionInMonth(index: number, total: number): string {
  const pct = index / total;
  if (pct < 0.25) return "start of month";
  if (pct < 0.5)  return "mid-month";
  if (pct < 0.75) return "late month";
  return "end of month";
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, obj: unknown) {
  controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send(controller, encoder, { type: "error", error: "ANTHROPIC_API_KEY not configured." });
          controller.close();
          return;
        }

        const body = await req.json();
        const clientId   = String(body.clientId ?? "").trim();
        const month      = String(body.month ?? "").trim();
        const platform   = String(body.platform ?? "instagram_feed").trim();
        const userPrompt = String(body.prompt ?? "").trim();

        if (!clientId || !month) {
          send(controller, encoder, { type: "error", error: "clientId and month required." });
          controller.close();
          return;
        }

        const [yearStr, monthStr] = month.split("-");
        const year = Number(yearStr);
        const m    = Number(monthStr);
        if (!year || !m) {
          send(controller, encoder, { type: "error", error: "Invalid month format." });
          controller.close();
          return;
        }

        const supabase = getSupabase();

        const nextMonthDate = new Date(year, m, 1);
        const nextMonthStr  = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
        const monthStart    = `${yearStr}-${monthStr}-01`;

        // Load client + pillars + existing posts + existing ideas in parallel
        const [clientRes, pillarsRes, postsRes, ideasRes] = await Promise.all([
          supabase.from("clients").select("id, name, industry, notes, ai_instructions, brand_context").eq("id", clientId).single(),
          supabase.from("content_pillars").select("id, name, description, color").eq("client_id", clientId).eq("archived", false).order("sort_order", { ascending: true }),
          supabase.from("proofer_posts").select("post_date, platform, caption, status").eq("client_id", clientId).gte("post_date", monthStart).lt("post_date", nextMonthStr).order("post_date", { ascending: true }),
          supabase.from("post_ideas").select("post_slot_date").eq("client_id", clientId).eq("platform", platform).gte("post_slot_date", monthStart).lt("post_slot_date", nextMonthStr),
        ]);

        if (!clientRes.data) {
          send(controller, encoder, { type: "error", error: "Client not found." });
          controller.close();
          return;
        }

        const client   = clientRes.data;
        const pillars  = pillarsRes.data ?? [];
        const brandCtx = (client.brand_context ?? {}) as Record<string, string>;

        // Find empty slots — a slot is filled if it has a post OR an existing idea
        const filledSlots = new Set<string>();
        for (const p of postsRes.data ?? []) {
          if (p.platform === platform) filledSlots.add(p.post_date?.slice(0, 10) ?? "");
        }
        for (const i of ideasRes.data ?? []) {
          filledSlots.add((i.post_slot_date as string)?.slice(0, 10) ?? "");
        }

        const allDays    = daysInMonth(year, m);
        const todayStr   = new Date().toISOString().slice(0, 10);
        const emptySlots = allDays.filter((d) => !filledSlots.has(d) && d >= todayStr);

        if (emptySlots.length === 0) {
          send(controller, encoder, { type: "status", emptySlotsFound: 0 });
          send(controller, encoder, { type: "done", totalGenerated: 0 });
          controller.close();
          return;
        }

        send(controller, encoder, { type: "status", emptySlotsFound: emptySlots.length });

        // Build shared context strings
        const pillarList = pillars.length > 0
          ? pillars.map((p) => `  - ${p.name}${p.description ? ": " + p.description : ""}`).join("\n")
          : "  (no pillars — use varied content types)";

        const contentMixList = CONTENT_MIX.map((c) => `  ${c.pct}% ${c.type}: ${c.description}`).join("\n");

        const existingCaptions = (postsRes.data ?? [])
          .filter((p) => p.caption)
          .map((p) => `${p.post_date?.slice(0, 10)} (${p.platform}): "${(p.caption as string).slice(0, 80)}"`)
          .join("\n");

        const platformLabel: Record<string, string> = {
          instagram_feed: "Instagram Feed",
          instagram_story: "Instagram Story",
          instagram_reel: "Instagram Reel",
          facebook: "Facebook",
        };

        const brandBlock = [
          client.name            ? `Business: ${client.name}`                               : null,
          client.industry        ? `Industry: ${client.industry}`                            : null,
          brandCtx.toneOfVoice   ? `Tone of voice: ${brandCtx.toneOfVoice}`                 : null,
          brandCtx.targetAudience? `Target audience: ${brandCtx.targetAudience}`            : null,
          brandCtx.offers        ? `Products/offers: ${brandCtx.offers}`                    : null,
          brandCtx.bannedWords   ? `BANNED (never use): ${brandCtx.bannedWords}`            : null,
          brandCtx.ctaStyle      ? `CTA style: ${brandCtx.ctaStyle}`                        : null,
          brandCtx.visualStyle   ? `Visual style: ${brandCtx.visualStyle}`                  : null,
          brandCtx.hashtagsPolicy? `Hashtags policy: ${brandCtx.hashtagsPolicy}`            : null,
          brandCtx.platformRules ? `Platform rules: ${brandCtx.platformRules}`              : null,
          client.ai_instructions ? `Additional rules:\n${client.ai_instructions}`           : null,
        ].filter(Boolean).join("\n");

        const systemPrompt = `You are an expert social media content strategist generating structured post ideas.

BRAND:
${brandBlock || "(no brand context — use professional defaults)"}

CONTENT PILLARS:
${pillarList}

TARGET MIX:
${contentMixList}

PLATFORM: ${platformLabel[platform] ?? platform}

EXISTING POSTS THIS MONTH (do not repeat):
${existingCaptions || "(none yet)"}

RULES:
- Vary content type — no consecutive same-type posts
- Weekdays: educational/behind-scenes. Weekends: lifestyle/offers
- Separate caption from image concept — never merge them
- caption_idea = written copy. image_idea = visual concept for photographer
- first_line = scroll-stopping hook shown before "more"
- format: single_image | carousel | reel | story_static | story_video`;

        const pillarByName = new Map<string, string>();
        for (const p of pillars) pillarByName.set(p.name.toLowerCase().trim(), p.id);

        // Create generation run record
        const { data: runRow } = await supabase
          .from("ai_generation_runs")
          .insert({ client_id: clientId, month, platform, prompt: userPrompt || null, brand_context_snapshot: brandCtx, number_of_ideas: 0, empty_slots_found: emptySlots.length, created_by: "admin" })
          .select("id").single();
        const runId = runRow?.id ?? null;

        const anthropic = new Anthropic({ apiKey });
        let totalGenerated = 0;

        // Generate in weekly batches, streaming each batch as it completes
        for (let i = 0; i < emptySlots.length; i += BATCH_SIZE) {
          const batch = emptySlots.slice(i, i + BATCH_SIZE);

          const slotDescriptions = batch
            .map((date) => {
              const dow = dayOfWeek(date);
              const pos = positionInMonth(allDays.indexOf(date), allDays.length);
              return `  - ${date} (${dow}, ${pos})`;
            })
            .join("\n");

          const userMessage = `${userPrompt ? `Team direction: "${userPrompt}"\n\n` : ""}Generate 1 idea for each of these ${platformLabel[platform] ?? platform} slots:

${slotDescriptions}

Return EXACTLY this JSON (no markdown, no code fences):
{"ideas":[{"post_slot_date":"YYYY-MM-DD","title":"5 words max","first_line":"hook line","caption_idea":"full caption","image_idea":"visual concept","cta":"call to action","format":"single_image|carousel|reel|story_static|story_video","hashtags":"#tag1 #tag2","content_type":"engagement|educational|lifestyle|offer|behind_the_scenes","pillar_name":"exact pillar name or null"}]}

Generate ${batch.length} ideas total.`;

          try {
            const message = await anthropic.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: batch.length * 350 + 300,
              messages: [{ role: "user", content: systemPrompt + "\n\n" + userMessage }],
            });

            const raw = message.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) continue;

            const parsed = JSON.parse(jsonMatch[0]);
            const rawIdeas: Record<string, unknown>[] = Array.isArray(parsed.ideas) ? parsed.ideas : [];

            if (rawIdeas.length === 0) continue;

            // Insert batch and stream each idea immediately
            const toInsert = rawIdeas.map((idea) => {
              const pillarName = String(idea.pillar_name ?? "").toLowerCase().trim();
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
                content_pillar_id: pillarByName.get(pillarName) ?? null,
                status: "idea",
                is_weak: false,
                generated_by: "ai",
                brand_context_snapshot: brandCtx,
              };
            });

            const { data: inserted } = await supabase.from("post_ideas").insert(toInsert).select("*");

            for (const row of inserted ?? []) {
              const idea = {
                id: String(row.id),
                clientId: String(row.client_id),
                postSlotDate: row.post_slot_date ?? "",
                platform: row.platform ?? platform,
                generationRunId: row.generation_run_id ?? null,
                promptUsed: row.prompt_used ?? null,
                title: row.title ?? null,
                captionIdea: row.caption_idea ?? null,
                imageIdea: row.image_idea ?? null,
                cta: row.cta ?? null,
                format: row.format ?? null,
                hashtags: row.hashtags ?? null,
                firstLine: row.first_line ?? null,
                contentPillarId: row.content_pillar_id ?? null,
                status: "idea",
                isWeak: false,
                generatedBy: "ai",
                createdAt: row.created_at ?? "",
                updatedAt: row.updated_at ?? "",
              };
              send(controller, encoder, { type: "idea", idea });
              totalGenerated++;
            }
          } catch {
            // One batch failing shouldn't kill the whole stream — skip and continue
          }
        }

        // Update run with final count
        if (runId) {
          await supabase.from("ai_generation_runs").update({ number_of_ideas: totalGenerated }).eq("id", runId);
        }

        send(controller, encoder, { type: "done", totalGenerated });
        controller.close();
      } catch (err) {
        const encoder2 = new TextEncoder();
        controller.enqueue(encoder2.encode(JSON.stringify({ type: "error", error: err instanceof Error ? err.message : "Unknown error." }) + "\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

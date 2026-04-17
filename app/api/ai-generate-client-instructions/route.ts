/**
 * POST /api/ai-generate-client-instructions
 *
 * Generates 5 custom AI instructions for a client based on their
 * profile, industry, website, and notes. Called when a client is
 * created or when the operator clicks "Generate" on the client page.
 *
 * Body: { clientId }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "No ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const clientId = String(body.clientId ?? "");
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Manual save
    if (body.manualInstructions !== undefined) {
      await supabase
        .from("clients")
        .update({ ai_instructions: String(body.manualInstructions) })
        .eq("id", clientId);
      return NextResponse.json({ ok: true, instructions: body.manualInstructions });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("name, industry, notes, website, platform")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    // Gather extra context
    const context: string[] = [];
    context.push(`Business name: ${client.name}`);
    if (client.industry) context.push(`Industry: ${client.industry}`);
    if (client.website) context.push(`Website: ${client.website}`);
    if (client.notes) context.push(`Notes: ${client.notes}`);

    // Try to get brand voice from organic posts
    const { data: posts } = await supabase
      .from("proofer_posts")
      .select("caption")
      .eq("client_id", clientId)
      .not("caption", "is", null)
      .order("post_date", { ascending: false })
      .limit(3);

    if (posts && posts.length > 0) {
      const captions = posts.map((p) => p.caption as string).filter((c) => c && c.length > 20);
      if (captions.length > 0) {
        context.push(`Their organic post style: "${captions[0].slice(0, 150)}"`);
      }
    }

    // Try to scrape website for more context
    if (client.website) {
      try {
        const res = await fetch(client.website, {
          headers: { "User-Agent": "GuestlistSocial/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
          if (titleMatch) context.push(`Website title: ${titleMatch[1].trim()}`);
          if (descMatch) context.push(`Website description: ${descMatch[1].trim()}`);
        }
      } catch { /* skip */ }
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `You are a senior social media strategist. A new client has been added to the ad platform. Based on their profile, write exactly 5 custom instructions that will guide all AI-generated ad copy and campaign suggestions for this client.

${context.join("\n")}

Each instruction should be specific, actionable, and reference the actual business. Cover:
1. What to always mention (their unique selling point, location, key products)
2. Brand voice / tone (based on their organic posts or industry)
3. Target audience (who to reach, who to exclude)
4. Key products/services to lead with
5. Urgency/hooks that fit their business

Return EXACTLY 5 bullet points, one per line, starting with "• ". No intro text, no numbering, just the 5 bullets. Be specific to THIS business — no generic marketing advice.`
      }],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const instructions = raw.trim();

    // Save to client
    await supabase
      .from("clients")
      .update({ ai_instructions: instructions })
      .eq("id", clientId);

    return NextResponse.json({ ok: true, instructions });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

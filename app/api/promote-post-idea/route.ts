/**
 * POST /api/promote-post-idea
 *
 * Promotes an AI idea into a real proofer_post draft.
 * The original idea stays in the post_ideas table (status → "promoted").
 * If a post already exists for that (client, date, platform), it does NOT overwrite.
 *
 * Body: { ideaId: string }
 *
 * Returns: { ok: true, postId: string, alreadyExists: boolean }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ideaId = String(body.ideaId ?? "").trim();

    if (!ideaId) {
      return NextResponse.json({ ok: false, error: "ideaId required." }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: idea } = await supabase
      .from("post_ideas")
      .select("*")
      .eq("id", ideaId)
      .single();

    if (!idea) {
      return NextResponse.json({ ok: false, error: "Idea not found." }, { status: 404 });
    }

    // Check if a post already exists for this slot
    const { data: existing } = await supabase
      .from("proofer_posts")
      .select("id, status")
      .eq("client_id", idea.client_id)
      .eq("post_date", idea.post_slot_date)
      .eq("platform", idea.platform)
      .maybeSingle();

    if (existing) {
      // Slot already has a post — mark idea promoted and return the existing post
      await supabase
        .from("post_ideas")
        .update({ status: "promoted", updated_at: new Date().toISOString() })
        .eq("id", ideaId);

      return NextResponse.json({
        ok: true,
        postId: existing.id,
        alreadyExists: true,
        message: "A post already exists for this slot. Idea marked as promoted.",
      });
    }

    // Build caption from idea: prepend first_line if it exists
    const captionParts = [
      idea.first_line ? idea.first_line : null,
      idea.caption_idea ?? null,
      idea.cta ?? null,
      idea.hashtags ?? null,
    ].filter(Boolean);
    const caption = captionParts.join("\n\n");

    // Create the proofer post
    const { data: newPost, error: insertError } = await supabase
      .from("proofer_posts")
      .insert({
        client_id: idea.client_id,
        post_date: idea.post_slot_date,
        platform: idea.platform,
        caption: caption || "",
        image_url: "",
        media_urls: [],
        pillar_id: idea.content_pillar_id ?? null,
        status: "none",
        publish_time: "18:00",
        created_by: "ai-promote",
      })
      .select("id")
      .single();

    if (insertError || !newPost) {
      console.error("promote-post-idea insert error:", insertError);
      return NextResponse.json(
        { ok: false, error: "Could not create post draft." },
        { status: 500 }
      );
    }

    // Mark idea as promoted (keep it visible, just change status)
    await supabase
      .from("post_ideas")
      .update({ status: "promoted", updated_at: new Date().toISOString() })
      .eq("id", ideaId);

    return NextResponse.json({
      ok: true,
      postId: newPost.id,
      alreadyExists: false,
    });
  } catch (err) {
    console.error("promote-post-idea error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 }
    );
  }
}

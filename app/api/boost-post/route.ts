/**
 * POST /api/boost-post
 *
 * Boost an existing published Facebook/Instagram post by creating a
 * promotion via the Meta Graph API. This turns an organic post into a
 * paid ad without creating a separate campaign — Meta handles the
 * campaign/adset/ad structure automatically under the hood.
 *
 * Body: { postId, clientId, platform, metaPostId, budgetCentsPerDay, durationDays }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logMetaWrite } from "@/lib/meta-write-log";

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
    const body = await req.json();
    const clientId = body.clientId;
    const platform = String(body.platform ?? "facebook");
    const metaPostId = String(body.metaPostId ?? "");
    const publishUrl = String(body.publishUrl ?? "");
    const budgetCentsPerDay = Number(body.budgetCentsPerDay ?? 500);
    const durationDays = Number(body.durationDays ?? 3);

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    // Resolve the Meta post ID from the publish URL if not provided directly
    let postIdToBoost = metaPostId;
    if (!postIdToBoost && publishUrl) {
      const fbMatch = publishUrl.match(/facebook\.com\/(\d+_?\d+)/);
      if (fbMatch) postIdToBoost = fbMatch[1];
    }
    if (!postIdToBoost) {
      return NextResponse.json(
        { ok: false, error: "Could not determine Meta post ID. The post may not have a saved publish URL." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Look up the connected account token for this client + platform
    const metaPlatform = platform === "instagram" ? "instagram" : "facebook";
    const { data: account } = await supabase
      .from("connected_meta_accounts")
      .select("account_id, access_token")
      .eq("client_id", clientId)
      .eq("platform", metaPlatform)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { ok: false, error: `No connected ${metaPlatform} account for this client.` },
        { status: 400 }
      );
    }

    // Calculate end time
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + durationDays);
    const endTimeUnix = Math.floor(endTime.getTime() / 1000);

    // Create the boost via Meta's promotions endpoint
    // For Facebook: POST /{page-post-id}/promotions
    // For Instagram: POST /{ig-media-id}/promote
    const endpoint = platform === "instagram"
      ? `/${postIdToBoost}/promote`
      : `/${postIdToBoost}/promotions`;

    const params = new URLSearchParams({
      access_token: account.access_token,
      budget: String(budgetCentsPerDay * durationDays),
      end_time: String(endTimeUnix),
    });

    const start = Date.now();
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}${endpoint}`,
      { method: "POST", body: params, cache: "no-store" }
    );
    const data = await res.json();

    logMetaWrite({
      operation: "boost:post",
      clientId: Number(clientId),
      metaEndpoint: endpoint,
      requestBody: {
        budget: budgetCentsPerDay * durationDays,
        end_time: endTimeUnix,
        duration_days: durationDays,
        daily_budget_cents: budgetCentsPerDay,
      },
      responseStatus: res.status,
      responseBody: data,
      success: res.ok && !data.error,
      errorMessage: data.error?.message ?? null,
      durationMs: Date.now() - start,
    });

    if (!res.ok || data.error) {
      const errParts = [
        data.error?.message,
        data.error?.error_user_title,
        data.error?.error_user_msg,
      ].filter(Boolean);
      return NextResponse.json(
        { ok: false, error: errParts.join(" — ") || "Meta boost failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      promotionId: data.id ?? data.ad_id ?? null,
      budget: budgetCentsPerDay * durationDays,
      durationDays,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

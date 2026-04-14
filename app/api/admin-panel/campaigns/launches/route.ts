import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); },
      },
    }
  );

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  // Determine flow by adType
  if (body.adType === "existing") {
    // Boosting an existing post
    if (
      !body.postId ||
      !body.audience ||
      !body.budget ||
      !body.schedule ||
      !body.placement
    ) {
      return NextResponse.json(
        { error: "Missing required fields for boosting post." },
        { status: 422 }
      );
    }

    const campaignToInsert = {
      type: "advertising",
      ad_type: "existing",
      post_id: body.postId,
      audience: body.audience,
      budget: body.budget,
      schedule: body.schedule,
      placement: body.placement,
    };

    const { data, error } = await supabase
      .from("campaign


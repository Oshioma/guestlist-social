import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type RequestBody = {
  adType?: unknown;
  postId?: unknown;
  audience?: unknown;
  budget?: unknown;
  schedule?: unknown;
  placement?: unknown;
  name?: unknown;
  type?: unknown;
  objective?: unknown;
  headline?: unknown;
  description?: unknown;
  url?: unknown;
  cta?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  if (body.adType === "existing") {
    if (
      !isNonEmptyString(body.postId) ||
      !isNonEmptyString(body.audience) ||
      (!isNonEmptyString(body.budget) && typeof body.budget !== "number") ||
      !isNonEmptyString(body.schedule) ||
      !isNonEmptyString(body.placement)
    ) {
      return NextResponse.json(
        { error: "Missing required fields for boosting post." },
        { status: 422 }
      );
    }

    const campaignToInsert = {
      type: "advertising",
      ad_type: "existing",
      post_id: body.postId.trim(),
      audience: body.audience.trim(),
      budget: body.budget,
      schedule: body.schedule.trim(),
      placement: body.placement.trim(),
    };

    const { data, error } = await supabase
      .from("campaigns")
      .insert([campaignToInsert])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  if (
    !isNonEmptyString(body.name) ||
    !isNonEmptyString(body.type) ||
    !isNonEmptyString(body.objective) ||
    !isNonEmptyString(body.audience) ||
    (!isNonEmptyString(body.budget) && typeof body.budget !== "number") ||
    !isNonEmptyString(body.schedule) ||
    !isNonEmptyString(body.placement) ||
    !isNonEmptyString(body.headline) ||
    !isNonEmptyString(body.description) ||
    !isNonEmptyString(body.url) ||
    !isNonEmptyString(body.cta)
  ) {
    return NextResponse.json(
      { error: "Missing required campaign fields." },
      { status: 422 }
    );
  }

  const campaignToInsert = {
    name: body.name.trim(),
    type: body.type.trim(),
    objective: body.objective.trim(),
    audience: body.audience.trim(),
    budget: body.budget,
    schedule: body.schedule.trim(),
    placement: body.placement.trim(),
    headline: body.headline.trim(),
    description: body.description.trim(),
    url: body.url.trim(),
    cta: body.cta.trim(),
  };

  const { data, error } = await supabase
    .from("campaigns")
    .insert([campaignToInsert])
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

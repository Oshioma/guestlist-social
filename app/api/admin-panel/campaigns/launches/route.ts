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

  const body = await request.json();

  const campaignToInsert = {
    name: body.name,
    type: body.type,
    objective: body.objective,
    audience: body.audience,
    budget: body.budget,
    schedule: body.schedule,
    placement: body.placement,
    headline: body.headline,
    description: body.description,
    url: body.url,
    cta: body.cta,
  };

  const { data, error } = await supabase
    .from("campaigns")
    .insert([campaignToInsert])
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  return NextResponse.json({ id: data?.[0]?.id }, { status: 201 });
}

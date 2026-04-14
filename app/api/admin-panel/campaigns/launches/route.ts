import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); }
      }
    }
  );

  const body = await request.json();

  // Compose a record for your campaigns table
  const campaignToInsert = {
    name: body.name,
    type: body.type, // "advertising"
    objective: body.objective,
    audience: body.audience,
    budget: body.budget,
    schedule: body.schedule,
    placement: body.placement,
    headline: body.headline,
    description: body.description,
    url: body.url,
    cta: body.cta,
    // add any more fields you want to store
  };

  const { data, error } = await supabase
    .from("campaigns")
    .insert([campaignToInsert])
    .select("id"); // Return new ID for redirect, optionally

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  // Optional: return ID for redirecting in frontend
  return NextResponse.json({ id: data?.[0]?.id }, { status: 201 });
}

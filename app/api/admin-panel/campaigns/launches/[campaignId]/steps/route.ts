import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
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
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { campaignId } = await context.params;
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("order_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { campaignId } = await context.params;
  const supabase = await getSupabase();

  const body = await request.json();

  const payload = {
    campaign_id: campaignId,
    type: typeof body?.type === "string" ? body.type : "text",
    name: typeof body?.name === "string" ? body.name : "",
    content: typeof body?.content === "string" ? body.content : "",
    order_index:
      typeof body?.order_index === "number" ? body.order_index : 0,
  };

  const { data, error } = await supabase
    .from("campaign_steps")
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

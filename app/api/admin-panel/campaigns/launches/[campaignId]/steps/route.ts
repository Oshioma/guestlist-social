import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// POST: Add a new step to the campaign
export async function POST(
  req: Request,
  { params }: { params: { campaignId: string } }
) {
  const { campaignId } = params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); }
      }
    }
  );

  const body = await req.json();
  const { type, name, content } = body;

  // Find the current highest order_index for the campaign
  const { data: steps, error: fetchErr } = await supabase
    .from("campaign_steps")
    .select("order_index")
    .eq("campaign_id", campaignId)
    .order("order_index", { ascending: false })
    .limit(1);

  const maxOrder = steps && steps.length > 0 ? steps[0].order_index : 0;

  const { error } = await supabase.from("campaign_steps").insert([{
    campaign_id: Number(campaignId), // cast because params are always strings
    type,
    name,
    content,
    order_index: maxOrder + 1
  }]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// GET: List all steps for a campaign, ordered
export async function GET(
  req: Request,
  { params }: { params: { campaignId: string } }
) {
  const { campaignId } = params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); }
      }
    }
  );

  const { data, error } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("order_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

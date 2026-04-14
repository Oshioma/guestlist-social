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

  // Find the current


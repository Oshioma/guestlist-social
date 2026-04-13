import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Helper: initialize Supabase using environment variables
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-only endpoints!
);

// Get currently authenticated user from cookies/header (depends on your auth config)
async function getUser(req: NextRequest) {
  // This is just a stub. If using Supabase Auth helpers, swap this for your method!
  // For more robust auth: https://supabase.com/docs/guides/auth/server-side/nextjs
  const access_token = req.headers.get("supabase-access-token");
  if (!access_token) return null;
  const { data } = await supabase.auth.getUser(access_token);
  return data?.user || null;
}

export async function GET(req: NextRequest) {
  // Only fetch templates user can see (private or org-wide)
  const user = await getUser(req);
  if (!user) return NextResponse.json([], { status: 401 });

  const { data, error } = await supabase
    .from("campaign_templates")
    .select("*")
    .or(`client_scope.eq.org,created_by.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // Validate input as needed!
  if (!body.name || !body.slug) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase.from("campaign_templates").insert([
    {
      name: body.name,
      slug: body.slug,
      status: "active",
      objective: body.objective || "LEAD_GENERATION",
      template_type: "lead_gen", // or whatever default you want
      description: body.description || "",
      created_by: user.id,
      client_scope: body.client_scope || "private",
      is_safe_autolaunch: false,
      version: 1
    }
  ]).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

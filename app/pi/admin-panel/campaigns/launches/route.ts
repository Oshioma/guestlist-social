import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser(req: NextRequest) {
  const access_token = req.headers.get("supabase-access-token");
  if (!access_token) return null;
  const { data } = await supabase.auth.getUser(access_token);
  return data?.user || null;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json([], { status: 401 });

  const { data, error } = await supabase
    .from("template_launches")
    .select(`
      *,
      campaign_templates (
        name
      )
    `)
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optionally flatten for the frontend:
  const launches = (data ?? []).map((launch: any) => ({
    ...launch,
    template: launch.campaign_templates ? { name: launch.campaign_templates.name } : undefined,
  }));

  return NextResponse.json(launches);
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// You should authenticate the user in production!
async function getUser(req: NextRequest) {
  const access_token = req.headers.get("supabase-access-token");
  if (!access_token) return null;
  const { data } = await supabase.auth.getUser(access_token);
  return data?.user || null;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template_id, inputs } = await req.json();

  // Compose your payload for template_launches
  const launchInsert = {
    template_id,
    client_id: inputs.client_id,
    inputs_json: inputs,
    status: "created",
    created_by: user.id,
    created_at: new Date().toISOString(),
    // Fill in other fields as needed (resolved_payload_json, etc)
  };

  const { data, error } = await supabase
    .from("template_launches")
    .insert([launchInsert])
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

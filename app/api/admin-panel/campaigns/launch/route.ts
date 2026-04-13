import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// import fetch from 'node-fetch'; (if not available globally)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper: meta API config—replace with your app’s real values
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_GRAPH_API = "https://graph.facebook.com/v19.0";

async function getUser(req: NextRequest) {
  const access_token = req.headers.get("supabase-access-token");
  if (!access_token) return null;
  const { data } = await supabase.auth.getUser(access_token);
  return data?.user || null;
}

function resolvePayload(template: any, inputs: any) {
  // Example: Flatten/transform your variables into Meta’s desired payload structure.
  // This must match your campaign/ad structure for Meta!
  // Replace this with your real mapping logic.
  return {
    name: inputs.campaign_name || template.name,
    status: "PAUSED", // Always create paused (as per project requirement)
    objective: template.objective || "LEAD_GENERATION",
    special_ad_category: "NONE",
    // ...other mappings as needed from inputs/template
    // NOTE: You'll need to add logic for ad sets, creatives, etc.
  };
}

async function createMetaCampaign(payload: any) {
  // Call Meta Graph API. Here, we only show the campaign creation step for brevity.
  const url = `${META_GRAPH_API}/act_${META_AD_ACCOUNT_ID}/campaigns?access_token=${META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { data, ok: res.ok, status: res.status };
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template_id, inputs } = await req.json();

  // Fetch the template and variables for validation & resolution
  const { data: template, error: tplErr } = await supabase
    .from("campaign_templates")
    .select("*, template_variables(*)")
    .eq("id", template_id)
    .single();
  if (tplErr || !template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  // Validate variables (similar as before)
  for (const v of template.template_variables || []) {
    if (v.required && !(inputs && inputs[v.key])) {
      return NextResponse.json({ error: `Missing field: ${v.key}` }, { status: 400 });
    }
    if (v.validation_rule && inputs && inputs[v.key]) {
      try {
        const re = new RegExp(v.validation_rule);
        if (!re.test(inputs[v.key])) {
          return NextResponse.json({ error: `Validation failed for: ${v.key}` }, { status: 400 });
        }
      } catch {}
    }
  }

  // 1. Resolve payload for Meta
  const payload = resolvePayload(template, inputs);

  // 2. Create campaign in Meta *paused*
  let metaResult: any = null;
  let metaError: string | null = null;
  let campaign_id: string | null = null;

  try {
    const resp = await createMetaCampaign(payload);
    metaResult = resp.data;
    if (!resp.ok) {
      metaError = JSON.stringify(metaResult);
    } else {
      campaign_id = metaResult.id || null;
    }
  } catch (err: any) {
    metaError = err.toString();
  }

  // Insert launch record with status & Meta ID/error
  const launchRecord = {
    template_id,
    client_id: inputs.client_id,
    inputs_json: inputs,
    resolved_payload_json: payload,
    meta_campaign_id: campaign_id,
    status: campaign_id ? "created" : "error",
    error_log: metaError,
    created_by: user.id,
    created_at: new Date().toISOString(),
  };

  const { data: launchData, error } = await supabase
    .from("template_launches")
    .insert([launchRecord])
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(launchData);
}

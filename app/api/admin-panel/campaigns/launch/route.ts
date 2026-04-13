import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { launchMetaFullChain, resolvePayload } from "@/lib/meta-payload";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Example auth extractor (replace with your real method if needed)
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

  // 1. Fetch the template and variables, validate
  const { data: template, error: tplErr } = await supabase
    .from("campaign_templates")
    .select("*, template_variables(*)")
    .eq("id", template_id)
    .single();
  if (tplErr || !template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  // 2. Confirm all needed inputs exist (simple required validation)
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

  let metaResult: any = null;
  let metaError: string | null = null;
  try {
    metaResult = await launchMetaFullChain(template, inputs);
  } catch (err: any) {
    metaError = err.toString();
  }

  // 3. Save launch record in DB
  const launchRecord = {
    template_id,
    client_id: inputs.client_id,
    inputs_json: inputs,
    resolved_payload_json: resolvePayload(template, inputs),
    meta_campaign_id: metaResult?.campaign_id || null,
    meta_adset_id: metaResult?.adset_id || null,
    meta_creative_id: metaResult?.creative_id || null,
    meta_ad_id: metaResult?.ad_id || null,
    status: metaResult?.ad_id ? "created" : "error",
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

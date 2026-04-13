// ...supabase setup as before

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template_id, inputs } = await req.json();

  // Fetch template and variables for backend validation
  const { data: template, error: tplErr } = await supabase
    .from("campaign_templates")
    .select("id, template_variables(*)")
    .eq("id", template_id)
    .single();

  if (tplErr || !template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  // Validate all variables
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

  // Insert launch as QUEUED (for async processing or just for status clarity)
  const launchInsert = {
    template_id,
    client_id: inputs.client_id,
    inputs_json: inputs,
    status: "queued",
    created_by: user.id,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("template_launches")
    .insert([launchInsert])
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

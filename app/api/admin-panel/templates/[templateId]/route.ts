import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase setup using env vars
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { templateId: string } }
) {
  // Fetch the template and its variables
  const { data: template, error } = await supabase
    .from("campaign_templates")
    .select(
      `
        *,
        template_variables (
          id, key, label, type, required, default_value, validation_rule, source
        )
      `
    )
    .eq("id", params.templateId)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  // Flatten for front-end; variables list as .variables
  template.variables = template.template_variables ?? [];
  delete template.template_variables;

  return NextResponse.json(template);
}

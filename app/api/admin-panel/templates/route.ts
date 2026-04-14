import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(
  req: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await context.params;

  if (!templateId) {
    return NextResponse.json(
      { error: "templateId is required" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
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

  const { data, error } = await supabase
    .from("campaign_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Template not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

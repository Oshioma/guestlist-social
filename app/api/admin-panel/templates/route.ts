import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// This route returns a single campaign template by ID as JSON.
export async function GET(
  req: Request,
  { params }: { params: { templateId: string } }
) {
  // Extract dynamically provided templateId from the URL
  const { templateId } = params;

  if (!templateId) {
    return NextResponse.json(
      { error: "templateId is required" },
      { status: 400 }
    );
  }

  // Await cookies() in Next.js 16+; provide custom cookie store interface
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

  // Fetch from the "campaign_templates" table; update name if your table differs
  const { data, error } = await supabase
    .from("campaign_templates") // <--- change if your table is named differently
    .select("*")
    .eq("id", templateId) // <--- or your PK column
    .single();

  // If no matching data or Supabase error, respond with 404/error
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Template not found" },
      { status: 404 }
    );
  }

  // Success: return the template data as JSON
  return NextResponse.json(data);
}

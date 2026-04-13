import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getRemoteLaunches } from "@/lib/getRemoteLaunches";

type RemoteLaunch = {
  template_id: string;
  error_log: string | null;
  created_at?: string;
};

export async function POST() {
  try {
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

    const remoteLaunches = await getRemoteLaunches();

    const cleanedLaunches: RemoteLaunch[] = Array.isArray(remoteLaunches)
      ? remoteLaunches
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" && item !== null
          )
          .map((item) => ({
            template_id:
              typeof item.template_id === "string" ? item.template_id : "",
            error_log:
              typeof item.error_log === "string" ? item.error_log : null,
            created_at:
              typeof item.created_at === "string" ? item.created_at : undefined,
          }))
          .filter((item) => item.template_id)
      : [];

    if (cleanedLaunches.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        message: "No launches to sync",
      });
    }

    const { error } = await supabase.from("launches").upsert(cleanedLaunches, {
      onConflict: "template_id",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      inserted: cleanedLaunches.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

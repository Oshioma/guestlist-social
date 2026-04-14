import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RouteContext = {
  params: Promise<{
    campaignId: string;
    stepId: string;
  }>;
};

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
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
}

// PATCH: edit attributes or move up/down
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { campaignId, stepId } = await context.params;
  const supabase = await getSupabase();

  const url = new URL(request.url);
  const move = url.searchParams.get("move");

  if (move === "up" || move === "down") {
    const { data: step, error: findError } = await supabase
      .from("campaign_steps")
      .select("id, order_index")
      .eq("id", stepId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    const operator = move === "up" ? "<" : ">";
    const ascending = move !== "up";

    const { data: neighbors, error: neighborError } = await supabase
      .from("campaign_steps")
      .select("id, order_index")
      .eq("campaign_id", campaignId)
      .filter("order_index", operator, step.order_index)
      .order("order_index", { ascending })
      .limit(1);

    if (neighborError) {
      return NextResponse.json(
        { error: neighborError.message },
        { status: 500 }
      );
    }

    const neighbor = neighbors && neighbors.length > 0 ? neighbors[0] : null;

    if (!neighbor) {
      return NextResponse.json(
        { error: "No step to move with" },
        { status: 400 }
      );
    }

    const { error: updateCurrentError } = await supabase
      .from("campaign_steps")
      .update({ order_index: neighbor.order_index })
      .eq("id", stepId)
      .eq("campaign_id", campaignId);

    if (updateCurrentError) {
      return NextResponse.json(
        { error: updateCurrentError.message },
        { status: 500 }
      );
    }

    const { error: updateNeighborError } = await supabase
      .from("campaign_steps")
      .update({ order_index: step.order_index })
      .eq("id", neighbor.id)
      .eq("campaign_id", campaignId);

    if (updateNeighborError) {
      return NextResponse.json(
        { error: updateNeighborError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  const body = await request.json();

  const patch: Record<string, unknown> = {};

  ["type", "name", "content"].forEach((key) => {
    if (body[key] !== undefined) {
      patch[key] = body[key];
    }
  });

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("campaign_steps")
    .update(patch)
    .eq("id", stepId)
    .eq("campaign_id", campaignId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE: delete a step
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { campaignId, stepId } = await context.params;
  const supabase = await getSupabase();

  const { error } = await supabase
    .from("campaign_steps")
    .delete()
    .eq("id", stepId)
    .eq("campaign_id", campaignId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

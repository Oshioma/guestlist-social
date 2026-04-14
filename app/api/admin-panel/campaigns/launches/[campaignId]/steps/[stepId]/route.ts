import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// PATCH: edit attributes or move up/down
export async function PATCH(
  request: NextRequest,
  { params }: { params: { campaignId: string; stepId: string } }
) {
  const { campaignId, stepId } = params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); }
      }
    }
  );

  // Support reorder
  const url = new URL(request.url);
  const move = url.searchParams.get("move");
  if (move === "up" || move === "down") {
    const { data: step, error: findErr } = await supabase
      .from("campaign_steps")
      .select("id, order_index")
      .eq("id", stepId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    // Find the neighbor step to swap order_index
    const op = move === "up" ? "<" : ">";
    const orderDir = move === "up" ? "desc" : "asc";
    const { data: neighbors } = await supabase
      .from("campaign_steps")
      .select("id, order_index")
      .eq("campaign_id", campaignId)
      .filter("order_index", op, step.order_index)
      .order("order_index", { ascending: move !== "up" })
      .limit(1);

    const neighbor = neighbors && neighbors.length > 0 ? neighbors[0] : null;
    if (!neighbor) {
      return NextResponse.json({ error: "No step to move with" }, { status: 400 });
    }

    // Swap order_index between current and neighbor
    await supabase
      .from("campaign_steps")
      .update({ order_index: neighbor.order_index })
      .eq("id", stepId);

    await supabase
      .from("campaign_steps")
      .update({ order_index: step.order_index })
      .eq("id", neighbor.id);

    return NextResponse.json({ ok: true });
  }

  // Otherwise, update one or more fields
  const body = await request.json();
  const patch: any = {};
  ["type", "name", "content"].forEach((key) => {
    if (body[key] !== undefined) patch[key] = body[key];
  });
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: { campaignId: string; stepId: string } }
) {
  const { campaignId, stepId } = params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); }
      }
    }
  );

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

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getAdSnapshot(ad: Record<string, unknown>) {
  const impressions = Number(ad.impressions ?? 0);
  const clicks = Number(ad.clicks ?? 0);
  const spend = Number(ad.spend ?? 0);
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0,
    conversions: Number(ad.conversions ?? 0),
    cost_per_result: Number(ad.cost_per_result ?? 0),
    performance_status: ad.performance_status ?? null,
    performance_score: ad.performance_score ?? null,
    captured_at: new Date().toISOString(),
  };
}

function pctChange(before: number, after: number): number {
  if (before === 0) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

// --- POST: create experiment, start experiment, or complete experiment ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action; // "create" | "start" | "complete" | "add_variant"

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
    }

    // ---------- CREATE ----------
    if (action === "create") {
      const { clientId, campaignId, title, hypothesis, variableTested, successMetric, secondaryMetric, controlAdId, variantAdId, controlNotes, variantNotes, baselineLabel, variantLabel } = body;

      if (!clientId || !title) {
        return NextResponse.json({ ok: false, error: "clientId and title required" }, { status: 400 });
      }

      const { data: exp, error: expError } = await supabase
        .from("experiments")
        .insert({
          client_id: clientId,
          campaign_id: campaignId || null,
          title,
          hypothesis: hypothesis || null,
          variable_tested: variableTested || null,
          baseline_label: baselineLabel || "control",
          variant_label: variantLabel || "variant",
          success_metric: successMetric || "ctr",
          secondary_metric: secondaryMetric || null,
          status: "planned",
        })
        .select("id")
        .single();

      if (expError || !exp) {
        return NextResponse.json({ ok: false, error: expError?.message ?? "Insert failed" }, { status: 500 });
      }

      // Add control and variant if provided
      const variants = [];
      if (controlAdId) {
        variants.push({
          experiment_id: exp.id,
          ad_id: controlAdId,
          label: baselineLabel || "control",
          role: "control",
          notes: controlNotes || null,
        });
      }
      if (variantAdId) {
        variants.push({
          experiment_id: exp.id,
          ad_id: variantAdId,
          label: variantLabel || "variant",
          role: "variant",
          notes: variantNotes || null,
        });
      }

      if (variants.length > 0) {
        const { error: varError } = await supabase.from("experiment_variants").insert(variants);
        if (varError) {
          console.error("Failed to insert variants:", varError.message);
        }
      }

      return NextResponse.json({ ok: true, experimentId: exp.id });
    }

    // ---------- ADD VARIANT ----------
    if (action === "add_variant") {
      const { experimentId, adId, label, role, notes } = body;

      if (!experimentId || !adId || !role) {
        return NextResponse.json({ ok: false, error: "experimentId, adId, and role required" }, { status: 400 });
      }

      const { error } = await supabase.from("experiment_variants").insert({
        experiment_id: experimentId,
        ad_id: adId,
        label: label || role,
        role,
        notes: notes || null,
      });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // ---------- START ----------
    if (action === "start") {
      const { experimentId } = body;
      if (!experimentId) {
        return NextResponse.json({ ok: false, error: "experimentId required" }, { status: 400 });
      }

      // Get all variants for this experiment
      const { data: variants, error: vError } = await supabase
        .from("experiment_variants")
        .select("id, ad_id")
        .eq("experiment_id", experimentId);

      if (vError || !variants || variants.length === 0) {
        return NextResponse.json({ ok: false, error: "No variants found" }, { status: 400 });
      }

      // Snapshot each variant's ad
      for (const v of variants) {
        const { data: ad } = await supabase
          .from("ads")
          .select("spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score")
          .eq("id", v.ad_id)
          .single();

        if (ad) {
          await supabase
            .from("experiment_variants")
            .update({ snapshot_before: getAdSnapshot(ad) })
            .eq("id", v.id);
        }
      }

      await supabase
        .from("experiments")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", experimentId);

      return NextResponse.json({ ok: true });
    }

    // ---------- COMPLETE ----------
    if (action === "complete") {
      const { experimentId, manualWinner, manualOutcome } = body;
      if (!experimentId) {
        return NextResponse.json({ ok: false, error: "experimentId required" }, { status: 400 });
      }

      // Get experiment
      const { data: exp, error: expErr } = await supabase
        .from("experiments")
        .select("*")
        .eq("id", experimentId)
        .single();

      if (expErr || !exp) {
        return NextResponse.json({ ok: false, error: "Experiment not found" }, { status: 404 });
      }

      // Get variants and snapshot after
      const { data: variants } = await supabase
        .from("experiment_variants")
        .select("id, ad_id, role, label, snapshot_before")
        .eq("experiment_id", experimentId);

      if (!variants || variants.length === 0) {
        return NextResponse.json({ ok: false, error: "No variants" }, { status: 400 });
      }

      const variantResults: Array<{
        id: number;
        role: string;
        label: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      }> = [];

      for (const v of variants) {
        const { data: ad } = await supabase
          .from("ads")
          .select("spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score")
          .eq("id", v.ad_id)
          .single();

        const afterSnap = ad ? getAdSnapshot(ad) : {};

        await supabase
          .from("experiment_variants")
          .update({ snapshot_after: afterSnap })
          .eq("id", v.id);

        variantResults.push({
          id: v.id,
          role: v.role,
          label: v.label,
          before: (v.snapshot_before as Record<string, unknown>) ?? {},
          after: afterSnap,
        });
      }

      // Auto-determine winner based on success metric
      const metric = exp.success_metric || "ctr";
      let winner: string | null = manualWinner || null;
      let outcome: string | null = manualOutcome || null;
      let confidence = "low";

      if (!winner && variantResults.length >= 2) {
        const control = variantResults.find((v) => v.role === "control");
        const variant = variantResults.find((v) => v.role === "variant");

        if (control && variant) {
          const cAfter = Number((control.after as Record<string, unknown>)[metric] ?? 0);
          const vAfter = Number((variant.after as Record<string, unknown>)[metric] ?? 0);

          // For CPC, lower is better
          const lowerIsBetter = metric === "cpc" || metric === "cost_per_result";
          const diff = lowerIsBetter ? cAfter - vAfter : vAfter - cAfter;
          const pct = pctChange(
            lowerIsBetter ? vAfter : cAfter,
            lowerIsBetter ? cAfter : vAfter
          );

          if (diff > 0) {
            winner = variant.label;
            outcome = "variant_wins";
          } else if (diff < 0) {
            winner = control.label;
            outcome = "control_wins";
          } else {
            outcome = "no_difference";
          }

          // Simple confidence based on magnitude of difference
          const absPct = Math.abs(pct);
          if (absPct >= 30) confidence = "high";
          else if (absPct >= 15) confidence = "medium";
          else confidence = "low";
        }
      }

      await supabase
        .from("experiments")
        .update({
          status: "completed",
          outcome,
          winner,
          confidence,
          completed_at: new Date().toISOString(),
        })
        .eq("id", experimentId);

      // Auto-generate a learning from the experiment
      if (exp.client_id) {
        const controlV = variantResults.find((v) => v.role === "control");
        const variantV = variantResults.find((v) => v.role === "variant");
        const learning = winner
          ? `Experiment "${exp.title}": ${winner} won on ${metric}. Variable tested: ${exp.variable_tested || "unknown"}. Confidence: ${confidence}.`
          : `Experiment "${exp.title}": no clear winner on ${metric}. Variable tested: ${exp.variable_tested || "unknown"}.`;

        const tags: string[] = ["experiment"];
        if (exp.variable_tested) tags.push(exp.variable_tested.toLowerCase());
        if (metric) tags.push(metric);

        await supabase.from("action_learnings").insert({
          client_id: exp.client_id,
          ad_id: exp.ad_id,
          problem: `Testing: ${exp.variable_tested || exp.title}`,
          action_taken: exp.hypothesis || exp.title,
          outcome: outcome || "neutral",
          metric_before: controlV?.before ?? null,
          metric_after: variantV?.after ?? null,
          learning,
          tags,
        });
      }

      return NextResponse.json({ ok: true, winner, outcome, confidence });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// --- GET: list experiments for a client ---
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
    }

    let query = supabase
      .from("experiments")
      .select("*, experiment_variants(*, ads(id, name))")
      .order("created_at", { ascending: false });

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, experiments: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

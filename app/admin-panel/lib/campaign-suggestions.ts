import { createClient } from "../../../lib/supabase/server";

// A single, serializable suggestion that the client-side creator can apply
// to the new-campaign form. Anything the operator can click to prefill the
// form ends up in this shape, regardless of whether it came from the
// client's own playbook, the agency-wide patterns, or a past winning ad.
export type CampaignSuggestion = {
  id: string;
  // Where it came from — shown as a small tag in the sidebar.
  source: "playbook" | "agency" | "winner";
  // Short label, rendered as the main text of the row.
  label: string;
  // One-line rationale ("5 clients · 82% consistent · +31% CTR").
  evidence: string;
  // What clicking "Apply" actually does. Any subset of fields can be
  // prefilled — missing fields are left untouched on the form.
  prefill: {
    name?: string;
    objective?: string;
    audience?: string;
    budget?: number;
  };
  creative?: {
    imageUrl?: string;
    headline?: string;
    body?: string;
    cta?: string;
    hookType?: string;
    formatStyle?: string;
  } | null;
};

export type CampaignSuggestionBundle = {
  playbook: CampaignSuggestion[];
  agency: CampaignSuggestion[];
  winners: CampaignSuggestion[];
};

// How many suggestions to show per section. Five is enough to be useful
// without overwhelming the sidebar; the operator can always open the
// Memory / What's Working pages for the full list.
const PER_SECTION_LIMIT = 5;

// Very light keyword mapping from pattern/category text to an ad objective,
// so clicking "Replace creative when CTR is low" can still prefill a sane
// objective. We deliberately stay conservative: if we can't map it, we
// leave the objective blank rather than guess wrong.
function guessObjectiveFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\blead/.test(t)) return "leads";
  if (/\bconvers|\bpurchase|\bsale/.test(t)) return "conversions";
  if (/\btraffic|\bclick|\bvisit/.test(t)) return "traffic";
  if (/\baware|\breach|\bimpression/.test(t)) return "awareness";
  if (/\bengag|\bview|\bwatch/.test(t)) return "engagement";
  return undefined;
}

export async function getCampaignSuggestions(
  clientId: string
): Promise<CampaignSuggestionBundle> {
  const supabase = await createClient();

  // 1) Client's own playbook — already curated from reliable learnings,
  //    so ranking is just by reliability × supporting count.
  const playbookPromise = supabase
    .from("client_playbooks")
    .select("id, category, insight, supporting_count, avg_reliability")
    .eq("client_id", clientId)
    .order("avg_reliability", { ascending: false })
    .limit(20);

  // 2) Client industry — so the agency-wide panel can prefer matching
  //    industry rows when they exist.
  const clientPromise = supabase
    .from("clients")
    .select("industry")
    .eq("id", clientId)
    .maybeSingle();

  // 3) Agency-wide patterns ranked by consistency × breadth. Mirrors the
  //    ranking used by <WhatsWorkingNow /> on the dashboard so the two
  //    surfaces show the same "top" patterns and the operator doesn't see
  //    them drift out of sync.
  const globalPromise = supabase
    .from("global_learnings")
    .select(
      "id, pattern_type, pattern_label, action_summary, unique_clients, times_seen, consistency_score, avg_ctr_lift, industry"
    )
    .gte("unique_clients", 2)
    .order("consistency_score", { ascending: false })
    .limit(40);

  // 4) The client's own winning ads — we show these as "clone the setup
  //    that already worked for this client". Score is the performance
  //    score the scoring pipeline writes; we also require spend > 0 so
  //    we don't surface draft rows.
  const winnersPromise = supabase
    .from("ads")
    .select(
      "id, name, objective, audience, budget, spend, ctr, performance_status, performance_score, creative_image_url, creative_headline, creative_body, creative_cta, hook_type, format_style"
    )
    .eq("client_id", clientId)
    .eq("performance_status", "winner")
    .gt("spend", 0)
    .order("performance_score", { ascending: false })
    .limit(PER_SECTION_LIMIT);

  const [playbookRes, clientRes, globalRes, winnersRes] = await Promise.all([
    playbookPromise,
    clientPromise,
    globalPromise,
    winnersPromise,
  ]);

  const industry = (clientRes.data?.industry ?? null) as string | null;

  // ---- Playbook ----
  const playbookRows = playbookRes.data ?? [];
  const playbook: CampaignSuggestion[] = playbookRows
    .slice(0, PER_SECTION_LIMIT)
    .map((row) => {
      const category = String(row.category ?? "insight");
      const insight = String(row.insight ?? "");
      const supporting = Number(row.supporting_count ?? 0);
      const reliability = Number(row.avg_reliability ?? 0);
      return {
        id: `playbook-${row.id}`,
        source: "playbook" as const,
        label: insight,
        evidence: `${category.replace(/_/g, " ")} · ${supporting} signals · ${Math.round(
          reliability
        )}% reliable`,
        prefill: {
          // Prefill the audience field only if the playbook row is about
          // audience insights — otherwise we'd be cross-wiring hooks into
          // the audience slot.
          audience: category === "audience_insights" ? insight : undefined,
          objective: guessObjectiveFromText(`${category} ${insight}`),
        },
      };
    });

  // ---- Agency-wide patterns, industry-preferred ----
  type GlobalRow = {
    id: number;
    pattern_label: string;
    action_summary: string;
    unique_clients: number | null;
    times_seen: number | null;
    consistency_score: number | null;
    avg_ctr_lift: number | null;
    industry: string | null;
  };
  const globalRows = (globalRes.data ?? []) as GlobalRow[];

  // Prefer industry-matching rows when we have them. The rest of the slots
  // are filled with agency-wide rows (industry=null) so we don't leave the
  // panel short when there are only a couple of industry-specific patterns.
  const industryRows = industry
    ? globalRows.filter((r) => r.industry === industry)
    : [];
  const agencyWide = globalRows.filter((r) => r.industry === null);
  const mergedGlobal = [
    ...industryRows,
    ...agencyWide.filter((r) => !industryRows.find((ir) => ir.id === r.id)),
  ];

  const ranked = mergedGlobal
    .map((r) => ({
      row: r,
      score:
        Number(r.consistency_score ?? 0) * Number(r.unique_clients ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_SECTION_LIMIT);

  const agency: CampaignSuggestion[] = ranked.map(({ row }) => {
    const lift = row.avg_ctr_lift;
    const liftLabel =
      lift != null
        ? lift > 0
          ? `+${Math.round(lift)}% CTR`
          : `${Math.round(lift)}% CTR`
        : null;
    const evidenceParts = [
      `${row.unique_clients ?? 0} clients`,
      `${Math.round(Number(row.consistency_score ?? 0))}% consistent`,
    ];
    if (liftLabel) evidenceParts.push(liftLabel);
    if (row.industry) evidenceParts.push(`in ${row.industry}`);

    return {
      id: `agency-${row.id}`,
      source: "agency" as const,
      label: row.action_summary || row.pattern_label || "Pattern",
      evidence: evidenceParts.join(" · "),
      prefill: {
        objective: guessObjectiveFromText(
          `${row.pattern_label} ${row.action_summary}`
        ),
      },
    };
  });

  // ---- Winning ads from this client ----
  type AdRow = {
    id: number | string;
    name: string | null;
    objective: string | null;
    audience: string | null;
    budget: number | null;
    spend: number | null;
    ctr: number | null;
    performance_score: number | null;
    creative_image_url: string | null;
    creative_headline: string | null;
    creative_body: string | null;
    creative_cta: string | null;
    hook_type: string | null;
    format_style: string | null;
  };
  const winnerRows = (winnersRes.data ?? []) as AdRow[];
  const winners: CampaignSuggestion[] = winnerRows.map((row) => {
    const ctr = row.ctr != null ? Number(row.ctr) : null;
    const spend = row.spend != null ? Number(row.spend) : null;
    const evidenceParts: string[] = [];
    if (ctr != null) evidenceParts.push(`${ctr.toFixed(2)}% CTR`);
    if (spend != null) evidenceParts.push(`£${spend.toFixed(0)} spend`);
    if (row.performance_score != null) {
      evidenceParts.push(`score ${row.performance_score}`);
    }
    if (row.hook_type) evidenceParts.push(row.hook_type);
    if (row.format_style) evidenceParts.push(row.format_style);
    const cleanName = row.name ? row.name.trim() : "Previous winner";

    const hasCreative =
      row.creative_image_url || row.creative_headline || row.creative_body || row.creative_cta;

    return {
      id: `winner-${row.id}`,
      source: "winner" as const,
      label: `Clone: ${cleanName}`,
      evidence: evidenceParts.join(" · ") || "Winner",
      prefill: {
        name: `${cleanName} — retest`,
        objective: row.objective ?? undefined,
        audience: row.audience ?? undefined,
        budget: row.budget != null ? Number(row.budget) : undefined,
      },
      creative: hasCreative
        ? {
            imageUrl: row.creative_image_url ?? undefined,
            headline: row.creative_headline ?? undefined,
            body: row.creative_body ?? undefined,
            cta: row.creative_cta ?? undefined,
            hookType: row.hook_type ?? undefined,
            formatStyle: row.format_style ?? undefined,
          }
        : null,
    };
  });

  return { playbook, agency, winners };
}

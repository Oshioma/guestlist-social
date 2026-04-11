export type DecisionConfidence = "low" | "medium" | "high";

export type Decision = {
  type: string;
  reason: string;
  action: string;
  confidence: DecisionConfidence;
  meta_action?: string | null; // optional Meta API action: "pause" | "unpause" | "update_budget"
};

type AdForDecision = {
  id: number | string;
  name?: string;
  performance_status?: string | null;
  performance_score?: number | null;
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  ctr?: number | null;
  cpc?: number | null;
  conversions?: number | null;
  cost_per_result?: number | null;
  created_at?: string | null;
};

type PlaybookInsight = {
  category: string;
  insight: string;
  avg_reliability: number;
};

type Learning = {
  problem: string;
  action_taken: string;
  outcome: string;
  reliability_score: number;
  times_seen: number;
};

const ENOUGH_SPEND = 10;
const STUCK_TEST_SPEND = 25;
const STRONG_WINNER_SCORE = 5;

export function getDecision(
  ad: AdForDecision,
  learnings?: Learning[],
  playbook?: PlaybookInsight[]
): Decision | null {
  const status = ad.performance_status;
  const spend = Number(ad.spend ?? 0);
  const score = Number(ad.performance_score ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const cpc = Number(ad.cpc ?? 0);
  const conversions = Number(ad.conversions ?? 0);

  // --- Winner: scale ---
  if (status === "winner") {
    if (score >= STRONG_WINNER_SCORE && conversions > 0) {
      return {
        type: "scale_budget",
        reason: `Strong winner (score ${score}) with ${conversions} conversions`,
        action: "Increase budget by 20-30%",
        confidence: "high",
        meta_action: "update_budget",
      };
    }
    return {
      type: "scale_budget",
      reason: "Consistent winning performance",
      action: "Increase budget by 20-30%",
      confidence: "medium",
      meta_action: "update_budget",
    };
  }

  // --- Losing: pause or replace ---
  if (status === "losing" && spend > ENOUGH_SPEND) {
    // Check if we have a proven fix from learnings
    const provenFix = learnings?.find(
      (l) =>
        l.outcome === "positive" &&
        l.reliability_score > 30 &&
        l.times_seen >= 2
    );

    if (provenFix) {
      return {
        type: "apply_known_fix",
        reason: `Losing ad. Proven fix available: "${provenFix.action_taken}" (seen ${provenFix.times_seen}x, ${provenFix.reliability_score.toFixed(0)}% reliable)`,
        action: provenFix.action_taken,
        confidence: provenFix.reliability_score > 60 ? "high" : "medium",
      };
    }

    if (conversions === 0 && spend > 20) {
      return {
        type: "pause_or_replace",
        reason: `No conversions after $${spend.toFixed(2)} spend`,
        action: "Pause ad and create new variation",
        confidence: "high",
        meta_action: "pause",
      };
    }

    if (ctr < 1.0) {
      return {
        type: "pause_or_replace",
        reason: `Low CTR (${ctr}%) after $${spend.toFixed(2)} spend`,
        action: "Pause ad. Test new hook + creative",
        confidence: "high",
        meta_action: "pause",
      };
    }

    if (cpc > 3.0) {
      return {
        type: "pause_or_replace",
        reason: `High CPC ($${cpc.toFixed(2)}) — clicks too expensive`,
        action: "Pause ad. Refine audience or improve relevance",
        confidence: "medium",
        meta_action: "pause",
      };
    }

    return {
      type: "pause_or_replace",
      reason: "Underperforming after sufficient spend",
      action: "Pause ad and create new variation",
      confidence: "medium",
      meta_action: "pause",
    };
  }

  // --- Testing stuck: kill ---
  if (status === "testing" && spend > STUCK_TEST_SPEND) {
    return {
      type: "kill_test",
      reason: `$${spend.toFixed(2)} spent with no clear signal`,
      action: "Stop test and reallocate budget",
      confidence: "medium",
      meta_action: "pause",
    };
  }

  // --- Playbook match: apply winning pattern ---
  if (status === "testing" && playbook && playbook.length > 0) {
    const winningPattern = playbook.find(
      (p) =>
        p.category === "winning_hooks" &&
        p.avg_reliability > 40
    );
    if (winningPattern) {
      return {
        type: "apply_winning_pattern",
        reason: `Playbook match: ${winningPattern.insight.slice(0, 80)}...`,
        action: "Apply proven creative pattern from playbook",
        confidence: winningPattern.avg_reliability > 60 ? "medium" : "low",
      };
    }
  }

  return null;
}

export function getDecisionsForAds(
  ads: AdForDecision[],
  learnings?: Learning[],
  playbook?: PlaybookInsight[]
): Array<{ ad: AdForDecision; decision: Decision }> {
  const results: Array<{ ad: AdForDecision; decision: Decision }> = [];

  for (const ad of ads) {
    const decision = getDecision(ad, learnings, playbook);
    if (decision) {
      results.push({ ad, decision });
    }
  }

  // Sort: high confidence first, then by type priority
  const typePriority: Record<string, number> = {
    pause_or_replace: 1,
    kill_test: 2,
    apply_known_fix: 3,
    scale_budget: 4,
    apply_winning_pattern: 5,
  };

  const confPriority: Record<string, number> = {
    high: 1,
    medium: 2,
    low: 3,
  };

  results.sort((a, b) => {
    const confDiff = (confPriority[a.decision.confidence] ?? 3) - (confPriority[b.decision.confidence] ?? 3);
    if (confDiff !== 0) return confDiff;
    return (typePriority[a.decision.type] ?? 9) - (typePriority[b.decision.type] ?? 9);
  });

  return results;
}

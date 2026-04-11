export type ActionSuggestion = {
  problem: string;
  action: string;
  priority: "high" | "medium" | "low";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getActionSuggestion(ad: any): ActionSuggestion | null {
  const status = ad.performance_status ?? ad.performanceStatus ?? ad._perfStatus;
  const reason = (ad.performance_reason ?? ad.performanceReason ?? ad._perfReason ?? "").toLowerCase();

  if (status === "paused") return null;

  if (status === "testing") {
    return {
      problem: "Not enough data",
      action: "Allow ad to run until minimum spend threshold",
      priority: "low",
    };
  }

  if (status === "winner") {
    return {
      problem: "Winning ad",
      action: "Increase budget gradually (20–30%)",
      priority: "medium",
    };
  }

  if (status === "losing") {
    if (reason.includes("ctr") || reason.includes("low ctr")) {
      return {
        problem: "Low engagement",
        action: "Test new creative (hook, image, headline)",
        priority: "high",
      };
    }

    if (reason.includes("cpc") || reason.includes("expensive")) {
      return {
        problem: "High cost per click",
        action: "Refine audience or improve ad relevance",
        priority: "high",
      };
    }

    if (reason.includes("no conversions")) {
      return {
        problem: "No conversions",
        action: "Fix landing page or improve offer",
        priority: "high",
      };
    }

    return {
      problem: "Underperforming",
      action: "Test new variation",
      priority: "medium",
    };
  }

  return null;
}

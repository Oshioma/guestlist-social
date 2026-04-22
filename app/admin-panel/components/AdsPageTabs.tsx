"use client";

import { useState } from "react";

type Tab = "ads" | "actions" | "playbook" | "experiments";

type Props = {
  counts: { ads: number; actions: number; decisions: number; playbook: number; experiments: number; learnings: number };
  adsPanel: React.ReactNode;
  actionsPanel: React.ReactNode;
  playbookPanel: React.ReactNode;
  experimentsPanel: React.ReactNode;
};

const TABS: { key: Tab; label: string; countKey: keyof Props["counts"] }[] = [
  { key: "ads", label: "Ads", countKey: "ads" },
  { key: "actions", label: "Actions & Decisions", countKey: "actions" },
  { key: "playbook", label: "Playbook", countKey: "playbook" },
  { key: "experiments", label: "Experiments", countKey: "experiments" },
];

export default function AdsPageTabs({
  counts,
  adsPanel,
  actionsPanel,
  playbookPanel,
  experimentsPanel,
}: Props) {
  const [active, setActive] = useState<Tab>("ads");

  function countLabel(tab: (typeof TABS)[number]): string {
    if (tab.key === "actions") {
      const a = counts.actions;
      const d = counts.decisions;
      if (a + d === 0) return "";
      return String(a + d);
    }
    if (tab.key === "playbook") {
      const p = counts.playbook + counts.learnings;
      return p > 0 ? String(p) : "";
    }
    const c = counts[tab.countKey];
    return c > 0 ? String(c) : "";
  }

  const panels: Record<Tab, React.ReactNode> = {
    ads: adsPanel,
    actions: actionsPanel,
    playbook: playbookPanel,
    experiments: experimentsPanel,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 6,
          border: "1px solid rgba(16,24,40,0.08)",
          borderRadius: 14,
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(8px)",
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          const badge = countLabel(tab);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              style={{
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? "#101828" : "#667085",
                background: isActive ? "#ffffff" : "transparent",
                border: isActive
                  ? "1px solid rgba(16,24,40,0.10)"
                  : "1px solid transparent",
                borderRadius: 999,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: isActive ? "0 2px 10px rgba(16,24,40,0.06)" : "none",
              }}
            >
              {tab.label}
              {badge && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: isActive ? "#101828" : "#e4e7ec",
                    color: isActive ? "#fff" : "#475467",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.key}
          style={{ display: active === tab.key ? "block" : "none" }}
        >
          {panels[tab.key]}
        </div>
      ))}
    </div>
  );
}

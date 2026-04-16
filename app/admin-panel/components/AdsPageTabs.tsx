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
          gap: 4,
          borderBottom: "2px solid #e4e4e7",
          marginBottom: 20,
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
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? "#18181b" : "#71717a",
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "2px solid #18181b"
                  : "2px solid transparent",
                marginBottom: -2,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
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
                    background: isActive ? "#18181b" : "#e4e4e7",
                    color: isActive ? "#fff" : "#52525b",
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

"use client";

import { useState } from "react";

type Tab = {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

export default function ClientDetailTabs({ tabs }: { tabs: Tab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid #e4e4e7",
          marginBottom: 20,
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#18181b" : "#71717a",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #18181b" : "2px solid transparent",
                marginBottom: -2,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: isActive ? "#18181b" : "#e4e4e7",
                    color: isActive ? "#fff" : "#52525b",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{active?.content}</div>
    </div>
  );
}

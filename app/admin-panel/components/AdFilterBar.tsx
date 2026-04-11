"use client";

import { useState } from "react";
import type { Ad } from "../lib/types";

type AdFilter = "all" | "winners" | "testing" | "losing";

const filters: { key: AdFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "winners", label: "Winners" },
  { key: "testing", label: "Testing" },
  { key: "losing", label: "Losing" },
];

function classify(ad: Ad): "winners" | "testing" | "losing" {
  if (ad.status === "draft" || ad.impressions < 1000) return "testing";
  if (ad.ctr >= 2.5) return "winners";
  return "losing";
}

export function useAdFilter(ads: Ad[]) {
  const [filter, setFilter] = useState<AdFilter>("all");

  const filtered =
    filter === "all" ? ads : ads.filter((ad) => classify(ad) === filter);

  return { filter, setFilter, filtered };
}

export default function AdFilterBar({
  current,
  onChange,
  counts,
}: {
  current: AdFilter;
  onChange: (f: AdFilter) => void;
  counts: Record<AdFilter, number>;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
      {filters.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: "5px 14px",
            borderRadius: 999,
            border: current === key ? "none" : "1px solid #e4e4e7",
            background: current === key ? "#18181b" : "#fff",
            color: current === key ? "#fff" : "#52525b",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {label} ({counts[key]})
        </button>
      ))}
    </div>
  );
}

export function getAdCounts(ads: Ad[]): Record<AdFilter, number> {
  const counts: Record<AdFilter, number> = {
    all: ads.length,
    winners: 0,
    testing: 0,
    losing: 0,
  };
  ads.forEach((ad) => {
    counts[classify(ad)]++;
  });
  return counts;
}

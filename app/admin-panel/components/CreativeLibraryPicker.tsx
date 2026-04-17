"use client";

import { useState } from "react";

type Creative = {
  url: string;
  name: string;
  source: "meta" | "ads" | "proofer";
  ctr?: number | null;
  spend?: number | null;
  status?: string | null;
};

type Props = {
  creatives: Creative[];
  onPick: (url: string) => void;
};

const SOURCE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  ads: { label: "Past ad", bg: "#dbeafe", text: "#1e40af" },
  proofer: { label: "Organic", bg: "#fef3c7", text: "#92400e" },
  meta: { label: "Meta library", bg: "#f3e8ff", text: "#6b21a8" },
};

const STATUS_COLORS: Record<string, string> = {
  winner: "#166534",
  testing: "#92400e",
  losing: "#991b1b",
  paused: "#71717a",
};

type Filter = "all" | "ads" | "proofer" | "meta";

export default function CreativeLibraryPicker({ creatives, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const isEmpty = creatives.length === 0;

  const filtered = isEmpty ? [] : filter === "all"
    ? creatives
    : creatives.filter((c) => c.source === filter);

  const sourceCounts = {
    ads: creatives.filter((c) => c.source === "ads").length,
    proofer: creatives.filter((c) => c.source === "proofer").length,
    meta: creatives.filter((c) => c.source === "meta").length,
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => !isEmpty && setOpen(!open)}
        disabled={isEmpty}
        title={isEmpty ? "No existing creatives — upload your first image or sync ads from Meta" : undefined}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: isEmpty ? "#a1a1aa" : "#18181b",
          fontSize: 12,
          fontWeight: 600,
          cursor: isEmpty ? "not-allowed" : "pointer",
        }}
      >
        {isEmpty
          ? "No library images yet"
          : open
          ? "Close library"
          : `Pick from library (${creatives.length})`}
      </button>

      {open && !isEmpty && (
        <div
          style={{
            marginTop: 8,
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#fafafa",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "8px 10px",
              borderBottom: "1px solid #f4f4f5",
              flexWrap: "wrap",
            }}
          >
            {(["all", "ads", "proofer", "meta"] as const).map((f) => {
              const count = f === "all" ? creatives.length : sourceCounts[f];
              if (f !== "all" && count === 0) return null;
              const active = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: active ? "#18181b" : "#e4e4e7",
                    color: active ? "#fff" : "#52525b",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f === "all" ? "All" : SOURCE_LABELS[f]?.label ?? f} ({count})
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
              gap: 8,
              maxHeight: 300,
              overflowY: "auto",
              padding: 10,
            }}
          >
            {filtered.map((c) => {
              const sl = SOURCE_LABELS[c.source];
              return (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => {
                    onPick(c.url);
                    setOpen(false);
                  }}
                  style={{
                    padding: 0,
                    border: "2px solid transparent",
                    borderRadius: 10,
                    background: "#fff",
                    cursor: "pointer",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                  title={c.name}
                >
                  <img
                    src={c.url}
                    alt={c.name}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div style={{ padding: "4px 6px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: 9,
                        fontWeight: 700,
                        background: sl?.bg ?? "#f4f4f5",
                        color: sl?.text ?? "#52525b",
                        textTransform: "uppercase",
                      }}
                    >
                      {sl?.label ?? c.source}
                    </span>
                    {c.ctr != null && (
                      <span
                        style={{
                          marginLeft: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          color: STATUS_COLORS[c.status ?? ""] ?? "#52525b",
                        }}
                      >
                        {c.ctr.toFixed(1)}% CTR
                      </span>
                    )}
                    {c.spend != null && c.spend > 0 && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: "#a1a1aa" }}>
                        £{Math.round(c.spend)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

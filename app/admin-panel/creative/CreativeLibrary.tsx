"use client";

// ---------------------------------------------------------------------------
// Client wrapper for the creative library. Owns nothing but filter + sort
// state — the data is already aggregated server-side and handed in via
// props. Keeps the page renderable instantly on cold load and avoids
// dragging the whole creative dataset across the network twice.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";

export type CreativeCard = {
  id: number;
  clientId: number;
  clientName: string;
  name: string;
  status: string | null;
  performanceStatus: string | null;
  performanceScore: number | null;

  // Creative trust layer
  imageUrl: string | null;
  videoUrl: string | null;
  body: string | null;
  headline: string | null;
  hook: string | null; // first 1–2 lines of body, pulled out separately
  cta: string | null;
  creativeType: string | null;
  hookType: string | null;
  formatStyle: string | null;

  // Metrics
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number; // percent
  cpc: number;

  // System judgment
  reason: string;
  pendingAction: string | null;
  suggestedNextMove: string | null;
  confidence: "low" | "medium" | "high";
  reuseLabel: string | null;

  createdAt: string;
};

const SORTS = [
  { key: "top", label: "Top performers" },
  { key: "worst", label: "Worst performers" },
  { key: "newest", label: "Newest" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const STATUSES = [
  { key: "all", label: "All" },
  { key: "winner", label: "Winners" },
  { key: "losing", label: "Losers" },
  { key: "testing", label: "Testing" },
];

// We pass the filter universes in from the server because we'd rather show
// the operator real options than every conceivable enum.
type FilterUniverse = {
  clients: { id: number; name: string }[];
  formats: string[];
  hooks: string[];
};

export default function CreativeLibrary({
  cards,
  filterUniverse,
}: {
  cards: CreativeCard[];
  filterUniverse: FilterUniverse;
}) {
  const [sort, setSort] = useState<SortKey>("top");
  const [status, setStatus] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");
  const [format, setFormat] = useState<string>("all");
  const [hook, setHook] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = cards;
    if (status !== "all") list = list.filter((c) => (c.status ?? "") === status);
    if (clientId !== "all")
      list = list.filter((c) => String(c.clientId) === clientId);
    if (format !== "all")
      list = list.filter(
        (c) => (c.creativeType ?? "").toLowerCase() === format.toLowerCase()
      );
    if (hook !== "all") list = list.filter((c) => c.hookType === hook);

    const sorted = [...list];
    if (sort === "top") {
      sorted.sort(
        (a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0)
      );
    } else if (sort === "worst") {
      sorted.sort(
        (a, b) => (a.performanceScore ?? 0) - (b.performanceScore ?? 0)
      );
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return sorted;
  }, [cards, sort, status, clientId, format, hook]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          padding: 14,
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Select
          label="Client"
          value={clientId}
          onChange={setClientId}
          options={[
            { value: "all", label: "All clients" },
            ...filterUniverse.clients.map((c) => ({
              value: String(c.id),
              label: c.name,
            })),
          ]}
        />
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: "all", label: "All formats" },
            ...filterUniverse.formats.map((f) => ({ value: f, label: f })),
          ]}
        />
        <Select
          label="Hook"
          value={hook}
          onChange={setHook}
          options={[
            { value: "all", label: "All hooks" },
            ...filterUniverse.hooks.map((h) => ({
              value: h,
              label: h.replace(/_/g, " "),
            })),
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        />

        {/* Sort tabs — pushed right */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                border: "1px solid",
                borderColor: sort === s.key ? "#0f172a" : "#e4e4e7",
                background: sort === s.key ? "#0f172a" : "#fff",
                color: sort === s.key ? "#fff" : "#52525b",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div style={{ fontSize: 12, color: "#71717a" }}>
        {filtered.length} {filtered.length === 1 ? "creative" : "creatives"} ·{" "}
        sorted by {SORTS.find((s) => s.key === sort)?.label.toLowerCase()}
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            color: "#a1a1aa",
            background: "#fff",
            border: "1px dashed #e4e4e7",
            borderRadius: 12,
            fontSize: 13,
          }}
        >
          No creatives match these filters.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((c) => (
            <Card key={c.id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 10,
        color: "#71717a",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontWeight: 600,
      }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 8px",
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 6,
          border: "1px solid #d4d4d8",
          background: "#fff",
          color: "#18181b",
          cursor: "pointer",
          textTransform: "none",
          letterSpacing: "normal",
          minWidth: 140,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  winner: { bg: "#dcfce7", fg: "#166534" },
  losing: { bg: "#fee2e2", fg: "#991b1b" },
  testing: { bg: "#dbeafe", fg: "#1e40af" },
  paused: { bg: "#f4f4f5", fg: "#52525b" },
};

const CONFIDENCE_BADGE: Record<
  CreativeCard["confidence"],
  { bg: string; fg: string }
> = {
  low: { bg: "#fef3c7", fg: "#92400e" },
  medium: { bg: "#e0f2fe", fg: "#0369a1" },
  high: { bg: "#dcfce7", fg: "#166534" },
};

function Card({ card }: { card: CreativeCard }) {
  const status = (card.status ?? "testing").toLowerCase();
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.testing;
  const confidenceBadge = CONFIDENCE_BADGE[card.confidence];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Preview */}
      <div
        style={{
          aspectRatio: "1.91 / 1",
          background: "#0f172a",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {card.imageUrl ? (
          // Plain <img> on purpose: these are remote Meta CDN URLs that
          // change every sync, and next/image's optimizer would just stand
          // between us and the source for no benefit.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#a1a1aa",
              fontSize: 12,
            }}
          >
            No preview
          </div>
        )}

        {/* Status pill, top-left */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            padding: "3px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            background: badge.bg,
            color: badge.fg,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {status}
        </div>

        {/* Reuse / scale label, top-right */}
        {card.reuseLabel && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              padding: "3px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              background: "#0f172a",
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            ★ {card.reuseLabel}
          </div>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flex: 1,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: 600,
            }}
          >
            {card.clientName}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 14,
              fontWeight: 600,
              color: "#18181b",
              lineHeight: 1.4,
            }}
          >
            {card.name}
          </div>
        </div>

        {/* Hook (visually distinct from headline + body) */}
        {card.hook && (
          <div
            style={{
              padding: "10px 12px",
              background: "#fef3c7",
              borderRadius: 8,
              borderLeft: "3px solid #f59e0b",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#92400e",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              Hook
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#92400e",
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {card.hook}
            </div>
          </div>
        )}

        {card.headline && (
          <Field label="Headline" value={card.headline} />
        )}
        {card.cta && <Field label="CTA" value={card.cta} mono />}

        {/* Tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {card.creativeType && <Tag>{card.creativeType.toLowerCase()}</Tag>}
          {card.hookType && <Tag>{card.hookType.replace(/_/g, " ")}</Tag>}
          {card.formatStyle && <Tag>{card.formatStyle.replace(/_/g, " ")}</Tag>}
        </div>

        {/* Top metrics */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            padding: "10px 0",
            borderTop: "1px solid #f4f4f5",
            borderBottom: "1px solid #f4f4f5",
          }}
        >
          <Metric label="Spend" value={`$${card.spend.toFixed(0)}`} />
          <Metric label="CTR" value={`${card.ctr.toFixed(2)}%`} />
          <Metric label="CPC" value={`$${card.cpc.toFixed(2)}`} />
        </div>

        {/* Reason — why the system thinks what it thinks */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#71717a",
              lineHeight: 1.5,
              flex: 1,
            }}
          >
            <strong style={{ color: "#52525b" }}>Why:</strong> {card.reason}
          </div>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 700,
              background: confidenceBadge.bg,
              color: confidenceBadge.fg,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
            title="Confidence is based on spend depth and conversion volume"
          >
            {card.confidence} conf
          </span>
        </div>

        {/* Suggested next move OR existing pending action */}
        {(card.pendingAction || card.suggestedNextMove) && (
          <div
            style={{
              padding: "10px 12px",
              background: "#f0f9ff",
              borderRadius: 8,
              border: "1px solid #bae6fd",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#0c4a6e",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              {card.pendingAction ? "Pending action" : "Suggested next move"}
            </div>
            <div style={{ fontSize: 12, color: "#0c4a6e", lineHeight: 1.4 }}>
              {card.pendingAction ?? card.suggestedNextMove}
            </div>
          </div>
        )}

        <Link
          href={`/app/clients/${card.clientId}/ads/${card.id}`}
          style={{
            marginTop: "auto",
            display: "block",
            textAlign: "center",
            padding: "8px 12px",
            background: "#0f172a",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Open audit trail →
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: "#a1a1aa",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#27272a",
          lineHeight: 1.4,
          fontFamily: mono ? "ui-monospace, monospace" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 10,
        background: "#f4f4f5",
        color: "#52525b",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: "#a1a1aa",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 14,
          fontWeight: 700,
          color: "#18181b",
        }}
      >
        {value}
      </div>
    </div>
  );
}

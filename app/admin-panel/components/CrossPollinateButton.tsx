"use client";

/**
 * Cross-pollinate trigger button (operator-only).
 *
 * Sits on the meta-queue page. Two actions:
 *   - Preview → GET /api/cross-pollinate. Reads suggestions, no DB writes.
 *   - Seed   → POST /api/cross-pollinate. Inserts queue rows for every
 *              suggestion via seedCrossClientDuplicate (dedupe-safe).
 *
 * Renders a compact summary inline once a response comes back so the
 * operator doesn't have to open devtools to see what happened.
 */

import { useState } from "react";

type Suggestion = {
  targetClientId: number;
  targetClientName: string;
  donorAdMetaId: string;
  donorAdName: string | null;
  donorClientName: string;
  evidence: {
    clientCount: number;
    avgCtr: number;
    sampleSize: number;
    industryScoped: boolean;
  };
  reason: string;
};

type ApiResponse = {
  ok: boolean;
  mode?: "preview" | "seed";
  stats?: {
    adsScanned: number;
    clientsScanned: number;
    combosFound: number;
    qualifyingCombos: number;
    suggestionsBeforeCap: number;
    suggestionsAfterCap: number;
  };
  suggestions?: Suggestion[];
  seeded?: number;
  deduped?: number;
  errors?: string[];
  error?: string;
};

export default function CrossPollinateButton() {
  const [busy, setBusy] = useState<"preview" | "seed" | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function run(mode: "preview" | "seed") {
    setBusy(mode);
    setResult(null);
    try {
      const res = await fetch("/api/cross-pollinate", {
        method: mode === "preview" ? "GET" : "POST",
      });
      const json = (await res.json()) as ApiResponse;
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #d4d4d8",
          background: "#fafafa",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
          Cross-pollinate from winning patterns
        </div>
        <div style={{ fontSize: 12, color: "#71717a", marginTop: 4, maxWidth: 720 }}>
          Walks every client and finds creative patterns they&rsquo;re missing
          (validated by ≥2 other clients at &gt;1.5% avg CTR). Seeds
          duplicate_ad queue rows pointing at the strongest donor ad. Preview
          first, then seed.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => run("preview")}
            disabled={busy !== null}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              background: "#fff",
              color: "#18181b",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy === "preview" ? "Previewing…" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => run("seed")}
            disabled={busy !== null}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #18181b",
              background: "#18181b",
              color: "#fff",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy === "seed" ? "Seeding…" : "Seed queue rows"}
          </button>
        </div>

        {result && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#3f3f46" }}>
            {!result.ok ? (
              <div style={{ color: "#991b1b" }}>
                Failed: {result.error ?? "unknown error"}
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>
                  {result.mode === "seed"
                    ? `Seeded ${result.seeded ?? 0} (deduped ${result.deduped ?? 0})`
                    : `Preview: ${result.suggestions?.length ?? 0} suggestion${
                        result.suggestions?.length === 1 ? "" : "s"
                      }`}
                </div>
                {result.stats && (
                  <div style={{ color: "#71717a", marginTop: 2 }}>
                    Scanned {result.stats.adsScanned} ads across{" "}
                    {result.stats.clientsScanned} clients ·{" "}
                    {result.stats.qualifyingCombos} qualifying patterns ·{" "}
                    {result.stats.suggestionsAfterCap} suggestions after cap
                  </div>
                )}
                {result.errors && result.errors.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ color: "#991b1b", cursor: "pointer" }}>
                      {result.errors.length} error
                      {result.errors.length === 1 ? "" : "s"}
                    </summary>
                    <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                      {result.errors.slice(0, 10).map((e, i) => (
                        <li key={i} style={{ color: "#991b1b" }}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {result.suggestions && result.suggestions.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", color: "#3f3f46" }}>
                      Show suggestions
                    </summary>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {result.suggestions.slice(0, 30).map((s, i) => (
                        <li
                          key={i}
                          style={{ marginBottom: 6, color: "#3f3f46" }}
                        >
                          <strong>{s.targetClientName}</strong> ←{" "}
                          {s.donorAdName ?? "(unnamed donor)"} from{" "}
                          {s.donorClientName} · {s.evidence.avgCtr}% CTR ·{" "}
                          {s.evidence.clientCount} clients
                          {s.evidence.industryScoped && " (industry-scoped)"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

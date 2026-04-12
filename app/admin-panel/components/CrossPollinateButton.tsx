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

type TopCombo = {
  patternKey: string;
  creative_type: string | null;
  hook_type: string | null;
  format_style: string | null;
  clientCount: number;
  adCount: number;
  avgCtr: number;
  qualified: boolean;
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
    funnel?: {
      withMetaId: number;
      meetingImpressionFloor: number;
      withAnyCreativeAttr: number;
      eligibleDonors: number;
    };
    rejected?: {
      emptyPattern: number;
      tooFewClients: number;
      ctrBelowFloor: number;
    };
  };
  topCombos?: TopCombo[];
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
          Copy winning ads to clients missing them
        </div>
        <div style={{ fontSize: 12, color: "#71717a", marginTop: 4, maxWidth: 720 }}>
          Looks across every client for ad styles that are working well
          somewhere but missing here. Queues a copy of the best version for
          each client that doesn&rsquo;t have it yet. Preview first to see the
          list, then queue them up when you&rsquo;re happy.
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
            {busy === "seed" ? "Queuing…" : "Queue them up"}
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
                    ? `Queued ${result.seeded ?? 0} new cop${result.seeded === 1 ? "y" : "ies"}${
                        result.deduped ? ` (skipped ${result.deduped} already queued)` : ""
                      }`
                    : `${result.suggestions?.length ?? 0} cop${
                        result.suggestions?.length === 1 ? "y" : "ies"
                      } would be queued`}
                </div>
                {result.stats && (
                  <div style={{ color: "#71717a", marginTop: 2 }}>
                    Looked at {result.stats.adsScanned} ads across{" "}
                    {result.stats.clientsScanned} clients · found{" "}
                    {result.stats.qualifyingCombos} winning style
                    {result.stats.qualifyingCombos === 1 ? "" : "s"}
                  </div>
                )}
                {result.stats?.funnel && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", color: "#3f3f46" }}>
                      Why we picked these
                    </summary>
                    <div
                      style={{
                        margin: "6px 0 0 18px",
                        color: "#52525b",
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        Has meta_id: <strong>{result.stats.funnel.withMetaId}</strong>{" "}
                        / {result.stats.adsScanned}
                      </div>
                      <div>
                        Meets impression floor:{" "}
                        <strong>
                          {result.stats.funnel.meetingImpressionFloor}
                        </strong>
                      </div>
                      <div>
                        Has any creative attribute (creative_type / hook_type /
                        format_style):{" "}
                        <strong>
                          {result.stats.funnel.withAnyCreativeAttr}
                        </strong>
                      </div>
                      <div>
                        Eligible donors:{" "}
                        <strong>{result.stats.funnel.eligibleDonors}</strong>
                      </div>
                      {result.stats.rejected && (
                        <div style={{ marginTop: 6 }}>
                          Combos rejected — empty pattern:{" "}
                          <strong>
                            {result.stats.rejected.emptyPattern}
                          </strong>
                          , single-client:{" "}
                          <strong>
                            {result.stats.rejected.tooFewClients}
                          </strong>
                          , CTR below floor:{" "}
                          <strong>
                            {result.stats.rejected.ctrBelowFloor}
                          </strong>
                        </div>
                      )}
                    </div>
                  </details>
                )}
                {result.topCombos && result.topCombos.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", color: "#3f3f46" }}>
                      Top combos found ({result.topCombos.length})
                    </summary>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {result.topCombos.map((c) => (
                        <li
                          key={c.patternKey}
                          style={{
                            marginBottom: 4,
                            color: c.qualified ? "#166534" : "#71717a",
                          }}
                        >
                          {c.format_style ?? "?"} / {c.creative_type ?? "?"} /{" "}
                          {c.hook_type ?? "?"} · {c.clientCount} client
                          {c.clientCount === 1 ? "" : "s"} · {c.adCount} ads ·{" "}
                          {c.avgCtr}% CTR
                          {c.qualified ? " ✓" : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
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

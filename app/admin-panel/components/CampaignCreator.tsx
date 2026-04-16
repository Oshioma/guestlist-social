"use client";

import { useState } from "react";
import CampaignForm from "./CampaignForm";
import AiSuggestButton from "./AiSuggestButton";
import type { CampaignSuggestionBundle, CampaignSuggestion } from "../lib/campaign-suggestions";

type Props = {
  clientId: string;
  title?: string;
  submitLabel?: string;
  action: (
    state: { error: string | null },
    formData: FormData
  ) => Promise<{ error: string | null }>;
  suggestions: CampaignSuggestionBundle;
};

// A light wrapper around <CampaignForm /> that adds a "suggestions from the
// engine" sidebar. Clicking "Apply" on a suggestion re-mounts the form with
// new initialValues (via the key prop) so the existing CampaignForm stays
// untouched and continues to work for the edit page.
export default function CampaignCreator({
  clientId,
  title,
  submitLabel,
  action,
  suggestions,
}: Props) {
  const [prefill, setPrefill] = useState<{
    name: string;
    objective: string;
    budget: number;
    audience: string;
    status: string;
  }>({
    name: "",
    objective: "engagement",
    budget: 0,
    audience: "",
    status: "testing",
  });
  // Bumping this forces CampaignForm to remount with the new defaults.
  const [formKey, setFormKey] = useState(0);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const applySuggestion = (s: CampaignSuggestion) => {
    setPrefill((prev) => ({
      name: s.prefill.name ?? prev.name,
      objective: s.prefill.objective ?? prev.objective,
      budget: s.prefill.budget ?? prev.budget,
      audience: s.prefill.audience ?? prev.audience,
      status: prev.status,
    }));
    setFormKey((k) => k + 1);
    setAppliedId(s.id);
  };

  const hasAny =
    suggestions.playbook.length > 0 ||
    suggestions.agency.length > 0 ||
    suggestions.winners.length > 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 360px)",
        gap: 20,
        alignItems: "flex-start",
      }}
    >
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>&#9733;</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>
              AI Suggestions
            </span>
            <span style={{ fontSize: 11, color: "#71717a" }}>
              Click any field to get an AI recommendation
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AiSuggestButton
              clientId={clientId}
              field="audience"
              objective={prefill.objective}
              budget={prefill.budget}
              campaignName={prefill.name}
              onApply={(v) => {
                setPrefill((p) => ({ ...p, audience: v }));
                setFormKey((k) => k + 1);
              }}
            />
            <AiSuggestButton
              clientId={clientId}
              field="headline"
              objective={prefill.objective}
              budget={prefill.budget}
              campaignName={prefill.name}
              onApply={(v) => {
                setPrefill((p) => ({ ...p, name: v }));
                setFormKey((k) => k + 1);
              }}
            />
            <AiSuggestButton
              clientId={clientId}
              field="budget"
              objective={prefill.objective}
              campaignName={prefill.name}
              onApply={(v) => {
                const num = parseFloat(v.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(num) && num > 0) {
                  setPrefill((p) => ({ ...p, budget: num }));
                  setFormKey((k) => k + 1);
                }
              }}
            />
            <AiSuggestButton
              clientId={clientId}
              field="creative"
              objective={prefill.objective}
              budget={prefill.budget}
              campaignName={prefill.name}
              onApply={() => {}}
            />
          </div>
        </div>
        <CampaignForm
          key={formKey}
          title={title}
          submitLabel={submitLabel}
          action={action}
          initialValues={prefill}
        />
      </div>

      <aside
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          position: "sticky",
          top: 20,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-block",
              padding: "3px 8px",
              borderRadius: 999,
              background: "#eef2ff",
              color: "#4338ca",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            From the engine
          </div>
          <h2
            style={{
              margin: "8px 0 2px",
              fontSize: 16,
              fontWeight: 700,
              color: "#18181b",
              letterSpacing: "-0.01em",
            }}
          >
            Suggestions for this campaign
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#71717a",
              lineHeight: 1.5,
            }}
          >
            Click <strong>Apply</strong> to pre-fill the form with a pattern
            we&rsquo;ve seen work — from this client, the agency, or a past
            winning ad. You can still edit anything before you save.
          </p>
        </div>

        {!hasAny && (
          <div
            style={{
              fontSize: 12,
              color: "#71717a",
              padding: "10px 12px",
              background: "#fafafa",
              border: "1px dashed #e4e4e7",
              borderRadius: 10,
              lineHeight: 1.5,
            }}
          >
            No patterns yet. Once this client has completed actions, or the
            agency playbook has been generated, suggestions will appear here
            automatically.
          </div>
        )}

        <Section
          label="From this client's playbook"
          items={suggestions.playbook}
          appliedId={appliedId}
          onApply={applySuggestion}
        />
        <Section
          label="From the agency playbook"
          items={suggestions.agency}
          appliedId={appliedId}
          onApply={applySuggestion}
        />
        <Section
          label="Clone a past winner"
          items={suggestions.winners}
          appliedId={appliedId}
          onApply={applySuggestion}
        />
      </aside>
    </div>
  );
}

function Section({
  label,
  items,
  appliedId,
  onApply,
}: {
  label: string;
  items: CampaignSuggestion[];
  appliedId: string | null;
  onApply: (s: CampaignSuggestion) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#52525b",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((s) => {
          const isApplied = appliedId === s.id;
          return (
            <div
              key={s.id}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: "10px 12px",
                background: isApplied ? "#f5f3ff" : "#fafafa",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                transition: "background 120ms",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#18181b",
                  lineHeight: 1.35,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 11, color: "#71717a" }}>{s.evidence}</div>
              {s.creative && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "6px 8px",
                    background: "#f8fafc",
                    border: "1px solid #f1f5f9",
                    borderRadius: 8,
                  }}
                >
                  {s.creative.imageUrl && (
                    <img
                      src={s.creative.imageUrl}
                      alt=""
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 6,
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ fontSize: 11, color: "#52525b", lineHeight: 1.4, minWidth: 0 }}>
                    {s.creative.headline && (
                      <div style={{ fontWeight: 600 }}>{s.creative.headline}</div>
                    )}
                    {s.creative.body && (
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.creative.body}
                      </div>
                    )}
                    {(s.creative.cta || s.creative.hookType || s.creative.formatStyle) && (
                      <div style={{ color: "#94a3b8", marginTop: 2 }}>
                        {[s.creative.cta, s.creative.hookType, s.creative.formatStyle]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => onApply(s)}
                  style={{
                    border: "1px solid #18181b",
                    background: isApplied ? "#18181b" : "#fff",
                    color: isApplied ? "#fff" : "#18181b",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {isApplied ? "Applied" : "Apply"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

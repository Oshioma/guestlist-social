"use client";

import { useState } from "react";
import CampaignForm from "./CampaignForm";
import type { CampaignSuggestionBundle, CampaignSuggestion } from "../lib/campaign-suggestions";

type Props = {
  clientId: string;
  clientIndustry?: string;
  clientWebsite?: string;
  existingCreatives?: { url: string; name: string; source: "meta" | "ads" | "proofer" | "storage"; ctr?: number | null; spend?: number | null; status?: string | null }[];
  winningAds?: { name: string; imageUrl: string | null; headline: string | null; body: string | null; cta: string | null; destinationUrl: string | null; ctr: number; spend: number }[];
  title?: string;
  submitLabel?: string;
  action: (
    state: { error: string | null },
    formData: FormData
  ) => Promise<{ error: string | null }>;
  suggestions: CampaignSuggestionBundle;
};

export default function CampaignCreator({
  clientId,
  clientIndustry,
  clientWebsite,
  existingCreatives,
  winningAds,
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
    startDate?: string;
    endDate?: string;
    placement?: string;
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
    <div>
      <CampaignForm
        key={formKey}
        clientId={clientId}
        clientIndustry={clientIndustry}
        clientWebsite={clientWebsite}
        showAdFields
        existingCreatives={existingCreatives}
        winningAds={winningAds}
        title={title}
        submitLabel={submitLabel}
        action={action}
        initialValues={prefill}
      />

      {hasAny && (
      <details
        style={{
          marginTop: 16,
          background: "#fafafa",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          maxWidth: 720,
        }}
      >
        <summary
          style={{
            padding: "12px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#52525b",
            cursor: "pointer",
            listStyle: "none",
          }}
        >
          What&rsquo;s worked before — click to expand
        </summary>
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
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
        </div>
      </details>
      )}
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

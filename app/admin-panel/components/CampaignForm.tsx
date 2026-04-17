"use client";

import React, { useActionState, useEffect, useState } from "react";
import AiInlineSuggestion from "./AiInlineSuggestion";

type CampaignFormValues = {
  name: string;
  objective: string;
  budget: number;
  audience: string;
  status: string;
  startDate?: string;
  endDate?: string;
  placement?: string;
};

type Props = {
  clientId?: string;
  title?: string;
  submitLabel?: string;
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
  initialValues?: CampaignFormValues;
};

export default function CampaignForm({
  clientId,
  title = "New Campaign",
  submitLabel = "Create campaign",
  action,
  initialValues,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  type Sug = { suggestion: string | null; reasoning: string | null };
  const [ai, setAi] = useState<{ audience: Sug; budget: Sug; headline: Sug }>({
    audience: { suggestion: null, reasoning: null },
    budget: { suggestion: null, reasoning: null },
    headline: { suggestion: null, reasoning: null },
  });
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setAiLoading(true);
    fetch("/api/ai-suggest-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, objective: initialValues?.objective ?? "engagement" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.suggestions) {
          setAi({
            audience: data.suggestions.audience ?? { suggestion: null, reasoning: null },
            budget: data.suggestions.budget ?? { suggestion: null, reasoning: null },
            headline: data.suggestions.headline ?? { suggestion: null, reasoning: null },
          });
        }
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [clientId]);

  return (
    <div
      style={{
        maxWidth: 720,
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {state.error && (
          <div
            style={{
              fontSize: 13,
              color: "#b91c1c",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            {state.error}
          </div>
        )}

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Campaign name</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.headline.suggestion}
                reasoning={ai.headline.reasoning}
                loading={aiLoading}
                onApply={(v) => {
                  const input = document.querySelector<HTMLInputElement>("input[name='name']");
                  if (input) { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); }
                }}
              />
            )}
          </div>
          <input
            name="name"
            defaultValue={initialValues?.name ?? ""}
            style={inputStyle}
            placeholder="Summer sale — image test"
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Objective</label>
          <select name="objective" defaultValue={initialValues?.objective ?? "engagement"} style={inputStyle}>
            <option value="engagement">Engagement</option>
            <option value="conversions">Conversions</option>
            <option value="traffic">Traffic</option>
            <option value="awareness">Awareness</option>
            <option value="leads">Leads</option>
          </select>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Budget (£/day)</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.budget.suggestion}
                reasoning={ai.budget.reasoning}
                loading={aiLoading}
                onApply={(v) => {
                  const match = v.match(/(\d+(?:\.\d+)?)/);
                  const num = match ? parseFloat(match[1]) : NaN;
                  const input = document.querySelector<HTMLInputElement>("input[name='budget']");
                  if (input && Number.isFinite(num)) { input.value = String(num); input.dispatchEvent(new Event("input", { bubbles: true })); }
                }}
              />
            )}
          </div>
          <input
            name="budget"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initialValues?.budget ?? 0}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Audience</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.audience.suggestion}
                reasoning={ai.audience.reasoning}
                loading={aiLoading}
                onApply={(v) => {
                  const input = document.querySelector<HTMLInputElement>("input[name='audience']");
                  if (input) { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); }
                }}
              />
            )}
          </div>
          <input
            name="audience"
            defaultValue={initialValues?.audience ?? ""}
            style={inputStyle}
            placeholder="18-35, London, interests: nightlife"
          />
        </div>

        <DurationPicker
          budget={initialValues?.budget ?? 0}
          initialStartDate={initialValues?.startDate}
          initialEndDate={initialValues?.endDate}
        />

        <div>
          <label style={labelStyle}>Placement</label>
          <select name="placement" defaultValue={initialValues?.placement ?? "automatic"} style={inputStyle}>
            <option value="automatic">Automatic (recommended)</option>
            <option value="feed_only">Feed only</option>
            <option value="stories_only">Stories only</option>
            <option value="feed_and_stories">Feed + Stories</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select name="status" defaultValue={initialValues?.status ?? "testing"} style={inputStyle}>
            <option value="testing">Testing (paused in Meta)</option>
            <option value="live">Live (active in Meta)</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "12px 14px",
            background: "#18181b",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? (submitLabel === "Create campaign" ? "Creating..." : "Saving...") : submitLabel}
        </button>
      </form>
    </div>
  );
}

function DurationPicker({
  budget,
  initialStartDate,
  initialEndDate,
}: {
  budget: number;
  initialStartDate?: string;
  initialEndDate?: string;
}) {
  const [showCustom, setShowCustom] = React.useState(false);
  const [startDate, setStartDate] = React.useState(initialStartDate ?? "");
  const [endDate, setEndDate] = React.useState(initialEndDate ?? "");
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null);

  const presets = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "1 month", days: 30 },
  ];

  function applyPreset(days: number, label: string) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
    setSelectedPreset(label);
    setShowCustom(false);
  }

  const dayCount =
    startDate && endDate
      ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
  const totalBudget = dayCount * budget;

  return (
    <div>
      <label style={labelStyle}>Campaign duration</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.days, p.label)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: selectedPreset === p.label ? "none" : "1px solid #e4e4e7",
              background: selectedPreset === p.label ? "#18181b" : "#fff",
              color: selectedPreset === p.label ? "#fff" : "#52525b",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setShowCustom(!showCustom); setSelectedPreset(null); }}
          title="Custom dates"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: showCustom ? "none" : "1px solid #e4e4e7",
            background: showCustom ? "#18181b" : "#fff",
            color: showCustom ? "#fff" : "#71717a",
            fontSize: 16,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &#128197;
        </button>

        {dayCount > 0 && budget > 0 && (
          <span style={{ fontSize: 13, color: "#18181b", fontWeight: 600, marginLeft: 4 }}>
            {dayCount} day{dayCount === 1 ? "" : "s"} · Total: £{totalBudget.toFixed(0)}
          </span>
        )}
      </div>

      {showCustom && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #e4e4e7",
            background: "#fafafa",
            marginBottom: 4,
          }}
        >
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSelectedPreset(null); }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setSelectedPreset(null); }}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      <input type="hidden" name="startDate" value={startDate} />
      <input type="hidden" name="endDate" value={endDate} />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  color: "#18181b",
};

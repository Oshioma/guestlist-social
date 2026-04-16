"use client";

import { useState, useTransition } from "react";

type Props = {
  initial: {
    internalData: boolean;
    metaAdLibrary: boolean;
    clientWebsite: boolean;
    clientWebsiteUrl: string;
  };
  onSave: (values: Props["initial"]) => Promise<void>;
};

const SOURCES = [
  {
    key: "internalData" as const,
    label: "Internal data",
    description: "Winning/losing ads, client playbook, agency patterns, organic captions, decision outcomes",
    icon: "◈",
  },
  {
    key: "metaAdLibrary" as const,
    label: "Meta Ad Library",
    description: "Live competitor ads in the client's industry — real headlines, copy, and creative approaches running right now",
    icon: "◇",
  },
  {
    key: "clientWebsite" as const,
    label: "Client website",
    description: "Scrape the client's landing page for brand voice, offers, product names, and tone",
    icon: "▣",
  },
];

export default function AiSourcesForm({ initial, onSave }: Props) {
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    values.internalData !== initial.internalData ||
    values.metaAdLibrary !== initial.metaAdLibrary ||
    values.clientWebsite !== initial.clientWebsite ||
    values.clientWebsiteUrl !== initial.clientWebsiteUrl;

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await onSave(values);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, color: "#52525b", margin: 0, lineHeight: 1.5 }}>
        Control which data sources the AI uses when generating suggestions
        for campaign audience, headlines, copy, CTAs, budget, and creative
        direction. Toggle sources on/off — the AI will only read from what
        you enable.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SOURCES.map((source) => {
          const checked = values[source.key];
          return (
            <div
              key={source.key}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${checked ? "#bbf7d0" : "#e4e4e7"}`,
                background: checked ? "#ecfdf5" : "#fff",
                alignItems: "flex-start",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [source.key]: e.target.checked }))
                }
                style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b", display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12 }}>{source.icon}</span>
                  {source.label}
                </div>
                <div style={{ fontSize: 12, color: "#71717a", marginTop: 2, lineHeight: 1.4 }}>
                  {source.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {values.clientWebsite && (
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#71717a", marginBottom: 4 }}>
            Client website URL
          </label>
          <input
            value={values.clientWebsiteUrl}
            onChange={(e) => setValues((v) => ({ ...v, clientWebsiteUrl: e.target.value }))}
            placeholder="https://clientsite.com"
            type="url"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: dirty && !isPending ? "#18181b" : "#d4d4d8",
            color: dirty && !isPending ? "#fff" : "#a1a1aa",
            fontSize: 13,
            fontWeight: 600,
            cursor: dirty && !isPending ? "pointer" : "not-allowed",
          }}
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span style={{ fontSize: 12, color: "#166534" }}>Saved</span>}
        {error && <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>}
      </div>
    </div>
  );
}

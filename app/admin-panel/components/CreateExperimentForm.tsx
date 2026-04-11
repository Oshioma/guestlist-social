"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdOption = {
  id: number;
  name: string;
};

export default function CreateExperimentForm({
  clientId,
  ads,
}: {
  clientId: string;
  ads: AdOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [variableTested, setVariableTested] = useState("");
  const [successMetric, setSuccessMetric] = useState("ctr");
  const [secondaryMetric, setSecondaryMetric] = useState("");
  const [controlAdId, setControlAdId] = useState("");
  const [variantAdId, setVariantAdId] = useState("");
  const [controlNotes, setControlNotes] = useState("");
  const [variantNotes, setVariantNotes] = useState("");

  async function handleSubmit() {
    if (!title.trim()) {
      setMessage("Title is required");
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          clientId,
          title: title.trim(),
          hypothesis: hypothesis.trim() || null,
          variableTested: variableTested.trim() || null,
          successMetric,
          secondaryMetric: secondaryMetric || null,
          controlAdId: controlAdId || null,
          variantAdId: variantAdId || null,
          controlNotes: controlNotes.trim() || null,
          variantNotes: variantNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage("Experiment created");
        setTitle("");
        setHypothesis("");
        setVariableTested("");
        setControlAdId("");
        setVariantAdId("");
        setControlNotes("");
        setVariantNotes("");
        setOpen(false);
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            background: "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + New Experiment
        </button>
        {message && (
          <span style={{ fontSize: 11, color: "#166534" }}>{message}</span>
        )}
      </div>
    );
  }

  const inputStyle = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e4e4e7",
    fontSize: 13,
    width: "100%",
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 600 as const,
    color: "#52525b",
    marginBottom: 4,
    display: "block" as const,
  };

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
        New Experiment
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Hook test: question vs statement"
          />
        </div>
        <div>
          <label style={labelStyle}>Variable being tested</label>
          <input
            style={inputStyle}
            value={variableTested}
            onChange={(e) => setVariableTested(e.target.value)}
            placeholder="e.g. headline, image, audience"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Hypothesis</label>
          <input
            style={inputStyle}
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g. Question hooks get higher CTR than statement hooks"
          />
        </div>
        <div>
          <label style={labelStyle}>Success metric</label>
          <select
            style={inputStyle}
            value={successMetric}
            onChange={(e) => setSuccessMetric(e.target.value)}
          >
            <option value="ctr">CTR</option>
            <option value="cpc">CPC</option>
            <option value="conversions">Conversions</option>
            <option value="cost_per_result">Cost per result</option>
            <option value="performance_score">Performance score</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Secondary metric</label>
          <select
            style={inputStyle}
            value={secondaryMetric}
            onChange={(e) => setSecondaryMetric(e.target.value)}
          >
            <option value="">None</option>
            <option value="ctr">CTR</option>
            <option value="cpc">CPC</option>
            <option value="conversions">Conversions</option>
            <option value="cost_per_result">Cost per result</option>
          </select>
        </div>

        {ads.length > 0 && (
          <>
            <div>
              <label style={labelStyle}>Control ad</label>
              <select
                style={inputStyle}
                value={controlAdId}
                onChange={(e) => setControlAdId(e.target.value)}
              >
                <option value="">Select ad...</option>
                {ads.map((ad) => (
                  <option key={ad.id} value={ad.id}>
                    {ad.name}
                  </option>
                ))}
              </select>
              <input
                style={{ ...inputStyle, marginTop: 4 }}
                value={controlNotes}
                onChange={(e) => setControlNotes(e.target.value)}
                placeholder="Control notes (optional)"
              />
            </div>
            <div>
              <label style={labelStyle}>Variant ad</label>
              <select
                style={inputStyle}
                value={variantAdId}
                onChange={(e) => setVariantAdId(e.target.value)}
              >
                <option value="">Select ad...</option>
                {ads.map((ad) => (
                  <option key={ad.id} value={ad.id}>
                    {ad.name}
                  </option>
                ))}
              </select>
              <input
                style={{ ...inputStyle, marginTop: 4 }}
                value={variantNotes}
                onChange={(e) => setVariantNotes(e.target.value)}
                placeholder="Variant notes (optional)"
              />
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            background: "#18181b",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create Experiment"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            background: "#fff",
            color: "#71717a",
            fontSize: 12,
            border: "1px solid #e4e4e7",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        {message && (
          <span
            style={{
              fontSize: 11,
              color: message.startsWith("Error") ? "#991b1b" : "#166534",
            }}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

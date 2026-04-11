"use client";

import { useActionState } from "react";

type Props = {
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
};

export default function CampaignForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

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
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>New Campaign</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#71717a" }}>
          Launch a new ad campaign for this client.
        </p>
      </div>

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
          <label style={labelStyle}>Campaign name</label>
          <input
            name="name"
            style={inputStyle}
            placeholder="Summer sale — image test"
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Objective</label>
            <select name="objective" defaultValue="engagement" style={inputStyle}>
              <option value="engagement">Engagement</option>
              <option value="conversions">Conversions</option>
              <option value="traffic">Traffic</option>
              <option value="awareness">Awareness</option>
              <option value="leads">Leads</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Budget (£)</label>
            <input
              name="budget"
              type="number"
              min="0"
              step="0.01"
              defaultValue={0}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Audience</label>
          <input
            name="audience"
            style={inputStyle}
            placeholder="18-35, London, interests: nightlife"
          />
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select name="status" defaultValue="testing" style={inputStyle}>
            <option value="testing">Testing</option>
            <option value="winner">Winner</option>
            <option value="paused">Paused</option>
            <option value="losing">Losing</option>
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
          {pending ? "Creating..." : "Create campaign"}
        </button>
      </form>
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

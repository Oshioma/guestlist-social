"use client";

import { useActionState } from "react";

type AdFormValues = {
  name: string;
  status: "winner" | "testing" | "losing" | "paused";
  spend: number;
  impressions: number;
  clicks: number;
  engagement: number;
  conversions: number;
  audience?: string;
  creativeHook?: string;
  notes?: string;
};

type Props = {
  title?: string;
  submitLabel?: string;
  action: (
    state: { error: string | null },
    formData: FormData
  ) => Promise<{ error: string | null }>;
  initialValues?: AdFormValues;
};

export default function AdForm({
  title = "New ad",
  submitLabel = "Create ad",
  action,
  initialValues,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <div
      style={{
        maxWidth: 760,
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
          <label style={labelStyle}>Ad name</label>
          <input
            name="name"
            defaultValue={initialValues?.name ?? ""}
            style={inputStyle}
            placeholder="Sunset Smoothie Video"
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              name="status"
              defaultValue={initialValues?.status ?? "testing"}
              style={inputStyle}
            >
              <option value="testing">Testing</option>
              <option value="winner">Winner</option>
              <option value="losing">Losing</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Spend</label>
            <input
              name="spend"
              type="number"
              min="0"
              step="0.01"
              defaultValue={initialValues?.spend ?? 0}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <div>
            <label style={labelStyle}>Impressions</label>
            <input
              name="impressions"
              type="number"
              min="0"
              step="1"
              defaultValue={initialValues?.impressions ?? 0}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Clicks</label>
            <input
              name="clicks"
              type="number"
              min="0"
              step="1"
              defaultValue={initialValues?.clicks ?? 0}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Engagement</label>
            <input
              name="engagement"
              type="number"
              min="0"
              step="1"
              defaultValue={initialValues?.engagement ?? 0}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Conversions</label>
            <input
              name="conversions"
              type="number"
              min="0"
              step="1"
              defaultValue={initialValues?.conversions ?? 0}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Audience</label>
          <input
            name="audience"
            defaultValue={initialValues?.audience ?? ""}
            style={inputStyle}
            placeholder="Local food lovers"
          />
        </div>

        <div>
          <label style={labelStyle}>Creative hook</label>
          <input
            name="creativeHook"
            defaultValue={initialValues?.creativeHook ?? ""}
            style={inputStyle}
            placeholder="Cold smoothie in sunset light"
          />
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            name="notes"
            defaultValue={initialValues?.notes ?? ""}
            style={{
              ...inputStyle,
              minHeight: 110,
              resize: "vertical",
            }}
            placeholder="Anything worth remembering about performance or creative angle..."
          />
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
          {pending ? "Saving..." : submitLabel}
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

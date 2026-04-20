"use client";

import { useActionState } from "react";

type ClientFormValues = {
  name: string;
  platform: string;
  monthlyBudget: number;
  status: "active" | "paused" | "onboarding";
  websiteUrl?: string;
  notes?: string;
  industry?: string;
  metaAdAccountId?: string;
};

type Props = {
  title: string;
  submitLabel: string;
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
  initialValues?: ClientFormValues;
};

export default function ClientForm({
  title,
  submitLabel,
  action,
  initialValues,
}: Props) {
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
        <h1 style={{ margin: 0, fontSize: 28 }}>{title}</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#71717a" }}>
          Add or update a client profile for the dashboard.
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
          <label style={labelStyle}>Client name</label>
          <input
            name="name"
            defaultValue={initialValues?.name ?? ""}
            style={inputStyle}
            placeholder="Organzibar"
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Platform</label>
            <input
              name="platform"
              defaultValue={initialValues?.platform ?? "Meta"}
              style={inputStyle}
              placeholder="Meta"
            />
          </div>

          <div>
            <label style={labelStyle}>Monthly budget</label>
            <input
              name="monthlyBudget"
              type="number"
              min="0"
              step="0.01"
              defaultValue={initialValues?.monthlyBudget ?? 3}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Website URL</label>
            <input
              name="websiteUrl"
              defaultValue={initialValues?.websiteUrl ?? ""}
              style={inputStyle}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Industry</label>
            <input
              name="industry"
              defaultValue={initialValues?.industry ?? ""}
              style={inputStyle}
              placeholder="Hospitality"
              list="industry-suggestions"
            />
            {/* Suggestions, not an enum — operators can type anything. */}
            <datalist id="industry-suggestions">
              <option value="Hospitality" />
              <option value="Restaurants" />
              <option value="Fitness" />
              <option value="Beauty" />
              <option value="Retail" />
              <option value="E-commerce" />
              <option value="Real estate" />
              <option value="Professional services" />
              <option value="Health" />
              <option value="Education" />
            </datalist>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Meta Ad Account ID</label>
          <input
            name="metaAdAccountId"
            defaultValue={initialValues?.metaAdAccountId ?? ""}
            style={inputStyle}
            placeholder="act_123456789 (leave blank to use default)"
          />
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
            Per-client ad account. Found in Meta Ads Manager URL. Leave blank to use the global account.
          </div>
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
            placeholder="Client notes, context, positioning, priorities..."
          />
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select
            name="status"
            defaultValue={initialValues?.status ?? "onboarding"}
            style={inputStyle}
          >
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
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

"use client";

import { useActionState } from "react";
import {
  importConsultationForClientAction,
  type ImportConsultationState,
} from "../lib/consultation-actions";

type ClientOption = {
  id: number;
  name: string;
};

type Props = {
  clients: ClientOption[];
};

const INITIAL_STATE: ImportConsultationState = {
  error: null,
  success: null,
};

export default function ConsultationImportForm({ clients }: Props) {
  const [state, action, pending] = useActionState(
    importConsultationForClientAction,
    INITIAL_STATE
  );

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state.error ? (
        <div
          style={{
            border: "1px solid #fecaca",
            borderRadius: 10,
            background: "#fff5f5",
            color: "#991b1b",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div
          style={{
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            background: "#f0fdf4",
            color: "#166534",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {state.success}
        </div>
      ) : null}

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "#52525b" }}>Client</span>
        <select
          name="clientId"
          required
          style={{
            width: "100%",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            background: "#fff",
            color: "#18181b",
          }}
        >
          <option value="">Select client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "#52525b" }}>Consultation row</span>
        <textarea
          name="consultationRow"
          required
          rows={7}
          placeholder="Paste one full consultation response row"
          style={{
            width: "100%",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            fontFamily: "monospace",
            lineHeight: 1.5,
            background: "#fff",
            color: "#18181b",
            resize: "vertical",
          }}
        />
      </label>

      <div>
        <button
          type="submit"
          disabled={pending}
          style={{
            border: "none",
            borderRadius: 8,
            background: "#18181b",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.75 : 1,
          }}
        >
          {pending ? "Importing..." : "Import consultation row"}
        </button>
      </div>
    </form>
  );
}

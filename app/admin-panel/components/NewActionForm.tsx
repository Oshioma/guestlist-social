"use client";

import { useState, useTransition } from "react";
import type { Client } from "../lib/types";
import { createAction } from "../lib/actions";

export default function NewActionForm({
  clients,
}: {
  clients: Client[];
}) {
  const [clientId, setClientId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [kind, setKind] = useState<"pause" | "scale" | "creative" | "review">("review");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await createAction({
          clientId: clientId || null,
          title,
          priority,
          kind,
        });

        setTitle("");
        setClientId("");
        setPriority("medium");
        setKind("review");
      } catch (err) {
        console.error(err);
        setError("Could not create action.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {error && (
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
          {error}
        </div>
      )}

      <div>
        <label style={labelStyle}>Action title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pause weak image ad"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Client</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={inputStyle}
        >
          <option value="">No client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Kind</label>
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "pause" | "scale" | "creative" | "review")
            }
            style={inputStyle}
          >
            <option value="review">Review</option>
            <option value="pause">Pause</option>
            <option value="scale">Scale</option>
            <option value="creative">Creative</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Priority</label>
          <select
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value as "low" | "medium" | "high")
            }
            style={inputStyle}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending || !title.trim()}
        style={{
          border: "none",
          borderRadius: 10,
          padding: "11px 14px",
          background: "#18181b",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: isPending || !title.trim() ? "not-allowed" : "pointer",
          opacity: isPending || !title.trim() ? 0.6 : 1,
        }}
      >
        {isPending ? "Saving..." : "Create action"}
      </button>
    </form>
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

"use client";

import { useState, useTransition } from "react";

type ClientOption = { id: string; name: string };

const tags = ["creative", "process", "deadline", "budget", "strategy"];

export default function MemoryForm({
  clients,
  onSubmit,
}: {
  clients: ClientOption[];
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("strategy");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("note", note);
    fd.set("tag", tag);

    startTransition(async () => {
      try {
        await onSubmit(fd);
        setNote("");
        setTag("strategy");
        setClientId("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save memory."
        );
      }
    });
  }

  const ready = clientId && note.trim();

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        padding: 16,
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
        Add a memory
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={{
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 13,
            background: "#fff",
            flex: "1 1 180px",
          }}
        >
          <option value="">Select client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          style={{
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 13,
            background: "#fff",
            textTransform: "capitalize",
          }}
        >
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Prefers warm-toned visuals. No blue in creatives."
        rows={2}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          fontSize: 13,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!ready || isPending}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background: ready && !isPending ? "#18181b" : "#d4d4d8",
          color: ready && !isPending ? "#fff" : "#a1a1aa",
          fontSize: 13,
          fontWeight: 600,
          cursor: ready && !isPending ? "pointer" : "not-allowed",
          alignSelf: "flex-start",
        }}
      >
        {isPending ? "Saving..." : "Save memory"}
      </button>
    </div>
  );
}

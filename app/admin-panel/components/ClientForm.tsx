"use client";

import { useState, useTransition } from "react";
import type { Client } from "../lib/types";
import { createClientAction, updateClientAction } from "../lib/client-actions";

export default function ClientForm({
  client,
}: {
  client?: Client;
}) {
  const isEdit = !!client;

  const [name, setName] = useState(client?.name ?? "");
  const [platform, setPlatform] = useState(client?.platform ?? "Meta");
  const [monthlyBudget, setMonthlyBudget] = useState(
    client?.monthlyBudget ? String(client.monthlyBudget) : ""
  );
  const [status, setStatus] = useState(() => {
    if (!client) return "onboarding";
    if (client.status === "active") return "growing";
    if (client.status === "paused") return "needs_attention";
    return "onboarding";
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const budget = parseFloat(monthlyBudget);
    if (isNaN(budget) || budget < 0) {
      setError("Enter a valid monthly budget.");
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit && client) {
          await updateClientAction(client.id, {
            name,
            platform,
            monthlyBudget: budget,
            status,
          });
        } else {
          await createClientAction({
            name,
            platform,
            monthlyBudget: budget,
            status,
          });
        }
      } catch (err) {
        console.error(err);
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}
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
        <label style={labelStyle}>Client name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
          required
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Platform</label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={inputStyle}
        >
          <option value="Meta">Meta</option>
          <option value="Google">Google</option>
          <option value="TikTok">TikTok</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="X">X</option>
        </select>
      </div>

      <div>
        <label style={labelStyle}>Monthly budget (£)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={monthlyBudget}
          onChange={(e) => setMonthlyBudget(e.target.value)}
          placeholder="1500"
          required
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={inputStyle}
        >
          <option value="onboarding">Onboarding</option>
          <option value="growing">Active / Growing</option>
          <option value="needs_attention">Needs Attention</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending || !name.trim()}
        style={{
          border: "none",
          borderRadius: 10,
          padding: "12px 16px",
          background: "#18181b",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: isPending || !name.trim() ? "not-allowed" : "pointer",
          opacity: isPending || !name.trim() ? 0.6 : 1,
        }}
      >
        {isPending ? "Saving..." : isEdit ? "Update client" : "Create client"}
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

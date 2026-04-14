"use client";

import React, { useState } from "react";
import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Exchange = "Binance" | "Coinbase";

type Connection = {
  id: string;
  label: string;
  exchange: Exchange;
  apiKey: string;
  connected: boolean;
};

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#1a1a2e",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 14,
};

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_CONNECTIONS: Connection[] = [
  {
    id: "conn-1",
    label: "Main Binance Account",
    exchange: "Binance",
    apiKey: "bnb_xxxx_xxxx_xxxx",
    connected: true,
  },
  {
    id: "conn-2",
    label: "Coinbase Pro",
    exchange: "Coinbase",
    apiKey: "cb_xxxx_xxxx_xxxx",
    connected: false,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CryptoPage() {
  const [connections] = useState<Connection[]>(SAMPLE_CONNECTIONS);
  const [activeId, setActiveId] = useState<string>(SAMPLE_CONNECTIONS[0].id);

  const activeConnection =
    connections.find((c) => c.id === activeId) ?? connections[0];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0d1a",
        color: "#fff",
        padding: "32px 24px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
          ← Finance
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 4px" }}>
          Crypto
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0 }}>
          Exchange connections · Demo data
        </p>
      </div>

      {/* Connection selector */}
      <div style={{ marginBottom: 32 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Active connection
        </label>
        <select
          style={inputStyle}
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
        >
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Connection detail */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: 24,
          maxWidth: 480,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 20 }}>
          Connection details
        </h2>

        <Field label="Label">
          <input style={inputStyle} value={activeConnection.label} readOnly />
        </Field>

        <Field label="Exchange">
          {/*
           * <select> does not support the readOnly attribute — only <input> and
           * <textarea> do. Use disabled to make the field non-interactive while
           * still displaying the current value.
           */}
          <select
            style={inputStyle}
            value={activeConnection.exchange}
            disabled
          >
            <option>{activeConnection.exchange}</option>
          </select>
        </Field>

        <Field label="API key">
          <input
            style={inputStyle}
            value={activeConnection.apiKey}
            type="password"
            readOnly
          />
        </Field>

        {/* Status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: activeConnection.connected ? "#00ff88" : "#ff4d4d",
            }}
          />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {activeConnection.connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </div>
  );
}

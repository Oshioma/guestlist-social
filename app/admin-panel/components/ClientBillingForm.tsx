"use client";

// ---------------------------------------------------------------------------
// ClientBillingForm — admin-only. What this client pays the agency (monthly
// retainer) and whether they're on direct debit. Rendered only for admins on
// the client-edit page; never surfaced in the client portal.
// ---------------------------------------------------------------------------

import { useState, useTransition } from "react";
import { updateClientBillingAction } from "../lib/client-actions";

export default function ClientBillingForm({
  clientId,
  initialMonthlyPrice,
  initialDirectDebit,
}: {
  clientId: string | number;
  initialMonthlyPrice: number | null;
  initialDirectDebit: boolean;
}) {
  const [price, setPrice] = useState<string>(
    initialMonthlyPrice != null ? String(initialMonthlyPrice) : ""
  );
  const [directDebit, setDirectDebit] = useState<boolean>(initialDirectDebit);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const trimmed = price.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && !Number.isFinite(parsed)) {
      setError("Price must be a number.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await updateClientBillingAction(String(clientId), {
        monthlyPrice: parsed,
        directDebit,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setMessage("Saved");
      setTimeout(() => setMessage(null), 1500);
    });
  }

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              margin: 0,
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Billing
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#9333ea",
                background: "#f5f3ff",
                border: "1px solid #e9d5ff",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              Admin only
            </span>
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              color: "#71717a",
              maxWidth: 520,
              lineHeight: 1.5,
            }}
          >
            What this client pays us each month. Feeds the cashflow forecast.
            Never shown in the client portal.
          </p>
        </div>
        <span
          style={{
            fontSize: 12,
            color: error ? "#dc2626" : "#16a34a",
            minHeight: 16,
          }}
        >
          {error ?? message ?? ""}
        </span>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "flex-end",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <label style={labelStyle}>Monthly price</label>
          <div style={{ display: "inline-flex", alignItems: "center" }}>
            <span style={{ color: "#71717a", marginRight: 4 }}>£</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              style={{
                width: 130,
                border: "1px solid #e4e4e7",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
                background: "#fff",
                color: "#18181b",
                textAlign: "right",
              }}
            />
            <span style={{ color: "#a1a1aa", marginLeft: 6, fontSize: 13 }}>
              /mo
            </span>
          </div>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingBottom: 10,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <Switch
            on={directDebit}
            disabled={pending}
            onClick={() => setDirectDebit((v) => !v)}
          />
          <span>
            <span
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 600,
                color: "#18181b",
              }}
            >
              Pays by direct debit
            </span>
            <span style={{ display: "block", fontSize: 12, color: "#a1a1aa" }}>
              {directDebit ? "On direct debit" : "Invoiced / other"}
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "10px 16px",
            background: "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            marginBottom: 2,
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 6,
};

function Switch({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: on ? "#16a34a" : "#d4d4d8",
        position: "relative",
        cursor: disabled ? "wait" : "pointer",
        flexShrink: 0,
        transition: "background 120ms ease",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 120ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

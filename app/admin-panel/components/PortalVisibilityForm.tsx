"use client";

// ---------------------------------------------------------------------------
// Per-client portal visibility toggles.
//
// Operator decides, for this client, which portal sections are shown:
// Content (proofer), Ads, Reviews, Consultation. Saves optimistically via a
// server action.
// ---------------------------------------------------------------------------

import { useState, useTransition } from "react";
import { updatePortalVisibilityAction } from "../lib/client-actions";

type Visibility = {
  content: boolean;
  ads: boolean;
  reviews: boolean;
  consultation: boolean;
};

const SECTIONS: { key: keyof Visibility; label: string; hint: string }[] = [
  { key: "content", label: "Content", hint: "The proofer board — clients review, edit, approve and comment on posts." },
  { key: "ads", label: "Ads", hint: "The read-only ad list and per-ad audit trail." },
  { key: "reviews", label: "Reviews", hint: "Sent and approved monthly reviews." },
  { key: "consultation", label: "Consultation", hint: "The consultation questionnaire." },
];

export default function PortalVisibilityForm({
  clientId,
  initial,
}: {
  clientId: string | number;
  initial: Visibility;
}) {
  const [value, setValue] = useState<Visibility>(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: keyof Visibility) {
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await updatePortalVisibilityAction(String(clientId), next);
      if (res?.error) {
        setError(res.error);
        setValue((prev) => ({ ...prev, [key]: !next[key] })); // revert
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#18181b" }}>
            Portal visibility
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#71717a", maxWidth: 520, lineHeight: 1.5 }}>
            Choose which sections this client sees when they log into their
            portal. Turning a section off hides its nav item and blocks the
            page for the client.
          </p>
        </div>
        <span style={{ fontSize: 12, color: error ? "#dc2626" : "#16a34a", minHeight: 16 }}>
          {error ?? message ?? ""}
        </span>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {SECTIONS.map((section) => (
          <label
            key={section.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 4px",
              borderTop: "1px solid #f4f4f5",
              cursor: pending ? "wait" : "pointer",
            }}
          >
            <Switch on={value[section.key]} disabled={pending} onClick={() => toggle(section.key)} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#18181b" }}>
                {section.label}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "#a1a1aa", lineHeight: 1.4 }}>
                {section.hint}
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: value[section.key] ? "#16a34a" : "#a1a1aa" }}>
              {value[section.key] ? "Shown" : "Hidden"}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

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

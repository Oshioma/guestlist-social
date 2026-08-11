"use client";

import { useState } from "react";
import { attachSelectedMetaPage } from "./actions";

export type PickerPage = {
  id: string;
  name: string;
  ig_username: string | null;
};

// Radio list of the Facebook Pages this login manages. The user picks exactly
// one — that Page (and its linked Instagram, shown for context) is the only
// account we attach, fixing the old grab-all that connected every Page at once.
export function PagePicker({
  pages,
  clientName,
}: {
  pages: PickerPage[];
  clientName: string | null;
}) {
  const [selected, setSelected] = useState<string>(pages[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={attachSelectedMetaPage}
      onSubmit={() => setSubmitting(true)}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pages.map((p) => {
          const isSel = selected === p.id;
          return (
            <label
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: `1.5px solid ${isSel ? "#2563eb" : "#e4e4e7"}`,
                borderRadius: 10,
                background: isSel ? "#eff6ff" : "#fff",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="pageId"
                value={p.id}
                checked={isSel}
                onChange={() => setSelected(p.id)}
                style={{ accentColor: "#2563eb" }}
              />
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600, color: "#18181b" }}>{p.name}</span>
                <span style={{ fontSize: 13, color: "#71717a" }}>
                  {p.ig_username
                    ? `Facebook · Instagram @${p.ig_username}`
                    : "Facebook · no linked Instagram"}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <a
          href="/proofer/teams"
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            color: "#3f3f46",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={!selected || submitting}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            background: !selected || submitting ? "#93c5fd" : "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: !selected || submitting ? "default" : "pointer",
          }}
        >
          {submitting
            ? "Connecting…"
            : clientName
              ? `Connect to ${clientName}`
              : "Connect selected"}
        </button>
      </div>
    </form>
  );
}

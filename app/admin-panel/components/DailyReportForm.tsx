"use client";

// Settings form for the daily admin report: who receives it, plus a
// "send now" button so the operator can verify the email end-to-end
// without waiting for the morning cron.

import { useState, useTransition } from "react";

type SendNowResult = {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
};

type Props = {
  initialRecipients: string[];
  onSave: (raw: string) => Promise<string[]>;
  onSendNow: () => Promise<SendNowResult>;
};

export default function DailyReportForm({
  initialRecipients,
  onSave,
  onSendNow,
}: Props) {
  const [value, setValue] = useState(initialRecipients.join(", "));
  const [savedList, setSavedList] = useState(initialRecipients);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = value.trim() !== savedList.join(", ").trim();

  function handleSave() {
    startTransition(async () => {
      try {
        const saved = await onSave(value);
        setSavedList(saved);
        setValue(saved.join(", "));
        setNotice({
          kind: "ok",
          text:
            saved.length === 0
              ? "Saved — no recipients, so the daily report is off."
              : `Saved. The report goes to ${saved.length} recipient${saved.length !== 1 ? "s" : ""} every morning.`,
        });
      } catch (err) {
        setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not save" });
      }
    });
  }

  function handleSendNow() {
    startTransition(async () => {
      try {
        const r = await onSendNow();
        if (r.recipients === 0) {
          setNotice({ kind: "error", text: r.reason ?? "No recipients configured — save some emails first." });
        } else if (r.sent > 0) {
          setNotice({ kind: "ok", text: `Sent to ${r.sent} of ${r.recipients} recipient${r.recipients !== 1 ? "s" : ""}.` });
        } else if (r.skipped > 0) {
          setNotice({ kind: "error", text: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM) — send skipped." });
        } else {
          setNotice({ kind: "error", text: "Send failed — check the server logs." });
        }
      } catch (err) {
        setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not send" });
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#52525b", lineHeight: 1.5 }}>
        Every morning (7am UTC — 8am UK in summer), the listed admins get an email with this
        week{"’"}s tasks, the publish queue, this month{"’"}s crew salaries and
        unresolved client comments. It includes salary figures, so only add
        people who should see those. Leave empty to turn the report off.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>
          Recipients (comma-separated emails)
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setNotice(null); }}
          placeholder="you@agency.com, partner@agency.com"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13, background: "#fff", color: "#18181b", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          style={{ padding: "8px 14px", borderRadius: 8, background: "#18181b", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isPending || !dirty ? 0.6 : 1 }}
        >
          {isPending ? "Working…" : "Save recipients"}
        </button>
        <button
          type="button"
          onClick={handleSendNow}
          disabled={isPending || savedList.length === 0}
          title={savedList.length === 0 ? "Save at least one recipient first" : "Send today's report right now"}
          style={{ padding: "8px 14px", borderRadius: 8, background: "#fff", color: "#18181b", border: "1px solid #e4e4e7", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isPending || savedList.length === 0 ? 0.6 : 1 }}
        >
          Send now
        </button>
        {notice && (
          <span style={{ fontSize: 12, fontWeight: 600, color: notice.kind === "ok" ? "#166534" : "#b91c1c" }}>
            {notice.text}
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import RichTextEditor from "./RichTextEditor";
import {
  saveEmailTemplate,
  resetEmailTemplate,
  type EmailTemplateEditorItem,
  type SaveTemplateState,
} from "@/lib/email/template-actions";
import { getTemplateDef, renderEmailFromValues } from "@/lib/email/render";

export default function EmailTemplatesEditor({
  templates,
}: {
  templates: EmailTemplateEditorItem[];
}) {
  const [selectedKey, setSelectedKey] = useState(templates[0]?.key ?? "");
  const item = templates.find((t) => t.key === selectedKey) ?? templates[0];

  const [subject, setSubject] = useState(item?.current.subject ?? "");
  const [buttonLabel, setButtonLabel] = useState(item?.current.buttonLabel ?? "");
  const [bodyHtml, setBodyHtml] = useState(item?.current.bodyHtml ?? "");
  // Bumping this remounts the editor so it reseeds its contentEditable region
  // (on template switch or reset-to-default).
  const [editorKey, setEditorKey] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const [saveState, saveAction, saving] = useActionState<
    SaveTemplateState | null,
    FormData
  >(saveEmailTemplate, null);
  const [resetState, resetAction, resetting] = useActionState<
    SaveTemplateState | null,
    FormData
  >(resetEmailTemplate, null);

  // Reseed all fields from the selected template's current values whenever the
  // selection changes.
  useEffect(() => {
    if (!item) return;
    setSubject(item.current.subject);
    setButtonLabel(item.current.buttonLabel ?? "");
    setBodyHtml(item.current.bodyHtml);
    setEditorKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // After a successful reset, drop back to the built-in default in the fields.
  useEffect(() => {
    if (resetState?.success && resetState.savedKey === selectedKey && item) {
      setSubject(item.default.subject);
      setButtonLabel(item.default.buttonLabel ?? "");
      setBodyHtml(item.default.bodyHtml);
      setEditorKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetState]);

  const previewSrc = useMemo(() => {
    if (!item) return "";
    const def = getTemplateDef(item.key);
    if (!def) return "";
    const sampleVars = Object.fromEntries(
      item.placeholders.map((p) => [p.token, p.sample])
    );
    return renderEmailFromValues(
      def,
      { subject, bodyHtml, buttonLabel: buttonLabel || null },
      sampleVars
    ).html;
  }, [item, subject, bodyHtml, buttonLabel]);

  if (!item) {
    return <p style={{ fontSize: 14, color: "#71717a" }}>No email templates.</p>;
  }

  function copyToken(token: string) {
    const text = `{{${token}}}`;
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(token);
        window.setTimeout(() => setCopied(null), 1200);
      },
      () => {}
    );
  }

  const showSaveMsg =
    (saveState?.savedKey === selectedKey || saveState?.error) && !saving;
  const showResetMsg = resetState?.savedKey === selectedKey && !resetting;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Which email to edit */}
      {templates.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {templates.map((t) => {
            const active = t.key === selectedKey;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedKey(t.key)}
                style={pill(active)}
              >
                {t.name}
                {t.isCustom && (
                  <span style={dot} title="Customised" aria-label="Customised" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
        {item.description}{" "}
        <span style={{ color: "#a1a1aa" }}>
          {item.isCustom ? "Currently: customised." : "Currently: default."}
        </span>
      </p>

      <div style={grid}>
        {/* Editor */}
        <form action={saveAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="hidden" name="key" value={item.key} />

          <div>
            <label style={labelStyle}>Subject</label>
            <input
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              placeholder="Subject line"
            />
          </div>

          <div>
            <label style={labelStyle}>Body</label>
            <RichTextEditor
              key={`${item.key}:${editorKey}`}
              name="body_html"
              initialHtml={bodyHtml}
              onChange={setBodyHtml}
            />
          </div>

          <div>
            <label style={labelStyle}>Button label</label>
            <input
              name="button_label"
              value={buttonLabel}
              onChange={(e) => setButtonLabel(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Accept invitation →"
            />
            <p style={hintStyle}>
              The button always links to the correct address automatically — you
              only set its wording. Leave blank to hide the button.
            </p>
          </div>

          {/* Placeholders */}
          <div>
            <label style={labelStyle}>Placeholders (click to copy)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {item.placeholders.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => copyToken(p.token)}
                  style={chipStyle}
                  title={`${p.label} — e.g. ${p.sample}`}
                >
                  <code style={{ fontSize: 12 }}>{`{{${p.token}}}`}</code>
                  <span style={{ color: "#a1a1aa", fontSize: 11 }}>
                    {copied === p.token ? "copied" : p.label}
                  </span>
                </button>
              ))}
            </div>
            <p style={hintStyle}>
              Type a placeholder anywhere in the subject or body and it's replaced
              with the real value when the email is sent.
            </p>
          </div>

          {showSaveMsg && saveState?.error && (
            <div style={errorBox}>{saveState.error}</div>
          )}
          {showSaveMsg && saveState?.success && (
            <div style={successBox}>{saveState.message}</div>
          )}
          {showResetMsg && resetState?.success && (
            <div style={successBox}>{resetState.message}</div>
          )}
          {showResetMsg && resetState?.error && (
            <div style={errorBox}>{resetState.error}</div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" disabled={saving} style={primaryBtn(saving)}>
              {saving ? "Saving…" : "Save email"}
            </button>
            <button
              type="submit"
              formAction={resetAction}
              disabled={resetting || !item.isCustom}
              style={secondaryBtn(resetting || !item.isCustom)}
              title={item.isCustom ? "Reset to the built-in default" : "Already using the default"}
            >
              {resetting ? "Resetting…" : "Reset to default"}
            </button>
          </div>
        </form>

        {/* Live preview */}
        <div>
          <label style={labelStyle}>Preview</label>
          <div style={previewFrameWrap}>
            <iframe
              title="Email preview"
              srcDoc={previewSrc}
              style={{ width: "100%", height: 460, border: "none", background: "#fafaf9" }}
            />
          </div>
          <p style={hintStyle}>
            Shown with example values. Real emails use each recipient's details.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 20,
  alignItems: "start",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#52525b",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 9,
  fontSize: 14,
  color: "#1e293b",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  margin: "6px 0 0",
  lineHeight: 1.5,
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fafafa",
  cursor: "pointer",
};

const previewFrameWrap: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  overflow: "hidden",
};

function pill(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 999,
    border: `1px solid ${active ? "#1e293b" : "#e4e4e7"}`,
    background: active ? "#1e293b" : "#fff",
    color: active ? "#fff" : "#3f3f46",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

const dot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  background: "#22c55e",
  display: "inline-block",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 9,
    border: "none",
    background: disabled ? "#a1a1aa" : "#1e293b",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 9,
    border: "1px solid #e4e4e7",
    background: "#fff",
    color: disabled ? "#a1a1aa" : "#3f3f46",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 9,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 13,
};

const successBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 9,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#15803d",
  fontSize: 13,
};

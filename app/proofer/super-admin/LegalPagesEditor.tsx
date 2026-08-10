"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import RichTextEditor from "./RichTextEditor";
import {
  saveLegalPage,
  resetLegalPage,
  type LegalEditorItem,
  type SaveLegalState,
} from "@/lib/legal/actions";

export default function LegalPagesEditor({
  pages,
  base,
}: {
  pages: LegalEditorItem[];
  base: string;
}) {
  const [selectedKey, setSelectedKey] = useState(pages[0]?.key ?? "");
  const item = pages.find((p) => p.key === selectedKey) ?? pages[0];

  const [title, setTitle] = useState(item?.current.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(item?.current.bodyHtml ?? "");
  const [editorKey, setEditorKey] = useState(0);

  const [saveState, saveAction, saving] = useActionState<
    SaveLegalState | null,
    FormData
  >(saveLegalPage, null);
  const [resetState, resetAction, resetting] = useActionState<
    SaveLegalState | null,
    FormData
  >(resetLegalPage, null);

  useEffect(() => {
    if (!item) return;
    setTitle(item.current.title);
    setBodyHtml(item.current.bodyHtml);
    setEditorKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  useEffect(() => {
    if (resetState?.success && resetState.savedKey === selectedKey && item) {
      setTitle(item.default.title);
      setBodyHtml(item.default.bodyHtml);
      setEditorKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetState]);

  const previewSrc = useMemo(
    () =>
      `<!doctype html><html><body style="margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#3f3f46;line-height:1.6;font-size:15px;"><h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:#27272a;">${escapeHtml(
        title
      )}</h1>${bodyHtml}</body></html>`,
    [title, bodyHtml]
  );

  if (!item) return <p style={{ fontSize: 14, color: "#71717a" }}>No legal pages.</p>;

  const showSaveMsg = (saveState?.savedKey === selectedKey || saveState?.error) && !saving;
  const showResetMsg = resetState?.savedKey === selectedKey && !resetting;
  const liveHref = `${base || ""}`.startsWith("http") ? `/${item.slug}` : `/${item.slug}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pages.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pages.map((p) => {
            const active = p.key === selectedKey;
            return (
              <button key={p.key} type="button" onClick={() => setSelectedKey(p.key)} style={pill(active)}>
                {p.navLabel}
                {p.isCustom && <span style={dot} title="Customised" />}
              </button>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
        Public at <a href={liveHref} target="_blank" rel="noopener" style={{ color: "#4451b8", fontWeight: 600 }}>/{item.slug}</a>.{" "}
        {item.isCustom ? "Currently: customised." : "Currently: default."} Changes publish immediately.
      </p>

      <div style={grid}>
        <form action={saveAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="hidden" name="key" value={item.key} />

          <div>
            <label style={labelStyle}>Page title</label>
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Page content</label>
            <RichTextEditor
              key={`${item.key}:${editorKey}`}
              name="body_html"
              initialHtml={bodyHtml}
              onChange={setBodyHtml}
            />
          </div>

          {showSaveMsg && saveState?.error && <div style={errorBox}>{saveState.error}</div>}
          {showSaveMsg && saveState?.success && <div style={successBox}>{saveState.message}</div>}
          {showResetMsg && resetState?.success && <div style={successBox}>{resetState.message}</div>}
          {showResetMsg && resetState?.error && <div style={errorBox}>{resetState.error}</div>}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" disabled={saving} style={primaryBtn(saving)}>
              {saving ? "Saving…" : "Save & publish"}
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

        <div>
          <label style={labelStyle}>Preview</label>
          <div style={previewFrameWrap}>
            <iframe title="Legal preview" srcDoc={previewSrc} style={{ width: "100%", height: 460, border: "none", background: "#fff" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

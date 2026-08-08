"use client";

import { useEffect, useRef, useState } from "react";

// A small contentEditable rich-text editor with a bold / italic / underline +
// font-family + font-size toolbar. No dependencies — it drives the browser's
// built-in formatting (styleWithCSS so it emits inline styles, which is what
// email clients understand) and mirrors its HTML into a hidden input so it
// posts with the surrounding form.

const FONTS: { label: string; value: string }[] = [
  {
    label: "Sans-serif",
    value: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  },
  { label: "Serif", value: "Georgia,'Times New Roman',Times,serif" },
  { label: "Monospace", value: "'SFMono-Regular',Menlo,Consolas,monospace" },
];

const SIZES: { label: string; value: string }[] = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "6" },
];

export default function RichTextEditor({
  name,
  initialHtml,
  onChange,
}: {
  name: string;
  initialHtml: string;
  onChange?: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(initialHtml);

  // Seed the editable region once on mount. It's uncontrolled afterwards so the
  // caret doesn't jump on every keystroke; the hidden input tracks its HTML.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const v = ref.current?.innerHTML ?? "";
    setHtml(v);
    onChange?.(v);
  }

  function exec(command: string, value?: string) {
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(command, false, value);
    } catch {
      /* execCommand is deprecated but universally supported; ignore failures */
    }
    ref.current?.focus();
    sync();
  }

  return (
    <div style={wrapStyle}>
      <div style={toolbarStyle}>
        <button type="button" onMouseDown={preventBlur} onClick={() => exec("bold")} style={btnStyle} title="Bold" aria-label="Bold">
          <span style={{ fontWeight: 800 }}>B</span>
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => exec("italic")} style={btnStyle} title="Italic" aria-label="Italic">
          <span style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}>I</span>
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => exec("underline")} style={btnStyle} title="Underline" aria-label="Underline">
          <span style={{ textDecoration: "underline" }}>U</span>
        </button>

        <span style={dividerStyle} aria-hidden />

        <select
          aria-label="Font"
          defaultValue=""
          onMouseDown={preventBlur}
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value);
            e.target.value = "";
          }}
          style={selectStyle}
        >
          <option value="" disabled>
            Font
          </option>
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Size"
          defaultValue=""
          onMouseDown={preventBlur}
          onChange={(e) => {
            if (e.target.value) exec("fontSize", e.target.value);
            e.target.value = "";
          }}
          style={selectStyle}
        >
          <option value="" disabled>
            Size
          </option>
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <span style={dividerStyle} aria-hidden />

        <button type="button" onMouseDown={preventBlur} onClick={() => exec("removeFormat")} style={btnStyle} title="Clear formatting" aria-label="Clear formatting">
          Clear
        </button>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        style={editableStyle}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}

function preventBlur(e: React.MouseEvent) {
  // Keep the current text selection when clicking a toolbar control.
  e.preventDefault();
}

const wrapStyle: React.CSSProperties = {
  border: "1px solid #d4d4d8",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap",
  padding: 6,
  borderBottom: "1px solid #e4e4e7",
  background: "#fafafa",
};

const btnStyle: React.CSSProperties = {
  minWidth: 30,
  height: 30,
  padding: "0 8px",
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  color: "#3f3f46",
  lineHeight: 1,
};

const selectStyle: React.CSSProperties = {
  height: 30,
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  background: "#fff",
  fontSize: 12,
  color: "#3f3f46",
  padding: "0 6px",
  cursor: "pointer",
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: "#e4e4e7",
  margin: "0 4px",
};

const editableStyle: React.CSSProperties = {
  minHeight: 160,
  padding: "14px 16px",
  fontSize: 15,
  lineHeight: 1.6,
  color: "#1e293b",
  outline: "none",
};

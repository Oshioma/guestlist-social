"use client";

import { useState } from "react";

type ErrorEditorProps = {
  initial: string | null;
  template_id: string;
};

export function ErrorEditor({ initial, template_id }: ErrorEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<null | string>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/launches-edit", {
      method: "POST",
      body: JSON.stringify({ template_id, error_log: value }),
      headers: { "Content-Type": "application/json" },
    });
    setSaving(false);
    setEditing(false);

    if (res.ok) setMsg("Saved!");
    else {
      const data = await res.json();
      setMsg(data.error ? `Error: ${data.error}` : "Failed to save.");
    }
    // Optionally: router.refresh() to reload data
  }

  if (!editing)
    return (
      <span>
        {value ? <span className="text-red-600">{value}</span> : <span className="text-gray-500">No error</span>}
        <button
          onClick={() => setEditing(true)}
          className="ml-2 text-blue-600 underline"
          type="button"
        >
          Edit
        </button>
        {msg && <span className="ml-2 text-xs text-gray-600">{msg}</span>}
      </span>
    );

  return (
    <span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        className="border px-1 py-0.5 rounded text-sm"
        disabled={saving}
      />
      <button
        onClick={save}
        disabled={saving}
        className="ml-2 bg-blue-500 text-white px-2 py-1 text-xs rounded"
        type="button"
      >
        Save
      </button>
      <button
        onClick={() => setEditing(false)}
        disabled={saving}
        className="ml-2 text-gray-600 underline text-xs"
        type="button"
      >
        Cancel
      </button>
    </span>
  );
}

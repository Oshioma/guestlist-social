"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Utility: Render input based on variable type
function VariableInput({ v, value, onChange }: any) {
  switch (v.type) {
    case "number":
      return (
        <input
          type="number"
          required={v.required}
          value={value ?? ""}
          onChange={e => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
      );
    case "select":
      return (
        <select
          required={v.required}
          value={value ?? ""}
          onChange={e => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        >
          <option value="">Select {v.label || v.key}</option>
          {(v.options || []).map((opt: string) =>
            <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "date":
      return (
        <input
          type="date"
          required={v.required}
          value={value ?? ""}
          onChange={e => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
      );
    default:
      return (
        <input
          type="text"
          required={v.required}
          value={value ?? ""}
          onChange={e => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
      );
  }
}

export default function LaunchFromTemplatePage({ params }: { params: { templateId: string } }) {
  const [template, setTemplate] = useState<any>(null);
  const [clients, setClients] = useState<Array<{ id: string | number, name: string }>>([]);
  const [inputs, setInputs] = useState<any>({});
  const [status, setStatus] = useState<string | null>(null);
  const [templateErr, setTemplateErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!params.templateId) {
      setTemplateErr("Missing template ID!");
      return;
    }
    // Fetch template, with error handling for 404 and other bad responses
    fetch(`/api/admin-panel/templates/${params.templateId}`)
      .then(async r => {
        if (!r.ok) {
          const text = await r.text();
          throw new Error(`Failed to fetch template: ${r.status} ${text}`);
        }
        return r.json();
      })
      .then(setTemplate)
      .catch(err => {
        setTemplateErr(err.message || "Could not load template.");
      });

    // Always fetch clients, but handle errors too
    fetch("/api/admin-panel/clients")
      .then(async r => {
        if (!r.ok) return [];
        return r.json


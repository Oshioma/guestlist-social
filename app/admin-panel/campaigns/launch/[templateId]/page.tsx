"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Utility: Render input based on variable type
function VariableInput({ v, value, onChange }: any) {
  switch (v.type) {
    case "number": return (
      <input
        type="number"
        required={v.required}
        value={value ?? ""}
        onChange={e => onChange(v.key, e.target.value)}
        className="block w-full border rounded px-3 py-2"
      />
    );
    case "select": return (
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
    case "date": return (
      <input
        type="date"
        required={v.required}
        value={value ?? ""}
        onChange={e => onChange(v.key, e.target.value)}
        className="block w-full border rounded px-3 py-2"
      />
    );
    default: return (
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
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/admin-panel/templates/${params.templateId}`)
      .then(r => r.json())
      .then(setTemplate);
    fetch("/api/admin-panel/clients")
      .then(r => r.json())
      .then(setClients);
  }, [params.templateId]);

  if (!template) return <div>Loading…</div>;

  const handleChange = (k: string, v: any) =>
    setInputs((prev: any) => ({ ...prev, [k]: v }));

  // Frontend validation before POST (mirror backend for UX)
  const validate = () => {
    let ok = true;
    (template.variables || []).forEach((v: any) => {
      if (v.required && !inputs[v.key]) ok = false;
      if (v.validation_rule) {
        try {
          const re = new RegExp(v.validation_rule);
          if (!re.test(inputs[v.key] || "")) ok = false;
        } catch { /* ignore bad regex */ }
      }
    });
    return ok;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      setStatus("Some fields are invalid.");
      return;
    }
    setStatus("Submitting…");
    const res = await fetch("/api/admin-panel/campaigns/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: template.id,
        inputs: { ...inputs, client_id: inputs.client_id }
      })
    });
    if (res.ok) {
      setStatus("Created!");
      router.push("/admin-panel/campaigns/launches");
    } else {
      setStatus("Failed to launch.");
    }
  };

  return (
    <main>
      <h1>🚀 Launch Campaign: {template.name}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label>
          Client:
          <select
            required
            value={inputs.client_id || ""}
            onChange={e => handleChange("client_id", e.target.value)}
            className="block w-full border rounded px-3 py-2"
          >
            <option value="">Select client</option>
            {clients.map(c =>
              <option key={c.id} value={c.id}>{c.name}</option>
            )}
          </select>
        </label>
        {template.variables && template.variables.map((v: any) => (
          <label key={v.key} className="block">
            {v.label || v.key}
            <VariableInput v={v} value={inputs[v.key]} onChange={handleChange} />
            {v.validation_rule && <span className="text-xs text-gray-500">Pattern: {v.validation_rule}</span>}
          </label>
        ))}
        <button type="submit" className="btn btn-primary">Create Paused Campaign</button>
        {status && <div>{status}</div>}
      </form>
      <div className="mt-6">
        <Link href="/admin-panel/campaigns">← Back to Templates</Link>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LaunchFromTemplatePage({ params }: { params: { templateId: string } }) {
  const [template, setTemplate] = useState<any>(null);
  const [clients, setClients] = useState<Array<{id: string|number, name: string}>>([]);
  const [inputs, setInputs] = useState<any>({});
  const [status, setStatus] = useState<string|null>(null);
  const router = useRouter();

  // Fetch template info and clients list
  useEffect(() => {
    // TODO: Replace with Supabase or real API
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Submitting…");
    // TODO: Replace with your real launch API
    const res = await fetch("/api/admin-panel/campaigns/launch", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
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
            value={inputs.client_id||""}
            onChange={e=>handleChange("client_id", e.target.value)}
          >
            <option value="">Select client</option>
            {clients.map(c=>
              <option key={c.id} value={c.id}>{c.name}</option>
            )}
          </select>
        </label>
        {template.variables && template.variables.map((v: any) => (
          <label key={v.key} className="block">
            {v.label || v.key}
            <input
              type="text"
              required={v.required}
              value={inputs[v.key] || ""}
              onChange={e=>handleChange(v.key, e.target.value)}
            />
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

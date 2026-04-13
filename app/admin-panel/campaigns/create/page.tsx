"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CreateTemplatePage() {
  const [inputs, setInputs] = useState({ name: "", slug: "", client_scope: "private", objective: "LEAD_GENERATION", description: "" });
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  const handleChange = (k: string, v: string) => setInputs((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Submitting…");
    // TODO: Replace with your real API endpoint
    const res = await fetch("/api/admin-panel/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs)
    });
    if (res.ok) {
      setStatus("Created!");
      router.push("/admin-panel/campaigns");
    } else {
      setStatus("Failed to create template.");
    }
  };

  return (
    <main>
      <h1 className="text-xl mb-4">+ New Campaign Template</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          required
          type="text"
          placeholder="Template Name"
          value={inputs.name}
          onChange={e => handleChange("name", e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
        <input
          required
          type="text"
          placeholder="Template Slug (unique, no spaces)"
          value={inputs.slug}
          onChange={e => handleChange("slug", e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
        <select
          value={inputs.client_scope}
          onChange={e => handleChange("client_scope", e.target.value)}
          className="block w-full border rounded px-3 py-2"
        >
          <option value="private">Just me (private)</option>
          <option value="org">Org-wide (all users)</option>
        </select>
        <input
          type="text"
          placeholder="Objective (default: LEAD_GENERATION)"
          value={inputs.objective}
          onChange={e => handleChange("objective", e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
        <textarea
          placeholder="Template Description"
          value={inputs.description}
          onChange={e => handleChange("description", e.target.value)}
          className="block w-full border rounded px-3 py-2"
          rows={3}
        />
        <button type="submit" className="btn btn-primary">Create</button>
        {status && <div>{status}</div>}
      </form>
      <div className="mt-6">
        <Link href="/admin-panel/campaigns">← Back to Templates</Link>
      </div>
    </main>
  );
}

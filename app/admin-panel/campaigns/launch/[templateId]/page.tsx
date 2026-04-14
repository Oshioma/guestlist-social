"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Variable = {
  key: string;
  label?: string;
  type?: "text" | "number" | "select" | "date";
  required?: boolean;
  options?: string[];
  validation_rule?: string;
};

type Template = {
  id: string | number;
  name: string;
  variables?: Variable[];
};

type Client = {
  id: string | number;
  name: string;
};

type Inputs = Record<string, string>;

type VariableInputProps = {
  v: Variable;
  value: string;
  onChange: (key: string, value: string) => void;
};

function VariableInput({ v, value, onChange }: VariableInputProps) {
  switch (v.type) {
    case "number":
      return (
        <input
          type="number"
          required={Boolean(v.required)}
          value={value}
          onChange={(e) => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
      );

    case "select":
      return (
        <select
          required={Boolean(v.required)}
          value={value}
          onChange={(e) => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        >
          <option value="">Select {v.label || v.key}</option>
          {(v.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "date":
      return (
        <input
          type="date"
          required={Boolean(v.required)}
          value={value}
          onChange={(e) => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
      );

    default:
      return (
        <input
          type="text"
          required={Boolean(v.required)}
          value={value}
          onChange={(e) => onChange(v.key, e.target.value)}
          className="block w-full border rounded px-3 py-2"
        />
      );
  }
}

export default function LaunchFromTemplatePage() {
  const params = useParams();
  const router = useRouter();

  const templateId = useMemo(() => {
    const raw = params?.templateId;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0] || "";
    return "";
  }, [params]);

  const [template, setTemplate] = useState<Template | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [inputs, setInputs] = useState<Inputs>({});
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!templateId) {
        setStatus("Missing template ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setStatus(null);

        const [templateRes, clientsRes] = await Promise.all([
          fetch(`/api/admin-panel/templates/${encodeURIComponent(templateId)}`, {
            cache: "no-store",
          }),
          fetch("/api/admin-panel/clients", {
            cache: "no-store",
          }),
        ]);

        if (!templateRes.ok) {
          throw new Error("Failed to load template.");
        }

        if (!clientsRes.ok) {
          throw new Error("Failed to load clients.");
        }

        const templateData: Template = await templateRes.json();
        const clientsData: Client[] = await clientsRes.json();

        if (cancelled) return;

        setTemplate(templateData);
        setClients(Array.isArray(clientsData) ? clientsData : []);
      } catch (error) {
        if (cancelled) return;
        setStatus(
          error instanceof Error ? error.message : "Failed to load page."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  function handleChange(key: string, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    if (!template) return false;

    for (const v of template.variables || []) {
      const currentValue = inputs[v.key] || "";

      if (v.required && !currentValue) {
        return false;
      }

      if (v.validation_rule) {
        try {
          const re = new RegExp(v.validation_rule);
          if (!re.test(currentValue)) {
            return false;
          }
        } catch {
          // Ignore invalid regex from config
        }
      }
    }

    if (!inputs.client_id) {
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!template) {
      setStatus("Template not loaded.");
      return;
    }

    if (!validate()) {
      setStatus("Some fields are invalid.");
      return;
    }

    try {
      setStatus("Submitting...");

      const res = await fetch("/api/admin-panel/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          inputs: {
            ...inputs,
            client_id: inputs.client_id,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to launch.");
      }

      setStatus("Created.");
      router.push("/admin-panel/campaigns/launches");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to launch."
      );
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!templateId) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">Launch Campaign</h1>
        <div className="text-red-600 mb-4">Missing template ID.</div>
        <Link href="/admin-panel/campaigns" className="underline">
          Back to Templates
        </Link>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">Launch Campaign</h1>
        <div className="text-red-600 mb-4">
          {status || "Template could not be loaded."}
        </div>
        <Link href="/admin-panel/campaigns" className="underline">
          Back to Templates
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">
        Launch Campaign: {template.name}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block mb-1">Client</span>
          <select
            required
            value={inputs.client_id || ""}
            onChange={(e) => handleChange("client_id", e.target.value)}
            className="block w-full border rounded px-3 py-2"
          >
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {(template.variables || []).map((v) => (
          <label key={v.key} className="block">
            <span className="block mb-1">{v.label || v.key}</span>
            <VariableInput
              v={v}
              value={inputs[v.key] || ""}
              onChange={handleChange}
            />
            {v.validation_rule ? (
              <span className="text-xs text-gray-500 block mt-1">
                Pattern: {v.validation_rule}
              </span>
            ) : null}
          </label>
        ))}

        <button
          type="submit"
          className="bg-black text-white px-4 py-2 rounded"
        >
          Create Paused Campaign
        </button>

        {status ? <div>{status}</div> : null}
      </form>

      <div className="mt-6">
        <Link href="/admin-panel/campaigns" className="underline">
          Back to Templates
        </Link>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Step = {
  id: number;
  name: string;
  type: string;
  content: any;
  order_index: number;
};

export default function CampaignStepsPage({ params }: { params: { campaignId: string } }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [editStepId, setEditStepId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState<any>({});
  const [status, setStatus] = useState<string | null>(null);

  // Fetch steps
  async function fetchSteps() {
    setLoading(true);
    const res = await fetch(`/api/admin-panel/campaigns/launches/${params.campaignId}/steps`);
    if (res.ok) {
      setSteps(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => { fetchSteps(); }, [params.campaignId]);

  // Delete
  async function handleDelete(id: number) {
    if (!confirm("Delete this step?")) return;
    setStatus("Deleting...");
    const res = await fetch(`/api/admin-panel/campaigns/launches/${params.campaignId}/steps/${id}`, { method: "DELETE" });
    if (res.ok) {
      setStatus(null);
      fetchSteps();
    } else {
      setStatus("Failed to delete step.");
    }
  }

  // Move
  async function handleMove(id: number, direction: "up" | "down") {
    setStatus("Moving...");
    const res = await fetch(
      `/api/admin-panel/campaigns/launches/${params.campaignId}/steps/${id}?move=${direction}`,
      { method: "PATCH" }
    );
    if (res.ok) {
      setStatus(null);
      fetchSteps();
    } else {
      setStatus("Failed to move step.");
    }
  }

  // Begin editing step
  function beginEdit(step: Step) {
    setEditStepId(step.id);
    setEditName(step.name);
    setEditContent(step.content || {});
  }

  // Save edit
  async function saveEdit(id: number) {
    setStatus("Saving...");
    const res = await fetch(`/api/admin-panel/campaigns/launches/${params.campaignId}/steps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, content: editContent })
    });
    if (res.ok) {
      setEditStepId(null);
      setEditName("");
      setEditContent({});
      fetchSteps();
      setStatus(null);
    } else {
      setStatus("Failed to update step.");
    }
  }

  return (
    <main className="max-w-2xl mx-auto pt-10 px-5">
      <h1 className="text-2xl font-bold mb-5">Campaign Steps</h1>

      <Link
        href={`/admin-panel/campaigns/launches/${params.campaignId}/add-step`}
        className="mb-4 inline-block bg-blue-600 px-4 py-2 text-white rounded hover:bg-blue-700"
      >
        + Add Step
      </Link>

      {status && <div className="mb-3 text-sm text-red-600">{status}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : steps.length === 0 ? (
        <p className="text-gray-500">No steps yet.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {steps.map((step, i) => (
            <li key={step.id} className="bg-white border rounded shadow-sm p-4 flex flex-col gap-2 relative">
              {editStepId === step.id ? (
                <>
                  <div>
                    <strong>Type:</strong> {step.type}
                  </div>
                  <label className="block">
                    Name:
                    <input
                      className="border rounded px-2 py-1 w-full"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                    />
                  </label>
                  {/* Simple JSON content editor - can improve per your content structure! */}
                  <label className="block">
                    Content (JSON):
                    <textarea
                      className="border rounded px-2 py-1 w-full"
                      rows={3}
                      value={JSON.stringify(editContent, null, 2)}
                      onChange={e => {
                        try { setEditContent(JSON.parse(e.target.value)); }
                        catch { /* ignore bad JSON for now */ }
                      }}
                    />
                  </label>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="bg-green-600 text-white px-3 py-1 rounded"
                      onClick={() => saveEdit(step.id)}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="bg-gray-300 px-3 py-1 rounded"
                      onClick={() => setEditStepId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center">
                    <span className="font-semibold">{step.name}</span>
                    <span className="ml-3 text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 uppercase">{step.type}</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    <strong>Order:</strong> {step.order_index}
                  </div>
                  <pre className="bg-gray-50 text-xs p-2 rounded overflow-x-auto">
                    {JSON.stringify(step.content, null, 2)}
                  </pre>

                  <div className="flex flex-wrap mt-2 gap-2">
                    <button
                      disabled={i === 0}
                      className={`px-2 py-1 rounded ${i === 0
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-blue-200 text-blue-800 hover:bg-blue-300"}`}
                      onClick={() => handleMove(step.id, "up")}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === steps.length - 1}
                      className={`px-2 py-1 rounded ${i === steps.length - 1
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-blue-200 text-blue-800 hover:bg-blue-300"}`}
                      onClick={() => handleMove(step.id, "down")}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      className="bg-yellow-100 text-yellow-900 px-3 py-1 rounded hover:bg-yellow-200"
                      onClick={() => beginEdit(step)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200"
                      onClick={() => handleDelete(step.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

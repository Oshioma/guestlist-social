"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function CampaignPage({ params }: { params: { campaignId: string } }) {
  const [steps, setSteps] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/admin-panel/campaigns/launches/${params.campaignId}/steps`)
      .then(r => r.json())
      .then(setSteps);
  }, [params.campaignId]);

  return (
    <main className="max-w-2xl mx-auto pt-10 px-5">
      <h1 className="text-2xl font-bold mb-5">Campaign Steps</h1>
      <Link href={`/admin-panel/campaigns/launches/${params.campaignId}/add-step`}
        className="mb-4 inline-block bg-blue-600 px-4 py-2 text-white rounded hover:bg-blue-700"
      >+ Add Step</Link>
      {steps.length === 0 ? (
        <p className="text-gray-500">No steps yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {steps.map(step => (
            <li key={step.id} className="border px-3 py-2 rounded">
              <div className="font-semibold">{step.name} <span className="text-xs text-gray-400">[{step.type}]</span></div>
              <div className="text-sm text-gray-700">
                {JSON.stringify(step.content)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

"use client";
import Link from "next/link";
import { useState, useEffect } from "react";

type Campaign = {
  id: number;
  name: string;
  type: string;
  created_at: string;
};

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showTypePicker, setShowTypePicker] = useState(false);

  useEffect(() => {
    // Fetch campaigns from your API
    fetch("/api/admin-panel/campaigns")
      .then(res => res.json())
      .then(setCampaigns);
  }, []);

  const campaignTypes = [
    { value: "advertising", label: "Advertising" },
    { value: "sms", label: "SMS" },
    { value: "email", label: "Email" }
    // add more as you want
  ];

  function handleNewCampaign(type: string) {
    // Redirect to campaign creation for that type
    window.location.href = `/admin-panel/campaigns/new?type=${type}`;
  }

  return (
    <main className="max-w-3xl mx-auto pt-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Campaigns Dashboard</h1>
      <button
        className="mb-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onClick={() => setShowTypePicker(v => !v)}
      >
        + New Campaign
      </button>

      {showTypePicker && (
        <div className="mb-6 border bg-gray-50 p-4 rounded">
          <h2 className="text-xl mb-2">Choose campaign type:</h2>
          <div className="flex gap-4 flex-wrap">
            {campaignTypes.map(type => (
              <button
                className="px-3 py-2 bg-blue-100 rounded hover:bg-blue-200"
                key={type.value}
                onClick={() => handleNewCampaign(type.value)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-2">All Campaigns</h2>
      <table className="w-full border rounded mb-8">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Type</th>
            <th className="p-2">Created</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} className="border-t">
              <td className="p-2">{c.name}</td>
              <td className="p-2 capitalize">{c.type}</td>
              <td className="p-2">{new Date(c.created_at).toLocaleDateString()}</td>
              <td className="p-2">
                <Link
                  href={`/admin-panel/campaigns/launches/${c.id}`}
                  className="text-blue-700 hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
          {campaigns.length === 0 && (
            <tr>
              <td colSpan={4} className="p-2 text-gray-400 italic">No campaigns yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

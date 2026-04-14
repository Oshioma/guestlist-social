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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin-panel/campaigns")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCampaigns(data);
          setLoadError(null);
        } else {
          setCampaigns([]);
          setLoadError(
            data?.error
              ? `Failed to load campaigns: ${data.error}`
              : "Failed to load campaigns."
          );
        }
      })
      .catch(() => {
        setCampaigns([]);
        setLoadError("Failed to load campaigns (network error).");
      });
  }, []);

  const campaignTypes = [
    { value: "advertising", label: "Advertising" },
    { value: "sms", label: "SMS" },
    { value: "email", label: "Email" }
  ];

  function handleNewCampaign(type: string) {
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
             ](#)


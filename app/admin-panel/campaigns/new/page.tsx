"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function NewCampaignPage() {
  const params = useSearchParams();
  const type = params?.get("type");

  if (!type) {
    return (
      <main className="max-w-xl mx-auto pt-8 px-4">
        <h1 className="text-2xl font-bold mb-4">Create Campaign</h1>
        <div>Select a campaign type from the dashboard first.</div>
        <Link href="/admin-panel/campaigns" className="text-blue-600 hover:underline mt-4 block">
          ← Back
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto pt-8 px-4">
      <h1 className="text-2xl font-bold mb-4">Create a {type.charAt(0).toUpperCase() + type.slice(1)} Campaign</h1>
      {type === "advertising" && (
        <div className="mb-4">
          {/* Replace with your Facebook Ads wizard when ready! */}
          <div className="p-4 bg-gray-100 rounded border">Facebook Ads Wizard will go here!</div>
        </div>
      )}
      {type === "sms" && (
        <div className="mb-4">
          {/* Replace with your SMS wizard when ready! */}
          <div className="p-4 bg-gray-100 rounded border">SMS Campaign Wizard will go here!</div>
        </div>
      )}
      {type === "email" && (
        <div className="mb-4">
          {/* Replace with your Email wizard when ready! */}
          <div className="p-4 bg-gray-100 rounded border">Email Campaign Wizard will go here!</div>
        </div>
      )}

      <Link href="/admin-panel/campaigns" className="text-blue-600 hover:underline">
        ← Back
      </Link>
    </main>
  );
}

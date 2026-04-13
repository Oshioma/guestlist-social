import Link from "next/link";

// ... existing imports/code

export default function CampaignsDashboardPage() {
  return (
    <main>
      <Link
        href="/admin-panel/campaigns/new/step/1"
        className="inline-block mb-6 bg-green-600 text-white px-5 py-2 rounded text-lg font-semibold hover:bg-green-700"
      >
        + New Campaign
      </Link>
      {/* ...rest of your dashboard code */}
    </main>
  );
}

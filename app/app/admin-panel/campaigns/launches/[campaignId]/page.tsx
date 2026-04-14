import Link from "next/link";

export default function CampaignCreatedPage({ params }: { params: { campaignId: string } }) {
  return (
    <main className="max-w-xl mx-auto pt-12 px-6">
      <h1 className="text-2xl font-bold mb-4">🎉 Campaign Created</h1>
      <p className="mb-6">
        Your campaign <strong>{params.campaignId}</strong> has been created.
      </p>
      <p className="mb-8 text-gray-600">
        More steps coming soon. You’ll be able to add steps, design automations, and launch to your audience!
      </p>
      <Link
        href="/admin-panel/campaigns"
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Back to All Campaigns
      </Link>
    </main>
  );
}

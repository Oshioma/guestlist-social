import Link from "next/link";

// You will later replace the fetch with your Supabase query or a real API call.
export default async function LaunchesPage() {
  // Placeholder: Replace with real data fetch
  const launches: Array<{
    id: string,
    template_id: string,
    status: string,
    client_id: string,
    created_at: string,
    template?: { name: string }
  }> = [
    {
      id: "101",
      template_id: "1",
      status: "created",
      client_id: "88",
      created_at: "2026-04-14T12:45:00Z",
      template: { name: "Local Leads" },
    }
    // Add more example data or fetch with Supabase/API later
  ];
  // Uncomment when API is real:
  // const launches = await fetch("/api/admin-panel/campaigns/launches").then(r => r.json());

  return (
    <main>
      <h1 className="text-xl mb-4">🕓 Campaign Launches</h1>
      <ul>
        {launches.map((launch) => (
          <li key={launch.id}>
            <b>{launch.template?.name || launch.template_id}</b> for client [{launch.client_id}]
            <span> &nbsp;[{launch.status}]</span>
            <span> &nbsp;on {new Date(launch.created_at).toLocaleString()}</span>
            <Link className="ml-2" href={`/admin-panel/campaigns/launch/${launch.template_id}`}>Relaunch</Link>
          </li>
        ))}
      </ul>
      <Link className="btn mt-8" href="/admin-panel/campaigns">← Back to Templates</Link>
    </main>
  );
}

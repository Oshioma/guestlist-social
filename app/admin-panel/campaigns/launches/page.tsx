// ...other imports
export default async function LaunchesPage() {
  const launches = await fetch("/api/admin-panel/campaigns/launches").then(r=>r.json());
  return (
    <main>
      <h1 className="text-xl mb-4">🕓 Campaign Launches</h1>
      <ul>
        {launches.map((launch:any)=>(
          <li key={launch.id}>
            <b>{launch.template?.name || launch.template_id}</b> for client [{launch.client_id}]
            <span> &nbsp;[{launch.status}]</span>
            {launch.error_log && <span className="text-red-600"> &nbsp;Error: {launch.error_log}</span>}
            <span> &nbsp;on {new Date(launch.created_at).toLocaleString()}</span>
            <Link className="ml-2" href={`/admin-panel/campaigns/launch/${launch.template_id}`}>Relaunch</Link>
          </li>
        ))}
      </ul>
      <Link className="btn mt-8" href="/admin-panel/campaigns">← Back to Templates</Link>
    </main>
  );
}

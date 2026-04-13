import Link from "next/link";

export default function Page() {
  const launches = [
    { template_id: "123", created_at: new Date().toISOString(), error_log: "Sample error" },
    { template_id: "456", created_at: new Date().toISOString() }
  ];

  return (
    <ul>
      {launches.map((launch) => (
        <li key={launch.template_id}>
          {launch.error_log && (
            <span className="text-red-600">&nbsp;Error: {launch.error_log}</span>
          )}
          <span>
            &nbsp;on {new Date(launch.created_at).toLocaleString()}
          </span>
          <Link
            className="ml-2"
            href={`/admin-panel/campaigns/launch/${launch.template_id}`}
          >
            Relaunch
          </Link>
        </li>
      ))}
    </ul>
  );
}

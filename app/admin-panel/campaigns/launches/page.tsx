import Link from "next/link";

type Launch = {
  template_id: string;
  error_log?: string;
  created_at: string;
};

type Props = {
  launches: Launch[];
};

export default function LaunchesPage({ launches }: Props) {
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

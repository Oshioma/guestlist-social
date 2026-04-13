import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export default async function Page() {
  const supabase = createServerComponentClient();
  const { data: launches, error } = await supabase
    .from("launches")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return <div>Error loading launches: {error.message}</div>;

  if (!launches?.length) return <div>No launches found.</div>;

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

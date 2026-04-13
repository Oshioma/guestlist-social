import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

// Adjust as needed for your setup!
const PAGE_SIZE = 10;

export default async function Page({ searchParams }: { searchParams: { page?: string } }) {
  const page = Number(searchParams.page || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createServerComponentClient();
  const { data: launches = [], count } = await supabase
    .from("launches")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <>
      <ul>
        {launches.map((launch) => (
          <li key={launch.template_id}>
            {launch.error_log && (
              <span className="text-red-600">&nbsp;Error: {launch.error_log}</span>
            )}
            <span>
              &nbsp;on {new Date(launch.created_at).toLocaleString()}
            </span>
            <Link className="ml-2" href={`/admin-panel/campaigns/launch/${launch.template_id}`}>Relaunch</Link>
          </li>
        ))}
      </ul>
      <nav className="mt-6 flex gap-2">
        {Array.from({ length: totalPages }).map((_, i) => (
          <Link
            key={i}
            href={`?page=${i + 1}`}
            className={`px-3 py-1 rounded ${page === i + 1 ? "bg-black text-white" : "bg-gray-200"}`}
          >
            {i + 1}
          </Link>
        ))}
      </nav>
    </>
  );
}

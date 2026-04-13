import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

const PAGE_SIZE = 10;

type Launch = {
  template_id: string;
  error_log: string | null;
  created_at: string;
};

type Props = {
  searchParams?: {
    filter?: string;
    page?: string;
  };
};

export default async function Page({ searchParams }: Props) {
  const page = Number(searchParams?.page || "1");
  const filter = searchParams?.filter || "all";
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createServerComponentClient();
  let query = supabase
    .from("launches")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter === "errors") {
    query = query.not("error_log", "is", null);
  }

  const { data: launches, count, error } = await query;

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <main className="max-w-3xl mx-auto pt-12 px-6">
      <h1 className="text-2xl font-bold mb-4">Launches</h1>

      {/* Filter controls */}
      <div className="mb-4 flex gap-4 text-sm">
        <Link
          href="?filter=all"
          className={`font-medium hover:underline ${
            filter === "all" ? "text-black underline" : "text-gray-600"
          }`}
        >
          All
        </Link>
        <Link
          href="?filter=errors"
          className={`font-medium hover:underline ${
            filter === "errors" ? "text-black underline" : "text-gray-600"
          }`}
        >
          With Errors
        </Link>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded mb-4">Error: {error.message}</div>
      )}

      {/* List of launches */}
      <ul className="space-y-3">
        {launches && launches.length > 0 ? (
          launches.map((launch: Launch) => (
            <li
              key={launch.template_id}
              className="p-4 bg-gray-50 border rounded flex flex-col sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex-1">
                {launch.error_log && (
                  <span className="text-red-600 font-semibold mr-2">
                    Error: {launch.error_log}
                  </span>
                )}
                <span>
                  on {new Date(launch.created_at).toLocaleString()}
                </span>
              </span>
              <Link
                className="mt-2 sm:mt-0 sm:ml-4 bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 text-sm"
                href={`/admin-panel/campaigns/launch/${launch.template_id}`}
              >
                Relaunch
              </Link>
            </li>
          ))
        ) : (
          <li className="text-gray-500 text-center py-6">No launches found.</li>
        )}
      </ul>

      {/* Pagination */}
      <nav className="mt-7 flex gap-2 justify-center">
        {Array.from({ length: totalPages }).map((_, i) => (
          <Link
            key={i}
            href={`?filter=${filter}&page=${i + 1}`}
            className={`px-3 py-2 rounded ${
              page === i + 1
                ? "bg-black text-white"
                : "bg-gray-200 text-black hover:bg-gray-300"
            }`}
          >
            {i + 1}
          </Link>
        ))}
      </nav>
    </main>
  );
}

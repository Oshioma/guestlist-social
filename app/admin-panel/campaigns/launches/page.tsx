import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SyncButton } from "./SyncButton";
import { ErrorEditor } from "./ErrorEditor";

const PAGE_SIZE = 10;

type Launch = {
  template_id: string;
  error_log: string | null;
  created_at: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams?: {
    filter?: string;
    page?: string;
    search?: string;
  };
}) {
  const page = Number(searchParams?.page || "1");
  const filter = searchParams?.filter || "all";
  const search = (searchParams?.search || "").trim();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Pass the function references only!
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies, headers }
  );

  let query = supabase
    .from("launches")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter === "errors") query = query.not("error_log", "is", null);
  if (search) query = query.ilike("template_id", `%${search}%`);

  const { data: launches, count, error } = await query;
  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  const fromIdx = count ? from + 1 : 0;
  const toIdx = count ? Math.min(to + 1, count) : 0;

  function queryStr(opts: Record<string, any>) {
    const obj = { filter, page, search, ...opts };
    const qs = Object.entries(obj)
      .filter(([_, v]) => v && ((typeof v === "string" && v.trim() !== "") || typeof v === "number"))
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return qs ? `?${qs}` : "";
  }

  return (
    <main className="max-w-3xl mx-auto pt-12 px-6">
      <h1 className="text-2xl font-bold mb-4">Launches Admin Dashboard</h1>
      <SyncButton />

      <div className="mb-4 flex flex-wrap gap-4 items-end">
        <div className="flex gap-3">
          <Link
            href={queryStr({ filter: "all", page: 1 })}
            className={`font-medium hover:underline ${
              filter === "all" ? "text-black underline" : "text-gray-600"
            }`}
          >
            All
          </Link>
          <Link
            href={queryStr({ filter: "errors", page: 1 })}
            className={`font-medium hover:underline ${
              filter === "errors" ? "text-black underline" : "text-gray-600"
            }`}
          >
            With Errors
          </Link>
        </div>
        <form method="GET" action="" className="ml-auto">
          <input
            type="text"
            name="search"
            placeholder="Search Template ID"
            defaultValue={search}
            className="border text-sm rounded px-2 py-1"
          />
          <input type="hidden" name="filter" value={filter} />
          <button
            type="submit"
            className="ml-2 bg-gray-700 text-white px-3 py-1 rounded text-xs"
          >
            Search
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded mb-4">
          Error: {error.message}
        </div>
      )}

      <div className="mb-3 text-sm text-gray-500">
        Showing {fromIdx}–{toIdx} of {count || 0} launches
      </div>
      <ul className="space-y-3">
        {launches && launches.length > 0 ? (
          launches.map((launch: Launch) => (
            <li
              key={launch.template_id}
              className="p-4 bg-gray-50 border rounded flex flex-col sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 space-x-2">
                <ErrorEditor
                  initial={launch.error_log}
                  template_id={launch.template_id}
                />
                <span className="text-xs text-gray-400 ml-2">
                  on {new Date(launch.created_at).toLocaleString()}
                </span>
              </div>
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

      {totalPages > 1 && (
        <nav className="mt-7 flex gap-1 justify-center flex-wrap text-sm">
          <Link
            href={queryStr({ page: Math.max(1, page - 1) })}
            aria-disabled={page === 1}
            className={`px-3 py-2 rounded ${
              page === 1 ? "bg-gray-100 text-gray-400 pointer-events-none" : "bg-gray-200 text-black hover:bg-gray-300"
            }`}
          >
            Prev
          </Link>
          {Array.from({ length: totalPages }).map((_, i) => (
            <Link
              key={i}
              href={queryStr({ page: i + 1 })}
              className={`px-3 py-2 rounded ${
                page === i + 1
                  ? "bg-black text-white"
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
            >
              {i + 1}
            </Link>
          ))}
          <Link
            href={queryStr({ page: Math.min(totalPages, page + 1) })}
            aria-disabled={page === totalPages}
            className={`px-3 py-2 rounded ${
              page === totalPages ? "bg-gray-100 text-gray-400 pointer-events-none" : "bg-gray-200 text-black hover:bg-gray-300"
            }`}
          >
            Next
          </Link>
        </nav>
      )}
    </main>
  );
}

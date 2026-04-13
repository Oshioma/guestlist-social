import Link from "next/link";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SyncButton } from "./SyncButton";
import { ErrorEditor } from "./ErrorEditor";

const PAGE_SIZE = 10;

type LaunchRow = {
  template_id: string;
  error_log: string | null;
  created_at: string;
};

type SearchParams = {
  filter?: string;
  page?: string;
  search?: string;
};

type QueryState = {
  filter: "all" | "errors";
  page: number;
  search: string;
};

function parsePositiveInt(value?: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildQueryString(
  state: QueryState,
  overrides: Partial<QueryState> = {}
): string {
  const next: QueryState = {
    ...state,
    ...overrides,
  };

  const params = new URLSearchParams();

  if (next.filter !== "all") params.set("filter", next.filter);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.search) params.set("search", next.search);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function getVisiblePages(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  pages.add(currentPage);

  if (currentPage - 1 > 1) pages.add(currentPage - 1);
  if (currentPage + 1 < totalPages) pages.add(currentPage + 1);
  if (currentPage - 2 > 1) pages.add(currentPage - 2);
  if (currentPage + 2 < totalPages) pages.add(currentPage + 2);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const prev = sorted[i - 1];

    if (i > 0 && prev !== undefined && current - prev > 1) {
      result.push("ellipsis");
    }

    result.push(current);
  }

  return result;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) || {};

  const rawFilter = resolvedSearchParams.filter === "errors" ? "errors" : "all";
  const rawSearch = (resolvedSearchParams.search || "").trim();
  const rawPage = parsePositiveInt(resolvedSearchParams.page);

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const countQuery = supabase
    .from("launches")
    .select("template_id", { count: "exact", head: true });

  if (rawFilter === "errors") {
    countQuery.not("error_log", "is", null);
  }

  if (rawSearch) {
    countQuery.ilike("template_id", `%${rawSearch}%`);
  }

  const { count, error: countError } = await countQuery;

  const totalCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(rawPage, totalPages);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const state: QueryState = {
    filter: rawFilter,
    page,
    search: rawSearch,
  };

  let dataQuery = supabase
    .from("launches")
    .select("template_id,error_log,created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (rawFilter === "errors") {
    dataQuery = dataQuery.not("error_log", "is", null);
  }

  if (rawSearch) {
    dataQuery = dataQuery.ilike("template_id", `%${rawSearch}%`);
  }

  const { data: launches, error: dataError } = await dataQuery;

  const error = countError || dataError;
  const safeLaunches: LaunchRow[] = launches || [];

  const fromIdx = totalCount > 0 ? from + 1 : 0;
  const toIdx = totalCount > 0 ? Math.min(to + 1, totalCount) : 0;
  const hasActiveFilters = rawFilter !== "all" || rawSearch.length > 0;
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <main className="max-w-4xl mx-auto pt-12 px-6 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Launches Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review launches, inspect errors, and relaunch templates.
          </p>
        </div>
        <div className="shrink-0">
          <SyncButton />
        </div>
      </div>

      <div className="mb-5 rounded-lg border bg-gray-50 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex gap-3 flex-wrap">
            <Link
              href={buildQueryString(state, { filter: "all", page: 1 })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
                rawFilter === "all"
                  ? "bg-black text-white"
                  : "bg-white text-gray-700 border hover:bg-gray-100"
              }`}
            >
              All
            </Link>

            <Link
              href={buildQueryString(state, { filter: "errors", page: 1 })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
                rawFilter === "errors"
                  ? "bg-black text-white"
                  : "bg-white text-gray-700 border hover:bg-gray-100"
              }`}
            >
              With Errors
            </Link>
          </div>

          <form method="GET" action="" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              name="search"
              placeholder="Search template ID"
              defaultValue={rawSearch}
              className="border text-sm rounded px-3 py-2 min-w-[220px]"
            />
            <input type="hidden" name="filter" value={rawFilter} />
            <button
              type="submit"
              className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-black"
            >
              Search
            </button>
            {rawSearch ? (
              <Link
                href={buildQueryString(state, { search: "", page: 1 })}
                className="inline-flex items-center justify-center rounded px-4 py-2 text-sm border bg-white hover:bg-gray-100"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </div>
      </div>

      {error ? (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded mb-4 border border-red-200">
          Error: {error.message}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-500">
          {`Showing ${fromIdx}-${toIdx} of ${totalCount} launches`}
        </div>

        {hasActiveFilters ? (
          <div className="text-xs text-gray-500">
            Active filters:
            {rawFilter === "errors" ? " errors only" : " all launches"}
            {rawSearch ? `, search "${rawSearch}"` : ""}
          </div>
        ) : null}
      </div>

      <ul className="space-y-3">
        {safeLaunches.length > 0 ? (
          safeLaunches.map((launch) => {
            const hasError = Boolean(launch.error_log);

            return (
              <li
                key={`${launch.template_id}-${launch.created_at}`}
                className="p-4 bg-white border rounded-lg flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                    <h2 className="text-sm font-semibold break-all">
                      {launch.template_id}
                    </h2>

                    <span
                      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        hasError
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {hasError ? "Has error" : "No error"}
                    </span>

                    <span className="text-xs text-gray-500">
                      {formatDateTime(launch.created_at)}
                    </span>
                  </div>

                  <div className="mt-3">
                    <ErrorEditor
                      initial={launch.error_log}
                      template_id={launch.template_id}
                    />
                  </div>
                </div>

                <Link
                  className="inline-flex items-center justify-center shrink-0 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                  href={`/admin-panel/campaigns/launch/${launch.template_id}`}
                >
                  Relaunch
                </Link>
              </li>
            );
          })
        ) : (
          <li className="text-center py-10 px-6 border rounded-lg bg-gray-50 text-gray-600">
            <div className="font-medium text-gray-800 mb-1">
              No launches found
            </div>
            <div className="text-sm">
              {hasActiveFilters
                ? "No launches matched your current filters or search."
                : "There are no launches to show yet."}
            </div>
            {hasActiveFilters ? (
              <div className="mt-4">
                <Link
                  href={buildQueryString(state, {
                    filter: "all",
                    page: 1,
                    search: "",
                  })}
                  className="inline-flex items-center justify-center rounded px-4 py-2 text-sm border bg-white hover:bg-gray-100"
                >
                  Clear filters
                </Link>
              </div>
            ) : null}
          </li>
        )}
      </ul>

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-1 flex-wrap text-sm">
          <Link
            href={buildQueryString(state, { page: Math.max(1, page - 1) })}
            aria-disabled={page === 1}
            className={`px-3 py-2 rounded ${
              page === 1
                ? "bg-gray-100 text-gray-400 pointer-events-none"
                : "bg-gray-200 text-black hover:bg-gray-300"
            }`}
          >
            Prev
          </Link>

          {visiblePages.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 py-2 text-gray-400"
              >
                ...
              </span>
            ) : (
              <Link
                key={item}
                href={buildQueryString(state, { page: item })}
                className={`px-3 py-2 rounded ${
                  page === item
                    ? "bg-black text-white"
                    : "bg-gray-200 text-black hover:bg-gray-300"
                }`}
              >
                {item}
              </Link>
            )
          )}

          <Link
            href={buildQueryString(state, { page: Math.min(totalPages, page + 1) })}
            aria-disabled={page === totalPages}
            className={`px-3 py-2 rounded ${
              page === totalPages
                ? "bg-gray-100 text-gray-400 pointer-events-none"
                : "bg-gray-200 text-black hover:bg-gray-300"
            }`}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </main>
  );
}

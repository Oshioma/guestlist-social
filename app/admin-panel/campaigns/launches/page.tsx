import Link from "next/link";
import { cookies } from "next/headers";
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
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
            defaultValue


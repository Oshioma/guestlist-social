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

  // ✅ CORRECT: Pass the function references only!
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

  function queryStr


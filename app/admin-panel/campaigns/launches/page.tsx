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
  const filter =


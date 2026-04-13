import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for backend code that needs to bypass RLS:
// cron jobs, server actions, sync routines. The publishable-key SSR
// client in ./server.ts is for code that runs in the user's session;
// this one is for code that runs on behalf of the system.
//
// One canonical factory beats the dozen copy-pasted versions that used
// to live in every action and route file.
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

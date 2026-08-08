import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Best-effort client IP for rate-limiting keys. On Vercel the real client IP is
// the first entry of x-forwarded-for; x-real-ip is the fallback. Returns null
// when neither is present (local dev), in which case callers key on a constant
// so the limit still applies coarsely rather than not at all.
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip");
}

// Increment the fixed-window counter for `bucket` and report whether the caller
// is still under `limit` within `windowSeconds`. Backed by the Postgres
// check_rate_limit() function (see 20260811_auth_rate_limits.sql).
//
// Fail-open: if the migration isn't applied yet or the RPC errors, we return
// `true` (allowed). A rate limiter must never lock real users out of auth
// because of an infra hiccup — CAPTCHA still gates, and the counter resumes
// enforcing as soon as the backend is healthy.
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("check_rate_limit rpc error:", error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error("check_rate_limit failed:", e);
    return true;
  }
}

// Convenience: enforce several buckets at once (e.g. per-IP and per-email).
// Allowed only if every bucket is under its limit. Every bucket is incremented
// (fixed-window semantics) even if another already tripped — that's the
// intended behaviour for abuse throttling, where each dimension counts its own
// hits independently.
export async function checkRateLimits(
  buckets: { key: string; limit: number; windowSeconds: number }[]
): Promise<boolean> {
  const results = await Promise.all(
    buckets.map((b) => checkRateLimit(b.key, b.limit, b.windowSeconds))
  );
  return results.every(Boolean);
}

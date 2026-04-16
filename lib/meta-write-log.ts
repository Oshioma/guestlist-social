/**
 * Central audit logger for every write to the Meta Graph API.
 *
 * Call logMetaWrite() after each POST to Meta. It's fire-and-forget:
 * failures are logged to stderr but never thrown — an audit miss must
 * never block the operation it's recording.
 *
 * Tokens are redacted before storage: access_token and appsecret_proof
 * are replaced with "[REDACTED]" in both request and response bodies.
 */

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function redact(obj: unknown): unknown {
  if (obj == null) return obj;
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "access_token" || k === "appsecret_proof") {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return obj;
}

export type MetaWriteLogEntry = {
  operation: string;
  clientId?: number | null;
  adId?: number | null;
  campaignId?: number | null;
  queueId?: number | null;
  metaEndpoint: string;
  requestBody?: Record<string, unknown> | null;
  responseStatus?: number | null;
  responseBody?: unknown;
  success: boolean;
  errorMessage?: string | null;
  durationMs?: number | null;
};

export async function logMetaWrite(entry: MetaWriteLogEntry): Promise<void> {
  try {
    const supabase = getServiceClient();
    if (!supabase) return;

    await supabase.from("meta_write_log").insert({
      operation: entry.operation,
      client_id: entry.clientId ?? null,
      ad_id: entry.adId ?? null,
      campaign_id: entry.campaignId ?? null,
      queue_id: entry.queueId ?? null,
      meta_endpoint: entry.metaEndpoint,
      request_body: redact(entry.requestBody) as Record<string, unknown> | null,
      response_status: entry.responseStatus ?? null,
      response_body: redact(entry.responseBody) ?? null,
      success: entry.success,
      error_message: entry.errorMessage?.slice(0, 2000) ?? null,
      duration_ms: entry.durationMs ?? null,
    });
  } catch (err) {
    console.error("meta-write-log: failed to write audit row:", err);
  }
}

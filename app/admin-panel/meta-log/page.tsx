import Link from "next/link";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDisplayTimezone } from "../../../lib/app-settings";
import { formatDateTimeInZone } from "../../../lib/timezone";

export const dynamic = "force-dynamic";

// Diagnostic view over meta_write_log: every POST the app made to Meta's
// Graph API for content publishing, with exactly what came back. This is the
// ground truth for "the app says Published — did Meta actually accept it, and
// what id did it return?". A row per Meta call: Instagram is two rows
// (/media then /media_publish), Facebook is one (/photos or /feed).

type LogRow = {
  id: number;
  operation: string;
  meta_endpoint: string;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  response_body: unknown;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
};

function operationLabel(op: string): { label: string; bg: string; color: string } {
  if (op === "publish:facebook")
    return { label: "Facebook", bg: "#e0f2fe", color: "#075985" };
  if (op === "publish:instagram")
    return { label: "Instagram", bg: "#fdf2f8", color: "#9d174d" };
  if (op === "publish:instagram_story")
    return { label: "IG Story", bg: "#fdf2f8", color: "#9d174d" };
  return { label: op, bg: "#f4f4f5", color: "#3f3f46" };
}

// Pull the id Meta handed back (a real post/media id means it truly posted).
function extractMetaId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const id = b.post_id ?? b.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

export default async function MetaPublishLogPage() {
  let rows: LogRow[] = [];
  let loadError: string | null = null;
  let timeZone = "Europe/London";

  try {
    const admin = createAdminClient();
    try {
      timeZone = await getDisplayTimezone(admin);
    } catch {
      /* fall back to default zone */
    }
    const { data, error } = await admin
      .from("meta_write_log")
      .select(
        "id, operation, meta_endpoint, request_body, response_status, response_body, success, error_message, duration_ms, created_at"
      )
      .like("operation", "publish:%")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) loadError = error.message;
    rows = (data ?? []) as LogRow[];
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load the log.";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      <div>
        <Link
          href="/app/proofer/publish"
          style={{
            fontSize: 13,
            color: "#8b8b93",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 6,
          }}
        >
          &larr; Back to Publish Queue
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.05,
            fontWeight: 800,
            color: "#3a3a42",
            letterSpacing: "-0.03em",
          }}
        >
          Meta publish log
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#52525b", maxWidth: "70ch", lineHeight: 1.5 }}>
          Every call the app made to Meta when publishing a post, and exactly
          what Meta sent back. A <strong>green “posted”</strong> row with a post
          id means Meta genuinely accepted the post. A <strong>red</strong> row
          is a rejection (the reason is shown). If a post shows “Published” in
          the queue but there’s <em>no</em> matching Meta call here, it was
          marked published by hand rather than actually sent to Meta.
        </p>
      </div>

      {loadError && (
        <div
          style={{
            fontSize: 13,
            color: "#991b1b",
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          Couldn’t load the log: {loadError}
        </div>
      )}

      {!loadError && rows.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: "#52525b",
            background: "#fff",
            border: "1px solid #ececef",
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          No Meta publish calls recorded yet. If posts show “Published” in the
          queue but nothing appears here, they were marked published manually —
          nothing was sent to Meta.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row) => {
          const op = operationLabel(row.operation);
          const metaId = extractMetaId(row.response_body);
          const isPublishStep =
            row.meta_endpoint.includes("media_publish") ||
            row.meta_endpoint.includes("/photos") ||
            row.meta_endpoint.includes("/feed");
          return (
            <div
              key={row.id}
              style={{
                border: "1px solid #ececef",
                borderLeft: `3px solid ${row.success ? "#a7e6bd" : "#f4b8b2"}`,
                borderRadius: 12,
                background: "#fff",
                padding: "12px 14px",
                boxShadow: "0 1px 2px rgba(24,24,27,.04)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: op.bg,
                    color: op.color,
                  }}
                >
                  {op.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: row.success ? "#e4f7ea" : "#fdeceb",
                    color: row.success ? "#15803d" : "#b42318",
                  }}
                >
                  {row.success ? "✓ accepted by Meta" : "✕ rejected"}
                </span>
                <code style={{ fontSize: 11, color: "#8b8b93" }}>
                  {row.meta_endpoint}
                  {row.response_status != null ? ` · HTTP ${row.response_status}` : ""}
                  {row.duration_ms != null ? ` · ${row.duration_ms}ms` : ""}
                </code>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#8b8b93" }}>
                  {formatDateTimeInZone(row.created_at, timeZone)}
                </span>
              </div>

              {row.success && metaId && isPublishStep && (
                <div style={{ fontSize: 12.5, color: "#3a3a42" }}>
                  Meta post id:{" "}
                  <code style={{ fontWeight: 700, color: "#15803d" }}>{metaId}</code>{" "}
                  <span style={{ color: "#8b8b93" }}>
                    — a real id here means the post was published on Meta.
                  </span>
                </div>
              )}

              {row.error_message && (
                <div style={{ fontSize: 12.5, color: "#b42318", lineHeight: 1.4 }}>
                  {row.error_message}
                </div>
              )}

              <details>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#52525b" }}>
                  Raw Meta response
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    lineHeight: 1.5,
                    background: "#f5f5f6",
                    border: "1px solid #ececef",
                    borderRadius: 8,
                    padding: "10px 12px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "#3f3f46",
                  }}
                >
                  {JSON.stringify(
                    { request: row.request_body, response: row.response_body },
                    null,
                    2
                  )}
                </pre>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

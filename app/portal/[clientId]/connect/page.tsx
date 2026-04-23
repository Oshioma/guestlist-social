// /portal/[clientId]/connect
//
// Lets a client connect (or reconnect) their Meta / Instagram account.
// The actual OAuth flow is handled server-side by /api/meta/connect and
// /api/meta/callback — this page just provides the entry point and shows
// the current connection status.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { canViewClient, getViewer } from "../../../admin-panel/lib/viewer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type ConnectedAccount = {
  id: string;
  platform: string;
  account_name: string | null;
  token_expires_at: string | null;
  updated_at: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isExpired(iso: string | null) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export default async function PortalConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ meta?: string; meta_error?: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);
  if (!Number.isFinite(clientId)) notFound();

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const { meta, meta_error } = await searchParams;

  const admin = createAdminClient();
  const { data: accounts } = await admin
    .from("connected_meta_accounts")
    .select("id, platform, account_name, token_expires_at, updated_at")
    .eq("client_id", clientId)
    .order("platform");

  const connected = (accounts ?? []) as ConnectedAccount[];
  const igAccount = connected.find((a) => a.platform === "instagram");
  const fbAccount = connected.find((a) => a.platform === "facebook");

  const connectUrl = `/api/meta/connect?clientId=${clientId}&returnTo=portal`;

  const isMetaConfigured = !!process.env.META_SOCIAL_APP_ID;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#64748b",
            marginBottom: 8,
          }}
        >
          Meta / Instagram
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#18181b" }}>
          Connect your account
        </h1>
        <p style={{ marginTop: 10, fontSize: 15, color: "#52525b", lineHeight: 1.6 }}>
          Connect your Facebook Page and Instagram account so we can publish posts,
          reply to comments, and monitor your performance — all on your behalf.
        </p>
      </div>

      {/* Success / error banner */}
      {meta === "connected" && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>✓</span>
          <div>
            <div style={{ fontWeight: 600, color: "#15803d", fontSize: 14 }}>
              Account connected successfully
            </div>
            <div style={{ fontSize: 13, color: "#166534", marginTop: 3 }}>
              Your Meta account is now linked. We can manage posts and monitor
              your Instagram from here.
            </div>
          </div>
        </div>
      )}

      {meta_error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontWeight: 600, color: "#dc2626", fontSize: 14 }}>
            Connection failed
          </div>
          <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 4 }}>
            {meta_error}
          </div>
        </div>
      )}

      {/* Current status */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #f4f4f5",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#71717a",
          }}
        >
          Connection status
        </div>

        {[
          { label: "Facebook Page", account: fbAccount },
          { label: "Instagram", account: igAccount },
        ].map(({ label, account }) => {
          const expired = isExpired(account?.token_expires_at ?? null);
          return (
            <div
              key={label}
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #f4f4f5",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: account ? (expired ? "#f59e0b" : "#22c55e") : "#d4d4d8",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
                  {account
                    ? `${account.account_name ?? "Connected"} · ${
                        expired
                          ? "Token expired — reconnect below"
                          : `Active · connected ${formatDate(account.updated_at)}`
                      }`
                    : "Not connected"}
                </div>
              </div>
              {account && !expired && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#16a34a",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  Active
                </span>
              )}
              {account && expired && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#d97706",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  Expired
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Connect / reconnect CTA */}
      {isMetaConfigured ? (
        <div
          style={{
            background: "#18181b",
            borderRadius: 12,
            padding: 24,
            color: "#fff",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {connected.length > 0 ? "Reconnect your Meta account" : "Connect with Meta"}
          </div>
          <p style={{ fontSize: 13, color: "#a1a1aa", margin: "0 0 20px", lineHeight: 1.6 }}>
            {connected.length > 0
              ? "If your token has expired or you switched Facebook Pages, click below to reconnect. You'll be taken to Facebook to approve access and then returned here."
              : "Click below to log in with Facebook and grant us access to your Page and Instagram account. You'll be returned here once done."}
          </p>
          <a
            href={connectUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "#1877F2",
              color: "#fff",
              padding: "12px 22px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            {connected.length > 0 ? "Reconnect with Facebook" : "Connect with Facebook"}
          </a>
        </div>
      ) : (
        <div
          style={{
            background: "#fafafa",
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 14, color: "#71717a" }}>
            Meta connection is not yet configured for this account. Please contact
            your account manager to get set up.
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Link
          href={`/portal/${clientId}`}
          style={{ fontSize: 13, color: "#71717a", textDecoration: "none" }}
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

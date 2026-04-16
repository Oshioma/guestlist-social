import { createAdminClient } from "@/lib/supabase/admin";

type AccountRow = {
  client_id: number;
  platform: string;
  account_name: string | null;
  token_expires_at: string | null;
};

const WARN_DAYS = 7;

export default async function TokenExpiryBanner() {
  let accounts: AccountRow[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("connected_meta_accounts")
      .select("client_id, platform, account_name, token_expires_at")
      .order("token_expires_at", { ascending: true });
    accounts = (data ?? []) as AccountRow[];
  } catch {
    return null;
  }

  if (accounts.length === 0) return null;

  const now = Date.now();
  const warnCutoff = now + WARN_DAYS * 24 * 60 * 60 * 1000;

  const expired: AccountRow[] = [];
  const expiringSoon: AccountRow[] = [];

  for (const acc of accounts) {
    if (!acc.token_expires_at) continue;
    const expiresMs = new Date(acc.token_expires_at).getTime();
    if (Number.isNaN(expiresMs)) continue;
    if (expiresMs < now) {
      expired.push(acc);
    } else if (expiresMs < warnCutoff) {
      expiringSoon.push(acc);
    }
  }

  if (expired.length === 0 && expiringSoon.length === 0) return null;

  const names = (rows: AccountRow[]) =>
    rows
      .map((r) => r.account_name || `${r.platform} (client ${r.client_id})`)
      .join(", ");

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        background: expired.length > 0 ? "#fef2f2" : "#fffbeb",
        border: `1px solid ${expired.length > 0 ? "#fecaca" : "#fde68a"}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: expired.length > 0 ? "#991b1b" : "#92400e",
        }}
      >
        {expired.length > 0
          ? `${expired.length} Meta token${expired.length === 1 ? "" : "s"} expired`
          : `${expiringSoon.length} Meta token${expiringSoon.length === 1 ? "" : "s"} expiring within ${WARN_DAYS} days`}
      </div>
      {expired.length > 0 && (
        <div style={{ fontSize: 12, color: "#991b1b" }}>
          Expired: {names(expired)}.
          Scheduled posts for these accounts will fail until you re-connect.
        </div>
      )}
      {expiringSoon.length > 0 && (
        <div style={{ fontSize: 12, color: "#92400e" }}>
          Expiring soon: {names(expiringSoon)}.
          Re-connect before they expire to avoid publish failures.
        </div>
      )}
      <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
        Go to Settings &rarr; Meta Ads Sync or use the Connect Meta button on the publish page.
      </div>
    </div>
  );
}

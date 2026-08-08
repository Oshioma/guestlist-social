import {
  getProoferPublishQueueData,
  getProoferOverviewPosts,
} from "../../lib/queries";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getDisplayTimezone } from "../../../../lib/app-settings";
import { metaServiceClient } from "../../lib/meta-auth";
import { mapClientStatus } from "../../lib/mappers";
import PublishQueueBoard from "./PublishQueueBoard";
import TokenExpiryBanner from "../../components/TokenExpiryBanner";

export type ConnectResult = {
  status: "success" | "error";
  message?: string;
  pages: string[];
  fbCount?: number;
  igCount?: number;
};

// The Publish Queue's data-loading + board, shared by two surfaces: the admin
// panel (/app/proofer/publish) and the standalone Proofer app
// (/proofer/publish, served at /publish on postproofer.com). The links and the
// Meta connection panel differ per surface, so they're props with admin-panel
// defaults.
export default async function PublishQueueView({
  connectResult = null,
  backHref = "/app/proofer",
  settingsHref = "/app/settings",
  clientEditBase = "/app/clients",
  showMetaConnection = true,
}: {
  connectResult?: ConnectResult | null;
  backHref?: string;
  settingsHref?: string;
  clientEditBase?: string;
  showMetaConnection?: boolean;
}) {
  let queueItems: Awaited<ReturnType<typeof getProoferPublishQueueData>>["queueItems"] = [];
  try {
    const data = await getProoferPublishQueueData();
    queueItems = data.queueItems;
  } catch (err) {
    console.error("Publish queue data error:", err);
  }

  // Every proofer post (all statuses), for the at-a-glance day overview — it
  // needs the "saved but not approved" days the publish queue never sees.
  let overviewPosts: Awaited<ReturnType<typeof getProoferOverviewPosts>> = [];
  try {
    overviewPosts = await getProoferOverviewPosts();
  } catch (err) {
    console.error("Overview posts error:", err);
  }

  // Clients (archived excluded) — used by the "Connect Meta" picker and the
  // board's schedule-time publishability check (needs each client's declared
  // Instagram handle / Facebook Page). The at-a-glance overview additionally
  // narrows to status === "active" via each client's `active` flag. `fb_page`
  // is a newer column, so fall back gracefully if the migration hasn't run yet.
  const supabase = await createClient();
  let clientsRows: {
    id: string | number;
    name?: string | null;
    ig_handle?: string | null;
    fb_page?: string | null;
    status?: string | null;
  }[] = [];
  const clientsFull = await supabase
    .from("clients")
    .select("id, name, ig_handle, fb_page, status")
    .eq("archived", false)
    .order("name", { ascending: true });
  if (clientsFull.error) {
    const fallback = await supabase
      .from("clients")
      .select("id, name, ig_handle, status")
      .eq("archived", false)
      .order("name", { ascending: true });
    clientsRows = (fallback.data ?? []) as typeof clientsRows;
  } else {
    clientsRows = (clientsFull.data ?? []) as typeof clientsRows;
  }
  const clients = clientsRows.map((c) => ({
    id: String(c.id),
    name: c.name ?? "Client",
    igHandle: (c.ig_handle as string | null) ?? null,
    fbPage: (c.fb_page as string | null) ?? null,
    // "growing" and "active" both normalise to active (see mapClientStatus).
    active: mapClientStatus((c.status as string | null) ?? "") === "active",
  }));

  // Agency-wide display region. Reads via the service role so it works
  // regardless of RLS, and falls back to GMT if unset.
  let displayTimezone = "Etc/GMT";
  try {
    displayTimezone = await getDisplayTimezone(createAdminClient());
  } catch (err) {
    console.error("Display timezone load error:", err);
  }

  // Connected Meta accounts per client. Reads via the service role because
  // the connected_meta_accounts table has RLS enabled with no policies. We
  // strip the access_token before handing it to the client component —
  // tokens must never land in browser HTML.
  let connectedAccounts: {
    clientId: string;
    platform: "facebook" | "instagram";
    accountId: string;
    accountName: string;
  }[] = [];
  let metaConnectionError: string | null = null;
  try {
    const svc = metaServiceClient();
    const { data, error } = await svc
      .from("connected_meta_accounts")
      .select("client_id, platform, account_id, account_name")
      .order("platform", { ascending: true })
      .order("account_name", { ascending: true });
    if (error) {
      metaConnectionError = error.message;
    }
    connectedAccounts = (data ?? []).map((row) => ({
      clientId: String(row.client_id),
      platform: row.platform as "facebook" | "instagram",
      accountId: String(row.account_id),
      accountName: String(row.account_name ?? ""),
    }));
  } catch (err) {
    metaConnectionError =
      err instanceof Error ? err.message : "Could not load connected accounts";
    connectedAccounts = [];
  }

  // Current "YYYY-MM" in the agency's display zone, so the at-a-glance day
  // overview opens on the right month even when the server clock is in UTC.
  // en-CA renders as YYYY-MM, which is exactly the key the board groups by.
  const currentMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: displayTimezone,
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

  return (
    <>
      <TokenExpiryBanner />
      <PublishQueueBoard
        queueItems={queueItems}
        defaultScheduleValue=""
        clients={clients}
        connectedAccounts={connectedAccounts}
        metaConnectionError={metaConnectionError}
        connectResult={connectResult}
        timeZone={displayTimezone}
        currentMonth={currentMonth}
        overviewPosts={overviewPosts}
        backHref={backHref}
        settingsHref={settingsHref}
        clientEditBase={clientEditBase}
        showMetaConnection={showMetaConnection}
      />
    </>
  );
}

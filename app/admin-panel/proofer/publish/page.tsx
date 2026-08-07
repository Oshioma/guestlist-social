import { getProoferPublishQueueData } from "../../lib/queries";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getDisplayTimezone } from "../../../../lib/app-settings";
import { metaServiceClient } from "../../lib/meta-auth";
import PublishQueueBoard from "./PublishQueueBoard";
import TokenExpiryBanner from "../../components/TokenExpiryBanner";

export const dynamic = "force-dynamic";
// "Publish now" runs the publishMetaQueueItem server action from this route.
// Publishing an Instagram video (Reel / Story) polls Meta's container status
// until processing finishes (~up to 2 min), so the action needs headroom well
// past the default function timeout — otherwise it's killed mid-poll and the
// video never publishes. Matches the auto-publish cron's maxDuration.
export const maxDuration = 300;

type ConnectResult = {
  status: "success" | "error";
  message?: string;
  pages: string[];
  fbCount?: number;
  igCount?: number;
};

export default async function ProoferPublishPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Surface the Meta OAuth callback's outcome — including exactly which Pages
  // Facebook returned — so a connect attempt isn't a black box.
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const metaFlag = first(sp.meta);
  const metaError = first(sp.meta_error);
  const pagesParam = first(sp.pages);
  const returnedPages = pagesParam ? pagesParam.split("|").filter(Boolean) : [];
  let connectResult: ConnectResult | null = null;
  if (metaError) {
    connectResult = { status: "error", message: metaError, pages: returnedPages };
  } else if (metaFlag === "connected") {
    connectResult = {
      status: "success",
      pages: returnedPages,
      fbCount: Number(first(sp.fb)) || 0,
      igCount: Number(first(sp.ig)) || 0,
    };
  }

  let queueItems: Awaited<ReturnType<typeof getProoferPublishQueueData>>["queueItems"] = [];
  try {
    const data = await getProoferPublishQueueData();
    queueItems = data.queueItems;
  } catch (err) {
    console.error("Publish queue data error:", err);
  }

  // Lightweight clients list used by the "Connect Meta" picker and by the
  // board's schedule-time publishability check (needs each client's declared
  // Instagram handle / Facebook Page). `fb_page` is a newer column, so fall
  // back gracefully if the migration hasn't run yet.
  const supabase = await createClient();
  let clientsRows: { id: string | number; name?: string | null; ig_handle?: string | null; fb_page?: string | null }[] = [];
  const clientsFull = await supabase
    .from("clients")
    .select("id, name, ig_handle, fb_page")
    .order("name", { ascending: true });
  if (clientsFull.error) {
    const fallback = await supabase
      .from("clients")
      .select("id, name, ig_handle")
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
    />
    </>
  );
}

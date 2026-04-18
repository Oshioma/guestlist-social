import { getProoferPublishQueueData } from "../../lib/queries";
import { createClient } from "../../../../lib/supabase/server";
import { metaServiceClient } from "../../lib/meta-auth";
import PublishQueueBoard from "./PublishQueueBoard";
import TokenExpiryBanner from "../../components/TokenExpiryBanner";

export const dynamic = "force-dynamic";

export default async function ProoferPublishPage() {
  const { readyPosts, queueItems } = await getProoferPublishQueueData();

  // Lightweight clients list used by the "Connect Meta" picker.
  const supabase = await createClient();
  const clientsRes = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });
  const clients = (clientsRes.data ?? []).map((c) => ({
    id: String(c.id),
    name: c.name ?? "Client",
  }));

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
  try {
    const svc = metaServiceClient();
    const { data } = await svc
      .from("connected_meta_accounts")
      .select("client_id, platform, account_id, account_name")
      .order("platform", { ascending: true })
      .order("account_name", { ascending: true });
    connectedAccounts = (data ?? []).map((row) => ({
      clientId: String(row.client_id),
      platform: row.platform as "facebook" | "instagram",
      accountId: String(row.account_id),
      accountName: String(row.account_name ?? ""),
    }));
  } catch {
    // Missing service-role env vars in local dev — degrade gracefully, the
    // "Meta connection" card will just show zero connected accounts.
    connectedAccounts = [];
  }

  return (
    <>
    <TokenExpiryBanner />
    <PublishQueueBoard
      readyPosts={readyPosts}
      queueItems={queueItems}
      defaultScheduleValue=""
      clients={clients}
      connectedAccounts={connectedAccounts}
    />
    </>
  );
}

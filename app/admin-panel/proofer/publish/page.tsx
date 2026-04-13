import { getProoferPublishQueueData } from "../../lib/queries";
import { createClient } from "../../../../lib/supabase/server";
import PublishQueueBoard from "./PublishQueueBoard";

export const dynamic = "force-dynamic";

function getNowLocalInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const local = new Date(now.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

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

  return (
    <PublishQueueBoard
      readyPosts={readyPosts}
      queueItems={queueItems}
      defaultScheduleValue={getNowLocalInputValue()}
      clients={clients}
    />
  );
}

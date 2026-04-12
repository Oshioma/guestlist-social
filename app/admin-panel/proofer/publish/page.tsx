import { getProoferPublishQueueData } from "../../lib/queries";
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

  return (
    <PublishQueueBoard
      readyPosts={readyPosts}
      queueItems={queueItems}
      defaultScheduleValue={getNowLocalInputValue()}
    />
  );
}

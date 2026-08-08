import PublishQueueView, { type ConnectResult } from "./PublishQueueView";

export const dynamic = "force-dynamic";
// "Publish now" runs the publishMetaQueueItem server action from this route.
// Publishing an Instagram video (Reel / Story) polls Meta's container status
// until processing finishes (~up to 2 min), so the action needs headroom well
// past the default function timeout — otherwise it's killed mid-poll and the
// video never publishes. Matches the auto-publish cron's maxDuration.
export const maxDuration = 300;

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

  return <PublishQueueView connectResult={connectResult} />;
}

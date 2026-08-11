import { redirect } from "next/navigation";
import { getProoferBase } from "../../base";

export const dynamic = "force-dynamic";

// The per-team detail page has been retired: renaming, deleting, connecting,
// members, remove-account and billing all live on the Teams list page now.
// This stub just forwards any lingering links (old bookmarks, Stripe return
// URLs) to the list, preserving a billing=success|cancelled banner param.
export default async function RetiredTeamDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { base } = await getProoferBase();
  const { billing } = await searchParams;
  const qs = billing ? `?billing=${encodeURIComponent(billing)}` : "";
  redirect(`${base}/teams${qs}`);
}

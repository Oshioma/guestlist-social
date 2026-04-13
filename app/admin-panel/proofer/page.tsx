import { getProoferData } from "../lib/queries";
import ProoferBoard from "./ProoferBoard";
import EmptyState from "../components/EmptyState";

export const dynamic = "force-dynamic";

function getNextSixMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    months.push({ value, label });
  }
  return months;
}

export default async function ProoferPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const months = getNextSixMonths();
  const defaultMonth = months[0]?.value ?? "";
  const selectedMonth = sp.month ?? defaultMonth;

  try {
    const initial = await getProoferData(sp.client, selectedMonth);
    const selectedClientId = sp.client ?? initial.clients[0]?.id ?? "";

    // If no client was specified and we fell back to the first client, load
    // its posts too so the board has something to show on first render.
    const data =
      !sp.client && selectedClientId
        ? await getProoferData(selectedClientId, selectedMonth)
        : initial;

    return (
      <ProoferBoard
        clients={data.clients}
        months={months}
        initialClientId={selectedClientId}
        initialMonth={selectedMonth}
        initialPosts={data.posts}
        initialPillars={data.pillars}
        initialIdeas={data.ideas}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <EmptyState title="Unable to load proofer" description={message} />
    );
  }
}

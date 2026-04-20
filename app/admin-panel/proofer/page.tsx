import { cookies } from "next/headers";
import { getProoferData } from "../lib/queries";
import ProoferBoard from "./ProoferBoard";
import EmptyState from "../components/EmptyState";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "proofer_last_client";

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

  const cookieStore = await cookies();
  const lastClient = cookieStore.get(COOKIE_NAME)?.value ?? "";

  try {
    let selectedClientId = sp.client ?? "";
    if (!selectedClientId && lastClient) {
      selectedClientId = lastClient;
    }
    if (!selectedClientId) {
      const { clients } = await getProoferData();
      selectedClientId = clients[0]?.id ?? "";
    }

    const data = await getProoferData(
      selectedClientId || undefined,
      selectedClientId ? selectedMonth : undefined
    );

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

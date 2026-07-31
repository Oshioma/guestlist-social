import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import PaymentsTable, {
  type PaymentRow,
} from "@/app/admin-panel/components/PaymentsTable";
import { mapClientStatus } from "@/app/admin-panel/lib/mappers";

export const dynamic = "force-dynamic";

// What clients pay the agency — admin-only billing view.
export default async function ClientPaymentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, name, monthly_price, direct_debit, status")
    .eq("archived", false)
    .order("name", { ascending: true });

  const rows: PaymentRow[] = (data ?? []).map((c) => {
    const rawStatus = (c.status as string) ?? "";
    return {
      id: String(c.id),
      name: (c.name as string) ?? "Untitled client",
      price:
        c.monthly_price != null && Number.isFinite(Number(c.monthly_price))
          ? Number(c.monthly_price)
          : null,
      directDebit: c.direct_debit === true,
      status: mapClientStatus(rawStatus),
      active: rawStatus === "active" || rawStatus === "growing",
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            Client payments
          </h1>
          <p style={{ fontSize: 14, color: "#71717a", margin: "6px 0 0" }}>
            What each client pays us each month. Click a column to sort. Set a
            client&apos;s price on their edit page.
          </p>
        </div>
        <Link
          href="/app/clients"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e4e4e7",
            background: "#fff",
            color: "#18181b",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ← Clients
        </Link>
      </div>

      <PaymentsTable rows={rows} />
    </div>
  );
}

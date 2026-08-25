import { redirect } from "next/navigation";
import { getMemberAccess } from "@/lib/auth/permissions";
import SalesTabs from "../components/SalesTabs";

// Sales is crew-wide (reps log their own numbers), so this gates on admitted
// membership rather than the admin role. RLS on the sales tables enforces the
// same boundary at the data layer.
export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getMemberAccess();
  if (!access) redirect("/post-login");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Sales</h1>
        <p style={{ fontSize: 14, color: "#71717a", margin: "6px 0 0" }}>
          Calls, opportunities and deals — logged weekly, with the pipeline of
          every company pitched. Everything is editable inline.
        </p>
      </div>

      <SalesTabs />

      {children}
    </div>
  );
}

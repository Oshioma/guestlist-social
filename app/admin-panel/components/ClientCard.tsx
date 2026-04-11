import Link from "next/link";
import type { Client } from "../lib/types";
import StatusPill from "./StatusPill";
import { formatCurrency } from "../lib/utils";

export default function ClientCard({ client }: { client: Client }) {
  return (
    <Link
      href={`/app/clients/${client.id}`}
      style={{
        display: "block",
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>{client.name}</span>
        <StatusPill status={client.status} />
      </div>
      <div style={{ fontSize: 13, color: "#71717a" }}>
        {client.platform}
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 10,
          fontSize: 13,
          color: "#52525b",
        }}
      >
        <span>{formatCurrency(client.monthlyBudget)}/mo</span>
        <span>{client.adCount} ads</span>
      </div>
    </Link>
  );
}

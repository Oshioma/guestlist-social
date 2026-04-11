import Link from "next/link";
import ClientForm from "../../components/ClientForm";

export default function NewClientPage() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/app/clients"
          style={{ fontSize: 13, color: "#71717a", textDecoration: "none" }}
        >
          &larr; Back to clients
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "8px 0 0" }}>
          New Client
        </h2>
      </div>

      <ClientForm />
    </div>
  );
}

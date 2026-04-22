"use client";

import { useRouter } from "next/navigation";

type ClientOption = {
  id: string;
  name: string;
};

type Props = {
  clients: ClientOption[];
  selectedClientId: string;
};

export default function InteractionClientSwitcher({
  clients,
  selectedClientId,
}: Props) {
  const router = useRouter();
  const selectedClientName =
    clients.find((client) => client.id === selectedClientId)?.name ?? "";

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        width: "100%",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#71717a",
        }}
      >
        Client
      </span>
      <select
        aria-label="Select a client for interaction engine"
        value={selectedClientId}
        onChange={(event) => {
          const nextClientId = event.target.value;
          if (!nextClientId || nextClientId === selectedClientId) return;
          router.push(`/app/interaction?clientId=${encodeURIComponent(nextClientId)}`);
        }}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #d4d4d8",
          background: "#fff",
          color: "#18181b",
          fontSize: 14,
          fontWeight: 600,
          outline: "none",
        }}
      >
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: "#71717a" }}>
        Running engine for <strong style={{ color: "#18181b" }}>{selectedClientName}</strong>
      </span>
    </div>
  );
}

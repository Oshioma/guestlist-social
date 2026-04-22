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

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        fontSize: 13,
        color: "#52525b",
      }}
    >
      <span style={{ fontWeight: 600 }}>Client</span>
      <select
        aria-label="Select a client for interaction engine"
        value={selectedClientId}
        onChange={(event) => {
          const nextClientId = event.target.value;
          if (!nextClientId || nextClientId === selectedClientId) return;
          router.push(`/app/interaction?clientId=${encodeURIComponent(nextClientId)}`);
        }}
        style={{
          minWidth: 240,
          padding: "9px 10px",
          borderRadius: 10,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#18181b",
          fontSize: 13,
          outline: "none",
        }}
      >
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}

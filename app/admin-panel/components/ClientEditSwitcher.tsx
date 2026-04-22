"use client";

import { useRouter } from "next/navigation";

type ClientOption = {
  id: number | string;
  name: string;
};

export default function ClientEditSwitcher({
  clients,
  currentClientId,
}: {
  clients: ClientOption[];
  currentClientId: string;
}) {
  const router = useRouter();
  const normalizedCurrentId = String(currentClientId);
  const hasCurrentInOptions = clients.some(
    (client) => String(client.id) === normalizedCurrentId
  );

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "#52525b",
      }}
    >
      <span style={{ whiteSpace: "nowrap" }}>Jump to edit:</span>
      <select
        aria-label="Jump to another active client edit page"
        defaultValue={hasCurrentInOptions ? normalizedCurrentId : ""}
        onChange={(event) => {
          const nextClientId = event.target.value;
          if (!nextClientId || nextClientId === normalizedCurrentId) return;
          router.push(`/app/clients/${nextClientId}/edit`);
        }}
        style={{
          minWidth: 200,
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#18181b",
          fontSize: 13,
          outline: "none",
        }}
      >
        {!hasCurrentInOptions ? (
          <option value="">Select active client</option>
        ) : null}
        {clients.map((client) => (
          <option key={client.id} value={String(client.id)}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}

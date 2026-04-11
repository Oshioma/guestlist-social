"use client";

import { useTransition } from "react";
import { updateContentProgressAction } from "../lib/content-actions";
import type { ContentStatus, ContentProgress } from "../lib/types";

type Client = { id: string; name: string };

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "proof", label: "Proof" },
  { value: "complete", label: "Complete" },
];

function statusStyle(status: ContentStatus): { bg: string; text: string } {
  const map: Record<ContentStatus, { bg: string; text: string }> = {
    not_started: { bg: "#f3f4f6", text: "#374151" },
    in_progress: { bg: "#fef9c3", text: "#854d0e" },
    proof: { bg: "#dbeafe", text: "#1e40af" },
    complete: { bg: "#dcfce7", text: "#166534" },
  };
  return map[status];
}

function StatusDropdown({
  clientId,
  month,
  current,
}: {
  clientId: string;
  month: string;
  current: ContentStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ContentStatus;
    startTransition(async () => {
      await updateContentProgressAction(clientId, month, newStatus);
    });
  }

  const colors = statusStyle(current);

  return (
    <select
      value={current}
      onChange={handleChange}
      disabled={isPending}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        width: "100%",
        padding: "8px 28px 8px 10px",
        fontSize: 13,
        fontWeight: 500,
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        cursor: isPending ? "wait" : "pointer",
        opacity: isPending ? 0.6 : 1,
        backgroundColor: colors.bg,
        color: colors.text,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        outline: "none",
        transition: "all 0.15s ease",
      }}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

const extraColumns = [
  { key: "video", label: "Video" },
  { key: "images", label: "Images" },
];

export default function ContentGrid({
  clients,
  progress,
  months,
}: {
  clients: Client[];
  progress: ContentProgress[];
  months: { key: string; label: string }[];
}) {
  function getStatus(clientId: string, key: string): ContentStatus {
    const entry = progress.find(
      (p) => p.clientId === clientId && p.month === key
    );
    return entry?.status ?? "not_started";
  }

  if (clients.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 20px",
          color: "#71717a",
          fontSize: 14,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "#18181b", marginBottom: 6 }}>
          No clients yet
        </div>
        Add your first client to start tracking content progress.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontSize: 14,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "12px 16px",
                fontWeight: 600,
                fontSize: 13,
                color: "#71717a",
                borderBottom: "2px solid #e4e4e7",
                whiteSpace: "nowrap",
              }}
            >
              Client
            </th>
            {months.map((m) => (
              <th
                key={m.key}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#71717a",
                  borderBottom: "2px solid #e4e4e7",
                  whiteSpace: "nowrap",
                  minWidth: 160,
                }}
              >
                {m.label}
              </th>
            ))}
            {extraColumns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#71717a",
                  borderBottom: "2px solid #e4e4e7",
                  whiteSpace: "nowrap",
                  minWidth: 160,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map((client, idx) => (
            <tr
              key={client.id}
              style={{
                background: idx % 2 === 0 ? "#fff" : "#fafafa",
              }}
            >
              <td
                style={{
                  padding: "14px 16px",
                  fontWeight: 500,
                  color: "#18181b",
                  borderBottom: "1px solid #f4f4f5",
                  whiteSpace: "nowrap",
                }}
              >
                {client.name}
              </td>
              {months.map((m) => (
                <td
                  key={m.key}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid #f4f4f5",
                  }}
                >
                  <StatusDropdown
                    clientId={client.id}
                    month={m.key}
                    current={getStatus(client.id, m.key)}
                  />
                </td>
              ))}
              {extraColumns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid #f4f4f5",
                  }}
                >
                  <StatusDropdown
                    clientId={client.id}
                    month={col.key}
                    current={getStatus(client.id, col.key)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

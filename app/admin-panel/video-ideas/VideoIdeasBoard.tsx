"use client";

import { useState, useTransition } from "react";
import {
  addVideoIdeaAction,
  updateVideoIdeaAction,
  deleteVideoIdeaAction,
} from "../lib/video-idea-actions";
import type { VideoIdea } from "../lib/types";

type Client = { id: string; name: string };

export default function VideoIdeasBoard({
  clients,
  ideas,
  months,
}: {
  clients: Client[];
  ideas: VideoIdea[];
  months: { key: string; label: string }[];
}) {
  const [selectedClient, setSelectedClient] = useState(clients[0]?.id ?? "");
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.key ?? "");

  const filteredIdeas = ideas.filter(
    (i) => i.clientId === selectedClient && i.month === selectedMonth
  );

  // Build summary: client -> month -> count
  const summaryMap = new Map<string, Map<string, number>>();
  for (const idea of ideas) {
    if (!months.some((m) => m.key === idea.month)) continue;
    if (!summaryMap.has(idea.clientId)) summaryMap.set(idea.clientId, new Map());
    const monthMap = summaryMap.get(idea.clientId)!;
    monthMap.set(idea.month, (monthMap.get(idea.month) ?? 0) + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary grid */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>
          Ideas at a Glance
        </h2>
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
                    padding: "10px 14px",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#71717a",
                    borderBottom: "2px solid #e4e4e7",
                  }}
                >
                  Client
                </th>
                {months.map((m) => (
                  <th
                    key={m.key}
                    style={{
                      textAlign: "center",
                      padding: "10px 14px",
                      fontWeight: 600,
                      fontSize: 13,
                      color: "#71717a",
                      borderBottom: "2px solid #e4e4e7",
                    }}
                  >
                    {m.label}
                  </th>
                ))}
                <th
                  style={{
                    textAlign: "center",
                    padding: "10px 14px",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#71717a",
                    borderBottom: "2px solid #e4e4e7",
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, idx) => {
                const monthMap = summaryMap.get(client.id);
                const total = months.reduce(
                  (sum, m) => sum + (monthMap?.get(m.key) ?? 0),
                  0
                );
                return (
                  <tr
                    key={client.id}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#fafafa",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedClient(client.id)}
                  >
                    <td
                      style={{
                        padding: "12px 14px",
                        fontWeight: 500,
                        color:
                          selectedClient === client.id ? "#18181b" : "#52525b",
                        borderBottom: "1px solid #f4f4f5",
                        borderLeft:
                          selectedClient === client.id
                            ? "3px solid #18181b"
                            : "3px solid transparent",
                      }}
                    >
                      {client.name}
                    </td>
                    {months.map((m) => {
                      const count = monthMap?.get(m.key) ?? 0;
                      return (
                        <td
                          key={m.key}
                          style={{
                            textAlign: "center",
                            padding: "12px 14px",
                            borderBottom: "1px solid #f4f4f5",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClient(client.id);
                            setSelectedMonth(m.key);
                          }}
                        >
                          {count > 0 ? (
                            <span
                              style={{
                                display: "inline-block",
                                minWidth: 28,
                                padding: "3px 8px",
                                borderRadius: 999,
                                fontSize: 13,
                                fontWeight: 600,
                                background: "#dcfce7",
                                color: "#166534",
                              }}
                            >
                              {count}
                            </span>
                          ) : (
                            <span style={{ color: "#d4d4d8", fontSize: 13 }}>
                              0
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        textAlign: "center",
                        padding: "12px 14px",
                        fontWeight: 600,
                        borderBottom: "1px solid #f4f4f5",
                        color: total > 0 ? "#18181b" : "#d4d4d8",
                      }}
                    >
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Idea management area */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
            Manage Ideas
          </h2>
          <div style={{ display: "flex", gap: 10 }}>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={selectStyle}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={selectStyle}
            >
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <AddIdeaForm clientId={selectedClient} month={selectedMonth} />

        {filteredIdeas.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 20px",
              color: "#a1a1aa",
              fontSize: 14,
            }}
          >
            No ideas yet for this client and month. Add one above.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 16,
            }}
          >
            {filteredIdeas.map((idea) => (
              <IdeaRow key={idea.id} idea={idea} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddIdeaForm({
  clientId,
  month,
}: {
  clientId: string;
  month: string;
}) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      await addVideoIdeaAction(clientId, month, text);
      setText("");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: 10, alignItems: "center" }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a new video idea..."
        style={{
          flex: 1,
          padding: "10px 12px",
          fontSize: 14,
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          background: "#fff",
          color: "#18181b",
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={isPending || !text.trim()}
        style={{
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 600,
          border: "none",
          borderRadius: 8,
          background: "#18181b",
          color: "#fff",
          cursor: isPending ? "wait" : "pointer",
          opacity: isPending || !text.trim() ? 0.5 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {isPending ? "Adding..." : "Add Idea"}
      </button>
    </form>
  );
}

function IdeaRow({ idea }: { idea: VideoIdea }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(idea.idea);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!editText.trim()) return;
    startTransition(async () => {
      await updateVideoIdeaAction(idea.id, editText);
      setIsEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteVideoIdeaAction(idea.id);
    });
  }

  if (isEditing) {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 14px",
          background: "#fafafa",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
        }}
      >
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setEditText(idea.idea);
              setIsEditing(false);
            }
          }}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid #e4e4e7",
            borderRadius: 6,
            outline: "none",
          }}
        />
        <button
          onClick={handleSave}
          disabled={isPending || !editText.trim()}
          style={actionBtnStyle("#dcfce7", "#166534")}
        >
          {isPending ? "..." : "Save"}
        </button>
        <button
          onClick={() => {
            setEditText(idea.idea);
            setIsEditing(false);
          }}
          style={actionBtnStyle("#f3f4f6", "#374151")}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "12px 14px",
        background: "#fafafa",
        borderRadius: 8,
        border: "1px solid #f4f4f5",
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 14,
          color: "#18181b",
        }}
      >
        {idea.idea}
      </span>
      <button
        onClick={() => setIsEditing(true)}
        style={actionBtnStyle("#dbeafe", "#1e40af")}
      >
        Edit
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        style={actionBtnStyle("#fee2e2", "#991b1b")}
      >
        {isPending ? "..." : "Delete"}
      </button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  padding: "8px 30px 8px 12px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fff",
  color: "#18181b",
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  outline: "none",
};

function actionBtnStyle(
  bg: string,
  color: string
): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    background: bg,
    color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

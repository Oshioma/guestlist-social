"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Action, ActionStatus } from "../lib/types";
import { formatDate } from "../lib/utils";
import { createClient } from "../../../lib/supabase/client";

const statusOrder: Record<ActionStatus, number> = {
  open: 0,
  in_progress: 1,
  completed: 2,
};

export default function ActionList({
  actions: initial,
}: {
  actions: Action[];
}) {
  const router = useRouter();

  const [statuses, setStatuses] = useState<Map<string, ActionStatus>>(
    () => new Map(initial.map((a) => [a.id, a.status]))
  );
  const [workNotes, setWorkNotes] = useState<Map<string, string>>(
    () => new Map(initial.map((a) => [a.id, a.workNote]))
  );
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<ActionStatus>("open");
  const [editNote, setEditNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function saveAction(id: string, newStatus: ActionStatus, note: string) {
    if (savingIds.has(id)) return;

    const prevStatus = statuses.get(id) ?? "open";
    const prevNote = workNotes.get(id) ?? "";
    setError(null);

    setStatuses((prev) => new Map(prev).set(id, newStatus));
    setWorkNotes((prev) => new Map(prev).set(id, note));
    setSavingIds((prev) => new Set(prev).add(id));

    const supabase = createClient();
    const isComplete = newStatus === "completed";

    const { error: updateError } = await supabase
      .from("actions")
      .update({ status: newStatus, is_complete: isComplete, work_note: note })
      .eq("id", id);

    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (updateError) {
      setStatuses((prev) => new Map(prev).set(id, prevStatus));
      setWorkNotes((prev) => new Map(prev).set(id, prevNote));
      console.error("Failed to update action:", updateError);
      setError("Could not save action. Please try again.");
      return;
    }

    setEditingId(null);
    router.refresh();
  }

  function openEditor(a: Action) {
    const currentStatus = statuses.get(a.id) ?? a.status;
    const currentNote = workNotes.get(a.id) ?? a.workNote;
    setEditingId(a.id);
    setEditStatus(currentStatus);
    setEditNote(currentNote);
  }

  function quickStart(id: string) {
    saveAction(id, "in_progress", workNotes.get(id) ?? "");
  }

  const sorted = useMemo(() => {
    return [...initial].sort((a, b) => {
      const aOrder = statusOrder[statuses.get(a.id) ?? a.status] ?? 0;
      const bOrder = statusOrder[statuses.get(b.id) ?? b.status] ?? 0;
      return aOrder - bOrder;
    });
  }, [initial, statuses]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {error && (
        <div
          style={{
            fontSize: 13,
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      )}

      {sorted.map((a) => {
        const status = statuses.get(a.id) ?? a.status;
        const note = workNotes.get(a.id) ?? a.workNote;
        const saving = savingIds.has(a.id);
        const isDone = status === "completed";
        const isEditing = editingId === a.id;

        return (
          <div
            key={a.id}
            style={{
              padding: "10px 12px",
              border: "1px solid #f4f4f5",
              borderRadius: 10,
              background: isDone ? "#fafafa" : "#fff",
              opacity: isDone ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Status indicator dot */}
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background:
                    status === "open"
                      ? "#ef4444"
                      : status === "in_progress"
                      ? "#eab308"
                      : "#22c55e",
                }}
              />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    textDecoration: isDone ? "line-through" : "none",
                    color: "#18181b",
                  }}
                >
                  {a.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#a1a1aa",
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span>{a.clientName}</span>
                  <span>&middot;</span>
                  <span>{formatDate(a.due)}</span>
                  {saving && <span>&middot; Saving...</span>}
                </div>
                {note && !isEditing && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "#52525b",
                      fontStyle: "italic",
                    }}
                  >
                    {note}
                  </div>
                )}
              </div>

              {/* Status pill */}
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  ...statusPillStyle(status),
                }}
              >
                {statusLabel(status)}
              </span>

              {/* Action buttons */}
              {!isEditing && status === "open" && (
                <button
                  type="button"
                  onClick={() => quickStart(a.id)}
                  disabled={saving}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #e4e4e7",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#18181b",
                    cursor: saving ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  Start
                </button>
              )}

              {!isEditing && (
                <button
                  type="button"
                  onClick={() => openEditor(a)}
                  disabled={saving}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #e4e4e7",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#71717a",
                    cursor: saving ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  Update
                </button>
              )}
            </div>

            {/* Inline editor */}
            {isEditing && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  border: "1px solid #e4e4e7",
                  borderRadius: 10,
                  background: "#fafafa",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <label
                    style={{ fontSize: 12, fontWeight: 600, color: "#18181b", minWidth: 50 }}
                  >
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ActionStatus)}
                    style={{
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: "1px solid #d4d4d8",
                      fontSize: 13,
                      background: "#fff",
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label
                    style={{ fontSize: 12, fontWeight: 600, color: "#18181b" }}
                  >
                    Note
                  </label>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="e.g. Improved the image and testing a new version"
                    rows={2}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #d4d4d8",
                      fontSize: 13,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      border: "1px solid #e4e4e7",
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#71717a",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveAction(a.id, editStatus, editNote)}
                    disabled={saving}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      border: "none",
                      background: "#18181b",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#fff",
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(status: ActionStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
  }
}

function statusPillStyle(status: ActionStatus): React.CSSProperties {
  switch (status) {
    case "open":
      return { background: "#fef2f2", color: "#b91c1c" };
    case "in_progress":
      return { background: "#fef3c7", color: "#92400e" };
    case "completed":
      return { background: "#dcfce7", color: "#166534" };
  }
}

"use client";

import { useState, useTransition } from "react";
import {
  createContentPillarAction,
  updateContentPillarAction,
  archiveContentPillarAction,
} from "../lib/proofer-actions";
import type { ContentPillar } from "../lib/types";

const PRESET_COLORS = [
  "#6366f1",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#ec4899",
  "#8b5cf6",
  "#18181b",
];

export default function PillarManager({
  clientId,
  pillars,
}: {
  clientId: string;
  pillars: ContentPillar[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    color: "#6366f1",
    description: "",
  });

  function handleCreate() {
    const cleanName = name.trim();
    if (!cleanName) return;
    startTransition(async () => {
      try {
        await createContentPillarAction(
          clientId,
          cleanName,
          color,
          description
        );
        setName("");
        setDescription("");
        setColor("#6366f1");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not create pillar");
      }
    });
  }

  function handleSaveEdit(pillarId: string) {
    const cleanName = editDraft.name.trim();
    if (!cleanName) return;
    startTransition(async () => {
      try {
        await updateContentPillarAction(
          pillarId,
          cleanName,
          editDraft.color,
          editDraft.description
        );
        setEditingId(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update pillar");
      }
    });
  }

  function handleArchive(pillarId: string) {
    if (!confirm("Archive this pillar? Ideas tagged with it become untagged."))
      return;
    startTransition(async () => {
      try {
        await archiveContentPillarAction(pillarId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not archive pillar");
      }
    });
  }

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "#18181b",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Content Pillars</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#71717a",
              padding: "2px 8px",
              borderRadius: 999,
              background: "#f4f4f5",
            }}
          >
            {pillars.length}
          </span>
        </span>
        <span style={{ color: "#a1a1aa", fontSize: 11 }}>
          {open ? "Hide" : "Manage"}
        </span>
      </button>
      {open && (
        <div style={{ padding: "4px 14px 14px", borderTop: "1px solid #f4f4f5" }}>
          {pillars.length === 0 ? (
            <div
              style={{
                padding: "10px 0",
                fontSize: 12,
                color: "#a1a1aa",
              }}
            >
              No pillars yet for this client. Add one below.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 10,
              }}
            >
              {pillars.map((pillar) => {
                const isEditing = editingId === pillar.id;
                if (isEditing) {
                  return (
                    <div
                      key={pillar.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: 10,
                        border: "1px solid #e4e4e7",
                        borderRadius: 8,
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{ display: "flex", gap: 6, alignItems: "center" }}
                      >
                        <input
                          type="color"
                          value={editDraft.color}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, color: e.target.value })
                          }
                          style={{
                            width: 28,
                            height: 28,
                            border: "1px solid #e4e4e7",
                            borderRadius: 6,
                            background: "transparent",
                            cursor: "pointer",
                          }}
                        />
                        <input
                          value={editDraft.name}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, name: e.target.value })
                          }
                          placeholder="Pillar name"
                          style={{
                            flex: 1,
                            padding: "6px 10px",
                            fontSize: 13,
                            border: "1px solid #e4e4e7",
                            borderRadius: 6,
                            background: "#fff",
                            color: "#18181b",
                            outline: "none",
                          }}
                        />
                      </div>
                      <input
                        value={editDraft.description}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            description: e.target.value,
                          })
                        }
                        placeholder="Description (optional)"
                        style={{
                          padding: "6px 10px",
                          fontSize: 12,
                          border: "1px solid #e4e4e7",
                          borderRadius: 6,
                          background: "#fff",
                          color: "#18181b",
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(pillar.id)}
                          disabled={isPending || !editDraft.name.trim()}
                          style={{
                            padding: "5px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            border: "none",
                            borderRadius: 6,
                            background: "#dcfce7",
                            color: "#166534",
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: "5px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            border: "none",
                            borderRadius: 6,
                            background: "#f3f4f6",
                            color: "#374151",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={pillar.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      border: "1px solid #f4f4f5",
                      borderRadius: 8,
                      background: "#fff",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: pillar.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#18181b",
                        }}
                      >
                        {pillar.name}
                      </div>
                      {pillar.description && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#71717a",
                            marginTop: 2,
                          }}
                        >
                          {pillar.description}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(pillar.id);
                        setEditDraft({
                          name: pillar.name,
                          color: pillar.color,
                          description: pillar.description,
                        });
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        border: "none",
                        borderRadius: 6,
                        background: "#dbeafe",
                        color: "#1e40af",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleArchive(pillar.id)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        border: "none",
                        borderRadius: 6,
                        background: "#fee2e2",
                        color: "#991b1b",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              padding: 10,
              border: "1px dashed #e4e4e7",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{ fontSize: 12, fontWeight: 600, color: "#52525b" }}
            >
              Add pillar
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: 28,
                  height: 28,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  background: "transparent",
                  cursor: "pointer",
                }}
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pillar name (e.g. Education)"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 13,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#18181b",
                  outline: "none",
                }}
              />
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              style={{
                padding: "6px 10px",
                fontSize: 12,
                border: "1px solid #e4e4e7",
                borderRadius: 6,
                background: "#fff",
                color: "#18181b",
                outline: "none",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                marginTop: 2,
              }}
            >
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Pick color ${c}`}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: c,
                    border:
                      color === c
                        ? "2px solid #18181b"
                        : "1px solid #e4e4e7",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !name.trim()}
              style={{
                marginTop: 2,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                borderRadius: 6,
                background: "#18181b",
                color: "#fff",
                cursor: "pointer",
                opacity: isPending || !name.trim() ? 0.5 : 1,
                alignSelf: "flex-start",
              }}
            >
              {isPending ? "Adding..." : "Add Pillar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

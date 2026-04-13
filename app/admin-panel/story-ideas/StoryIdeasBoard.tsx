"use client";

import { useState, useTransition } from "react";
import {
  addStoryThemeAction,
  updateStoryThemeAction,
  deleteStoryThemeAction,
  addStoryIdeaAction,
  updateStoryIdeaAction,
  updateStoryDesignLinkAction,
  deleteStoryIdeaAction,
} from "../lib/story-idea-actions";
import type { StoryIdea, StoryTheme, ContentPillar } from "../lib/types";
import ImageUpload from "../components/ImageUpload";
import PillarManager from "../components/PillarManager";

type Client = { id: string; name: string };

function getNextFiveMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
}

const MONTHS = getNextFiveMonths();

const CATEGORIES = [
  { value: "reel", label: "Reel" },
  { value: "carousel", label: "Carousel" },
  { value: "story", label: "Story" },
  { value: "post", label: "Post" },
  { value: "general", label: "General" },
];

function categoryColor(cat: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    reel: { bg: "#ede9fe", text: "#5b21b6" },
    carousel: { bg: "#dbeafe", text: "#1e40af" },
    story: { bg: "#fef9c3", text: "#854d0e" },
    post: { bg: "#dcfce7", text: "#166534" },
    general: { bg: "#f3f4f6", text: "#374151" },
  };
  return map[cat] ?? map.general;
}

export default function StoryIdeasBoard({
  clients,
  themes,
  ideas,
  pillars,
}: {
  clients: Client[];
  themes: StoryTheme[];
  ideas: StoryIdea[];
  pillars: ContentPillar[];
}) {
  const [selectedClient, setSelectedClient] = useState(clients[0]?.id ?? "");
  const [selectedMonth, setSelectedMonth] = useState("");

  const clientPillars = pillars.filter((p) => p.clientId === selectedClient);
  const pillarsById = new Map(pillars.map((p) => [p.id, p]));

  const selectedMonthName = MONTHS.find((m) => m.value === selectedMonth)?.label.split(" ")[0] ?? "";

  const clientThemes = themes
    .filter((t) => t.clientId === selectedClient)
    .filter((t) => !selectedMonth || t.monthLabel === selectedMonthName)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const allClientIdeas = ideas.filter((i) => i.clientId === selectedClient);
  const clientIdeas = selectedMonth
    ? allClientIdeas.filter((i) => i.month === selectedMonth)
    : allClientIdeas;
  const unlinkedIdeas = clientIdeas.filter(
    (i) => !i.themeId || !clientThemes.some((t) => t.id === i.themeId)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* At a glance */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>At a Glance</h2>
        {selectedMonth && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#71717a" }}>
              Filtered: <strong style={{ color: "#18181b" }}>{MONTHS.find((m) => m.value === selectedMonth)?.label}</strong>
            </span>
            <button
              onClick={() => setSelectedMonth("")}
              style={{ fontSize: 11, fontWeight: 600, border: "none", background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 6, cursor: "pointer" }}
            >
              Clear
            </button>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Client</th>
                {MONTHS.map((m) => (
                  <th
                    key={m.value}
                    onClick={() => setSelectedMonth(selectedMonth === m.value ? "" : m.value)}
                    style={{
                      ...thStyle,
                      textAlign: "center",
                      cursor: "pointer",
                      background: selectedMonth === m.value ? "#18181b" : "transparent",
                      color: selectedMonth === m.value ? "#fff" : "#71717a",
                      borderRadius: selectedMonth === m.value ? 6 : 0,
                    }}
                  >
                    {m.label.split(" ")[0]}
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: "center" }}>Themes</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, idx) => {
                const cThemes = themes.filter((t) => t.clientId === client.id).length;
                const cIdeas = ideas.filter((i) => i.clientId === client.id);
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
                        ...tdStyle,
                        fontWeight: 500,
                        borderLeft:
                          selectedClient === client.id
                            ? "3px solid #18181b"
                            : "3px solid transparent",
                      }}
                    >
                      {client.name}
                    </td>
                    {MONTHS.map((m) => {
                      const count = cIdeas.filter((i) => i.month === m.value).length;
                      return (
                        <td key={m.value} style={{ ...tdStyle, textAlign: "center" }}>
                          <CountBadge count={count} />
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <CountBadge count={cThemes} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: cIdeas.length > 0 ? "#18181b" : "#d4d4d8" }}>
                      {cIdeas.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client strategy editor */}
      <div style={cardStyle}>
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
          <h2 style={sectionTitleStyle}>
            Story Strategy
          </h2>
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
        </div>

        <PillarManager clientId={selectedClient} pillars={clientPillars} />

        <div style={{ marginTop: 16 }}>
          <AddThemeForm
            clientId={selectedClient}
            nextSort={clientThemes.length}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 8 }}>
            Quick Add Idea
          </div>
          <AddIdeaForm
            clientId={selectedClient}
            themeId={null}
            pillars={clientPillars}
          />
        </div>

        {clientThemes.length === 0 && unlinkedIdeas.length === 0 ? (
          <div style={emptyStyle}>
            No story strategy yet for this client. Add a theme or idea above to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
            {clientThemes.map((theme) => {
              const themeIdeas = clientIdeas.filter(
                (i) => i.themeId === theme.id
              );
              return (
                <ThemeBlock
                  key={theme.id}
                  theme={theme}
                  ideas={themeIdeas}
                  clientId={selectedClient}
                  pillars={clientPillars}
                  pillarsById={pillarsById}
                />
              );
            })}

            {unlinkedIdeas.length > 0 && (
              <div style={themeBlockStyle}>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#71717a" }}>
                    Unlinked Ideas
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {unlinkedIdeas.map((idea) => (
                    <IdeaRow
                      key={idea.id}
                      idea={idea}
                      pillars={clientPillars}
                      pillarsById={pillarsById}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Theme block ──

function ThemeBlock({
  theme,
  ideas,
  clientId,
  pillars,
  pillarsById,
}: {
  theme: StoryTheme;
  ideas: StoryIdea[];
  clientId: string;
  pillars: ContentPillar[];
  pillarsById: Map<string, ContentPillar>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [monthLabel, setMonthLabel] = useState(theme.monthLabel);
  const [themeName, setThemeName] = useState(theme.theme);
  const [goal, setGoal] = useState(theme.goal);
  const [notes, setNotes] = useState(theme.notes);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateStoryThemeAction(theme.id, monthLabel, themeName, goal, notes);
      setIsEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm("Delete this theme and all its ideas?")) return;
    startTransition(async () => {
      await deleteStoryThemeAction(theme.id);
    });
  }

  return (
    <div style={themeBlockStyle}>
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={monthLabel}
              onChange={(e) => setMonthLabel(e.target.value)}
              style={{ ...selectStyle, flex: "0 0 160px" }}
            >
              <option value="">No month</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.label.split(" ")[0]}>{m.label.split(" ")[0]}</option>
              ))}
            </select>
            <input
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              placeholder="Theme name"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Goal"
            style={inputStyle}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (e.g. posting schedule, guidelines, extra context...)"
            rows={4}
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={isPending} style={btnStyle("#dcfce7", "#166534")}>
              {isPending ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setMonthLabel(theme.monthLabel);
                setThemeName(theme.theme);
                setGoal(theme.goal);
                setNotes(theme.notes);
                setIsEditing(false);
              }}
              style={btnStyle("#f3f4f6", "#374151")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {theme.monthLabel && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: "#18181b",
                      color: "#fff",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {theme.monthLabel}
                  </span>
                )}
                <span style={{ fontSize: 16, fontWeight: 700, color: "#18181b" }}>
                  {theme.theme}
                </span>
              </div>
              {theme.goal && (
                <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
                  Goal: {theme.goal}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => setIsEditing(true)} style={btnStyle("#dbeafe", "#1e40af")}>
                Edit
              </button>
              <button onClick={handleDelete} disabled={isPending} style={btnStyle("#fee2e2", "#991b1b")}>
                {isPending ? "..." : "Delete"}
              </button>
            </div>
          </div>
          {theme.notes && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                background: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                fontSize: 13,
                color: "#52525b",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {theme.notes}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ideas.map((idea) => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            pillars={pillars}
            pillarsById={pillarsById}
          />
        ))}
      </div>

      <AddIdeaForm clientId={clientId} themeId={theme.id} pillars={pillars} />
    </div>
  );
}

// ── Add theme form ──

function AddThemeForm({
  clientId,
  nextSort,
}: {
  clientId: string;
  nextSort: number;
}) {
  const [open, setOpen] = useState(false);
  const [monthLabel, setMonthLabel] = useState("");
  const [theme, setTheme] = useState("");
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim()) return;
    startTransition(async () => {
      await addStoryThemeAction(clientId, monthLabel, theme, goal, nextSort, notes);
      setMonthLabel("");
      setTheme("");
      setGoal("");
      setNotes("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 500,
          border: "2px dashed #e4e4e7",
          borderRadius: 10,
          background: "transparent",
          color: "#71717a",
          cursor: "pointer",
        }}
      >
        + Add Theme Block
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        background: "#fafafa",
        borderRadius: 10,
        border: "1px solid #e4e4e7",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 4 }}>
        New Theme Block
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={monthLabel}
          onChange={(e) => setMonthLabel(e.target.value)}
          style={{ ...selectStyle, flex: "0 0 160px" }}
        >
          <option value="">No month</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.label.split(" ")[0]}>{m.label.split(" ")[0]}</option>
          ))}
        </select>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Theme name (e.g. DESIRE & DISCOVERY)"
          required
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      <input
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Goal (e.g. Make people fall in love)"
        style={inputStyle}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (e.g. posting schedule, guidelines, extra context...)"
        rows={3}
        style={{
          ...inputStyle,
          resize: "vertical",
          fontFamily: "inherit",
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={isPending || !theme.trim()}
          style={{
            ...btnStyle("#18181b", "#fff"),
            opacity: isPending || !theme.trim() ? 0.5 : 1,
          }}
        >
          {isPending ? "Adding..." : "Add Theme"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={btnStyle("#f3f4f6", "#374151")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Idea row ──

function IdeaRow({
  idea,
  pillars,
  pillarsById,
}: {
  idea: StoryIdea;
  pillars: ContentPillar[];
  pillarsById: Map<string, ContentPillar>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkValue, setLinkValue] = useState(idea.designLink);
  const [editTitle, setEditTitle] = useState(idea.title);
  const [editText, setEditText] = useState(idea.idea);
  const [editNotes, setEditNotes] = useState(idea.notes);
  const [editCategory, setEditCategory] = useState(idea.category);
  const [editMonth, setEditMonth] = useState(idea.month);
  const [editPillarId, setEditPillarId] = useState<string | null>(
    idea.pillarId
  );
  const [isPending, startTransition] = useTransition();

  const colors = categoryColor(idea.category);
  const monthLabel = MONTHS.find((m) => m.value === idea.month)?.label ?? idea.month;
  const pillar = idea.pillarId ? pillarsById.get(idea.pillarId) ?? null : null;
  const isUsed = Boolean(idea.usedInPostId);

  function handleSaveLink() {
    startTransition(async () => {
      await updateStoryDesignLinkAction(idea.id, linkValue);
      setEditingLink(false);
    });
  }

  function handleSave() {
    if (!editText.trim()) return;
    startTransition(async () => {
      await updateStoryIdeaAction(
        idea.id,
        editText,
        editCategory,
        editMonth,
        editPillarId,
        editTitle,
        editNotes
      );
      setIsEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteStoryIdeaAction(idea.id);
    });
  }

  if (isEditing) {
    const reset = () => {
      setEditTitle(idea.title);
      setEditText(idea.idea);
      setEditNotes(idea.notes);
      setEditCategory(idea.category);
      setEditMonth(idea.month);
      setEditPillarId(idea.pillarId);
      setIsEditing(false);
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "#fff", borderRadius: 8, border: "1px solid #e4e4e7" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            style={{ ...selectStyle, padding: "6px 24px 6px 8px", fontSize: 12 }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={editMonth}
            onChange={(e) => setEditMonth(e.target.value)}
            style={{ ...selectStyle, padding: "6px 24px 6px 8px", fontSize: 12 }}
          >
            <option value="">No month</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={editPillarId ?? ""}
            onChange={(e) => setEditPillarId(e.target.value || null)}
            style={{ ...selectStyle, padding: "6px 24px 6px 8px", fontSize: 12 }}
          >
            <option value="">No pillar</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title (optional)"
            style={{ ...inputStyle, flex: 1, padding: "6px 10px", fontWeight: 600 }}
          />
        </div>
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          placeholder="Idea"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") reset();
          }}
          style={{ ...inputStyle, padding: "6px 10px" }}
        />
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          style={{ ...inputStyle, padding: "6px 10px", resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} disabled={isPending} style={btnStyle("#dcfce7", "#166534")}>
            {isPending ? "..." : "Save"}
          </button>
          <button onClick={reset} style={btnStyle("#f3f4f6", "#374151")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 6,
        background: isUsed ? "#f4f4f5" : "#fff",
        border: "1px solid #f4f4f5",
        opacity: isUsed ? 0.6 : 1,
      }}
      title={isUsed ? "Used in a proofer post" : undefined}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 999,
          background: colors.bg,
          color: colors.text,
          whiteSpace: "nowrap",
        }}
      >
        {idea.category}
      </span>
      {pillar && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#f4f4f5",
            color: "#3f3f46",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: pillar.color,
            }}
          />
          {pillar.name}
        </span>
      )}
      {isUsed && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#e4e4e7",
            color: "#52525b",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Used
        </span>
      )}
      {monthLabel && (
        <span style={{ fontSize: 11, color: "#71717a", whiteSpace: "nowrap" }}>
          {monthLabel}
        </span>
      )}
      <span
        style={{
          flex: 1,
          fontSize: 14,
          color: "#18181b",
          display: "inline-flex",
          flexDirection: "column",
          gap: 2,
          textDecoration: isUsed ? "line-through" : "none",
          minWidth: 0,
        }}
      >
        {idea.title && (
          <span style={{ fontWeight: 700, fontSize: 13 }}>{idea.title}</span>
        )}
        <span>{idea.idea}</span>
        {idea.notes && (
          <span style={{ fontSize: 12, color: "#71717a", whiteSpace: "pre-wrap" }}>
            {idea.notes}
          </span>
        )}
      </span>
      {idea.createdBy && (
        <span style={{ fontSize: 11, color: "#a1a1aa", whiteSpace: "nowrap" }}>
          {idea.createdBy.split("@")[0]}
        </span>
      )}
      {editingLink ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="Paste Google Drive link..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveLink();
              if (e.key === "Escape") { setLinkValue(idea.designLink); setEditingLink(false); }
            }}
            style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: 220 }}
          />
          <button onClick={handleSaveLink} disabled={isPending} style={btnStyle("#dcfce7", "#166534")}>
            {isPending ? "..." : "Save"}
          </button>
          <button onClick={() => { setLinkValue(idea.designLink); setEditingLink(false); }} style={btnStyle("#f3f4f6", "#374151")}>
            Cancel
          </button>
        </div>
      ) : idea.designLink ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <a
            href={idea.designLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: "#1e40af", textDecoration: "underline", whiteSpace: "nowrap" }}
          >
            Design
          </a>
          <button onClick={() => setEditingLink(true)} style={{ ...btnStyle("#f3f4f6", "#374151"), padding: "2px 6px", fontSize: 10 }}>
            edit
          </button>
        </div>
      ) : (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => setEditingLink(true)} style={btnStyle("#f3f4f6", "#71717a")}>
            + Link
          </button>
          <ImageUpload
            folder={`story/${idea.id}`}
            compact
            accept="image/*,video/*"
            label="Upload"
            onUploaded={(url) => {
              setLinkValue(url);
              startTransition(async () => {
                await updateStoryDesignLinkAction(idea.id, url);
              });
            }}
          />
        </span>
      )}
      <button onClick={() => setIsEditing(true)} style={btnStyle("#dbeafe", "#1e40af")}>Edit</button>
      <button onClick={handleDelete} disabled={isPending} style={btnStyle("#fee2e2", "#991b1b")}>
        {isPending ? "..." : "Delete"}
      </button>
    </div>
  );
}

// ── Add idea form ──

function AddIdeaForm({
  clientId,
  themeId,
  pillars,
}: {
  clientId: string;
  themeId: string | null;
  pillars: ContentPillar[];
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("story");
  const [month, setMonth] = useState(MONTHS[0]?.value ?? "");
  const [pillarId, setPillarId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      await addStoryIdeaAction(
        clientId,
        themeId,
        text,
        category,
        month,
        pillarId,
        title,
        notes
      );
      setTitle("");
      setText("");
      setNotes("");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ ...selectStyle, padding: "8px 28px 8px 10px", fontSize: 13 }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ ...selectStyle, padding: "8px 28px 8px 10px", fontSize: 13 }}
        >
          <option value="">No month</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={pillarId ?? ""}
          onChange={(e) => setPillarId(e.target.value || null)}
          style={{ ...selectStyle, padding: "8px 28px 8px 10px", fontSize: 13 }}
        >
          <option value="">No pillar</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Idea..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="submit"
          disabled={isPending || !text.trim()}
          style={{
            ...btnStyle("#18181b", "#fff"),
            padding: "8px 16px",
            opacity: isPending || !text.trim() ? 0.5 : 1,
          }}
        >
          {isPending ? "..." : "Add"}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
      />
    </form>
  );
}

// ── Small helpers ──

function CountBadge({ count }: { count: number }) {
  return count > 0 ? (
    <span
      style={{
        display: "inline-block",
        minWidth: 26,
        padding: "2px 8px",
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
    <span style={{ color: "#d4d4d8", fontSize: 13 }}>0</span>
  );
}

// ── Shared styles ──

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  margin: "0 0 16px",
};

const themeBlockStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: "1px solid #e4e4e7",
  background: "#fafafa",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontWeight: 600,
  fontSize: 13,
  color: "#71717a",
  borderBottom: "2px solid #e4e4e7",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #f4f4f5",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fff",
  color: "#18181b",
  outline: "none",
};

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

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "32px 20px",
  color: "#a1a1aa",
  fontSize: 14,
  marginTop: 16,
};

function btnStyle(bg: string, color: string): React.CSSProperties {
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

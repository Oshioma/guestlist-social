"use client";

import { useState, useTransition } from "react";
import {
  addCarouselThemeAction,
  updateCarouselThemeAction,
  deleteCarouselThemeAction,
  addCarouselIdeaAction,
  updateCarouselIdeaAction,
  deleteCarouselIdeaAction,
} from "../lib/carousel-idea-actions";
import type { CarouselIdea, CarouselTheme } from "../lib/types";

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

export default function CarouselIdeasBoard({
  clients,
  themes,
  ideas,
}: {
  clients: Client[];
  themes: CarouselTheme[];
  ideas: CarouselIdea[];
}) {
  const [selectedClient, setSelectedClient] = useState(clients[0]?.id ?? "");

  const clientThemes = themes
    .filter((t) => t.clientId === selectedClient)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const clientIdeas = ideas.filter((i) => i.clientId === selectedClient);
  const unlinkedIdeas = clientIdeas.filter(
    (i) => !i.themeId || !clientThemes.some((t) => t.id === i.themeId)
  );

  // Summary for "at a glance"
  const summaryMap = new Map<string, { themes: number; ideas: number }>();
  for (const client of clients) {
    const ct = themes.filter((t) => t.clientId === client.id).length;
    const ci = ideas.filter((i) => i.clientId === client.id).length;
    summaryMap.set(client.id, { themes: ct, ideas: ci });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* At a glance */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>At a Glance</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Client</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Themes</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Ideas</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, idx) => {
                const summary = summaryMap.get(client.id);
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
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <CountBadge count={summary?.themes ?? 0} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <CountBadge count={summary?.ideas ?? 0} />
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
            Carousel Strategy
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

        <AddThemeForm
          clientId={selectedClient}
          nextSort={clientThemes.length}
        />

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 8 }}>
            Quick Add Idea
          </div>
          <AddIdeaForm clientId={selectedClient} themeId={null} />
        </div>

        {clientThemes.length === 0 && unlinkedIdeas.length === 0 ? (
          <div style={emptyStyle}>
            No carousel strategy yet for this client. Add a theme or idea above to get started.
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
                    <IdeaRow key={idea.id} idea={idea} />
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
}: {
  theme: CarouselTheme;
  ideas: CarouselIdea[];
  clientId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [monthLabel, setMonthLabel] = useState(theme.monthLabel);
  const [themeName, setThemeName] = useState(theme.theme);
  const [goal, setGoal] = useState(theme.goal);
  const [notes, setNotes] = useState(theme.notes);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateCarouselThemeAction(theme.id, monthLabel, themeName, goal, notes);
      setIsEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm("Delete this theme and all its ideas?")) return;
    startTransition(async () => {
      await deleteCarouselThemeAction(theme.id);
    });
  }

  return (
    <div style={themeBlockStyle}>
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={monthLabel}
              onChange={(e) => setMonthLabel(e.target.value)}
              placeholder="e.g. Month 1-2"
              style={{ ...inputStyle, flex: "0 0 140px" }}
            />
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
          <IdeaRow key={idea.id} idea={idea} />
        ))}
      </div>

      <AddIdeaForm clientId={clientId} themeId={theme.id} />
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
      await addCarouselThemeAction(clientId, monthLabel, theme, goal, nextSort, notes);
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
        <input
          value={monthLabel}
          onChange={(e) => setMonthLabel(e.target.value)}
          placeholder="e.g. Month 1-2, Recurring, etc."
          style={{ ...inputStyle, flex: "0 0 200px" }}
        />
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

function IdeaRow({ idea }: { idea: CarouselIdea }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(idea.idea);
  const [editCategory, setEditCategory] = useState(idea.category);
  const [editMonth, setEditMonth] = useState(idea.month);
  const [isPending, startTransition] = useTransition();

  const colors = categoryColor(idea.category);
  const monthLabel = MONTHS.find((m) => m.value === idea.month)?.label ?? idea.month;

  function handleSave() {
    if (!editText.trim()) return;
    startTransition(async () => {
      await updateCarouselIdeaAction(idea.id, editText, editCategory, editMonth);
      setIsEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteCarouselIdeaAction(idea.id);
    });
  }

  if (isEditing) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e4e4e7", flexWrap: "wrap" }}>
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
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setEditText(idea.idea); setEditCategory(idea.category); setEditMonth(idea.month); setIsEditing(false); }
          }}
          style={{ ...inputStyle, flex: 1, padding: "6px 10px" }}
        />
        <button onClick={handleSave} disabled={isPending} style={btnStyle("#dcfce7", "#166534")}>
          {isPending ? "..." : "Save"}
        </button>
        <button onClick={() => { setEditText(idea.idea); setEditCategory(idea.category); setEditMonth(idea.month); setIsEditing(false); }} style={btnStyle("#f3f4f6", "#374151")}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 6, background: "#fff", border: "1px solid #f4f4f5" }}>
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
      {monthLabel && (
        <span style={{ fontSize: 11, color: "#71717a", whiteSpace: "nowrap" }}>
          {monthLabel}
        </span>
      )}
      <span style={{ flex: 1, fontSize: 14, color: "#18181b" }}>
        {idea.idea}
      </span>
      {idea.createdBy && (
        <span style={{ fontSize: 11, color: "#a1a1aa", whiteSpace: "nowrap" }}>
          {idea.createdBy.split("@")[0]}
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
}: {
  clientId: string;
  themeId: string | null;
}) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("carousel");
  const [month, setMonth] = useState(MONTHS[0]?.value ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      await addCarouselIdeaAction(clientId, themeId, text, category, month);
      setText("");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}
    >
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
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add an idea..."
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

// Isolated task module configuration — import only from this path

import type { TaskCategory, TaskStatus, TaskRecurrence } from "./types";

export const CATEGORIES: {
  value: TaskCategory;
  label: string;
  color: string;
}[] = [
  { value: "video", label: "Video", color: "#22c55e" },
  { value: "carousel", label: "Carousel", color: "#3b82f6" },
  { value: "story", label: "Story", color: "#eab308" },
  { value: "design", label: "Design", color: "#a855f7" },
  { value: "general", label: "General", color: "#71717a" },
];

export const STATUS_COLUMNS: {
  value: TaskStatus;
  label: string;
  pillBg: string;
  pillColor: string;
  pillBorder: string;
  headerBg: string;
}[] = [
  {
    value: "open",
    label: "Open",
    pillBg: "#f4f4f5",
    pillColor: "#52525b",
    pillBorder: "#e4e4e7",
    headerBg: "#f9fafb",
  },
  {
    value: "in_progress",
    label: "In Progress",
    pillBg: "#dbeafe",
    pillColor: "#1e40af",
    pillBorder: "#93c5fd",
    headerBg: "#eff6ff",
  },
  {
    value: "completed",
    label: "Completed",
    pillBg: "#dcfce7",
    pillColor: "#166534",
    pillBorder: "#86efac",
    headerBg: "#f0fdf4",
  },
];

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

export const RECURRENCE_OPTIONS: {
  value: TaskRecurrence;
  label: string;
}[] = [
  { value: "none", label: "One-off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const KEYBOARD_SHORTCUTS: { key: string; description: string }[] = [
  { key: "n", description: "Open new task form" },
  { key: "k", description: "Switch to Kanban view" },
  { key: "l", description: "Switch to List view" },
  { key: "Esc", description: "Close panel / dismiss modal" },
  { key: "?", description: "Show / hide keyboard shortcuts" },
  { key: "Del", description: "Delete selected tasks (bulk)" },
];

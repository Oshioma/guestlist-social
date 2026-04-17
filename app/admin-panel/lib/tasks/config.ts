// Host-app tasks config.
//
// Re-exports defaults from features/tasks/. Override here (e.g. rename
// CATEGORIES, add project-specific colors) rather than editing the feature
// module, so future ports stay clean.

export {
  STATUS_COLUMNS,
  STATUS_OPTIONS,
  RECURRENCE_OPTIONS,
  KEYBOARD_SHORTCUTS,
} from "@/features/tasks/config";

// Exposed under the existing name `CATEGORIES` for the current UI.
// Project-specific categories can be swapped here without touching
// features/tasks/.
export { DEFAULT_CATEGORIES as CATEGORIES } from "@/features/tasks/config";

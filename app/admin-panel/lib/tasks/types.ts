// Host-app re-export of the portable tasks types.
//
// The single source of truth lives in features/tasks/types.ts. This shim
// preserves the existing import path (../lib/tasks/types) used by the UI.
// To customize types per-project (e.g. narrow TaskCategory to a different
// enum), define replacements here instead of forking the feature module.

export * from "@/features/tasks/types";

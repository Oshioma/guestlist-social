"use client";

// Local, per-device draft storage so typed-but-unsaved form content survives a
// refresh, a crash into an error boundary, or a closed tab.
//
// Rules (apply to every form that uses this):
//   - Never store passwords, card numbers or other secrets here.
//   - Clear the draft when the form is submitted/saved.
//   - Every draft is removed on sign out (see clearAllDrafts / ClearDraftsOnSignOut).
//
// localStorage can be missing or throw (private mode, blocked site data, quota),
// so every access is wrapped and failures just mean "no draft".

export const DRAFT_PREFIX = "gl_draft:";

type Stored<T> = { savedAt: number; data: T };

export function readDraft<T>(key: string, maxAgeMs = 30 * 24 * 60 * 60 * 1000): T | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > maxAgeMs) {
      window.localStorage.removeItem(DRAFT_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T): void {
  try {
    const value: Stored<T> = { savedAt: Date.now(), data };
    window.localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore storage failures (private mode, quota, …)
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Remove every stored draft on this device — called on sign out. */
export function clearAllDrafts(): void {
  try {
    const ls = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => ls.removeItem(k));
  } catch {
    // ignore
  }
}

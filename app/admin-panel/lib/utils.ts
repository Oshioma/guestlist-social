import type { ClientStatus, AdStatus, CreativeStatus, Priority } from "./types";

export function formatCurrency(amount: number): string {
  return `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function statusColor(
  status: ClientStatus | AdStatus | CreativeStatus
): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    active: { bg: "#dcfce7", text: "#166534" },
    approved: { bg: "#dcfce7", text: "#166534" },
    paused: { bg: "#fef9c3", text: "#854d0e" },
    pending: { bg: "#fef9c3", text: "#854d0e" },
    onboarding: { bg: "#dbeafe", text: "#1e40af" },
    draft: { bg: "#f3f4f6", text: "#374151" },
    ended: { bg: "#f3f4f6", text: "#374151" },
    rejected: { bg: "#fee2e2", text: "#991b1b" },
  };
  return map[status] ?? { bg: "#f3f4f6", text: "#374151" };
}

export function priorityColor(priority: Priority): {
  bg: string;
  text: string;
} {
  const map: Record<Priority, { bg: string; text: string }> = {
    high: { bg: "#fee2e2", text: "#991b1b" },
    medium: { bg: "#fef9c3", text: "#854d0e" },
    low: { bg: "#f3f4f6", text: "#374151" },
  };
  return map[priority];
}

export function getClientById(
  clients: { id: string; name: string }[],
  id: string
) {
  return clients.find((c) => c.id === id);
}

// Compact "X minutes ago" formatter shared by every surface that shows
// recent activity. Returns "" for null so callers can spread it into
// JSX without a guard.
export function humanAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// Operators type industries freeform — capitalize the first letter only
// so multi-word entries like "real estate" keep their spacing.
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

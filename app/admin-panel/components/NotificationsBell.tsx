"use client";

// ---------------------------------------------------------------------------
// Operator notification bell.
//
// Polls /api/notifications for client portal activity (comments, approvals).
// Shows an unread badge; opening the panel marks everything read and links
// each item back to that client's proofer board.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

type Item = {
  id: number;
  clientId: number;
  clientName: string;
  postId: string | null;
  kind: string;
  body: string;
  createdAt: string;
  read: boolean;
};

const KIND_ICON: Record<string, string> = {
  comment: "💬",
  approve: "✅",
  unapprove: "↩️",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setItems(data.items ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {
      /* transient — try again on the next poll */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      } catch {
        /* best effort */
      }
    }
  }

  // No notifications → no bell. The chrome only appears once there's something
  // to show (comments, approvals); it disappears again when there's nothing.
  if (items.length === 0) return null;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        style={{
          position: "relative",
          background: "transparent",
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          padding: "6px 9px",
          fontSize: 14,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "#dc2626",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid #f4f4f5",
              fontSize: 13,
              fontWeight: 700,
              color: "#18181b",
            }}
          >
            Client activity
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: "#a1a1aa", textAlign: "center" }}>
              Nothing yet. Client comments and approvals show up here.
            </div>
          ) : (
            items.map((item) => (
              <a
                key={item.id}
                href={`/app/proofer?client=${item.clientId}`}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "11px 14px",
                  borderBottom: "1px solid #f4f4f5",
                  textDecoration: "none",
                  color: "inherit",
                  background: item.read ? "#fff" : "#f5f3ff",
                }}
              >
                <span aria-hidden style={{ fontSize: 15 }}>
                  {KIND_ICON[item.kind] ?? "•"}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#18181b" }}>
                    {item.clientName}
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, color: "#52525b", lineHeight: 1.4 }}>
                    {item.body}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
                    {relativeTime(item.createdAt)}
                  </span>
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

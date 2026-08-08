"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationsBell from "../admin-panel/components/NotificationsBell";

type ClientLite = { id: string; name: string };

function shiftMonth(value: string, delta: number): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Standalone top navigation for /proofer. Carries the Client dropdown and the
// Month stepper (the board hides its own copies in standalone mode), plus a
// quiet link back to the Guestlist dashboard. Changing client/month pushes new
// query params; the page re-renders and remounts the board with fresh data.
export default function ProoferNav({
  clients,
  clientId,
  month,
}: {
  clients: ClientLite[];
  clientId: string;
  month: string;
}) {
  const router = useRouter();
  const go = (c: string, m: string) =>
    router.push(
      `/proofer?client=${encodeURIComponent(c)}&month=${encodeURIComponent(m)}`
    );

  const ctlBg = "rgba(255,255,255,0.06)";
  const ctlBorder = "1px solid rgba(255,255,255,0.12)";

  return (
    <header
      style={{
        background: "#35353c",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 16,
        rowGap: 10,
        flexWrap: "wrap",
        padding: "10px 20px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "#b8e3d8",
            color: "#1f6b5c",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          P
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1 }}>
            Proofer
          </div>
          <Link
            href="/app/dashboard"
            target="_blank"
            rel="noopener"
            title="Open Guestlist dashboard in a new tab"
            style={{
              display: "inline-block",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#b8e3d8",
              fontWeight: 700,
              marginTop: 3,
              textDecoration: "none",
            }}
          >
            Guestlist Social ↗
          </Link>
        </div>
      </div>

      {/* Client + Month controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          aria-label="Client"
          value={clientId}
          onChange={(e) => go(e.target.value, month)}
          disabled={clients.length === 0}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            background: ctlBg,
            border: ctlBorder,
            borderRadius: 9,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 12px",
            cursor: clients.length === 0 ? "default" : "pointer",
            maxWidth: 220,
          }}
        >
          {clients.length === 0 && <option value="">No clients</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id} style={{ color: "#18181b" }}>
              {c.name}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: ctlBg,
            border: ctlBorder,
            borderRadius: 9,
            padding: "3px 4px",
          }}
        >
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => go(clientId, shiftMonth(month, -1))}
            style={monthBtn}
          >
            ‹
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, padding: "0 8px", minWidth: 96, textAlign: "center" }}>
            {monthLabel(month)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => go(clientId, shiftMonth(month, 1))}
            style={monthBtn}
          >
            ›
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <NotificationsBell />
      <form action="/sign-out" method="post" style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            color: "#d4d4d8",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#b8e3d8",
          color: "#1f6b5c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        GS
      </div>
    </header>
  );
}

const monthBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: "none",
  background: "transparent",
  color: "#cfcfd6",
  fontSize: 16,
  lineHeight: 1,
  borderRadius: 7,
  cursor: "pointer",
};

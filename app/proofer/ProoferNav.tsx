import Link from "next/link";
import NotificationsBell from "../admin-panel/components/NotificationsBell";

// Standalone top navigation for the /proofer page. Deliberately minimal: the
// board itself carries the client / month / frequency / publish controls, so
// this bar only needs to establish Proofer as its own destination and offer a
// quiet way back to the dashboard.
export default function ProoferNav() {
  return (
    <header
      style={{
        height: 60,
        background: "#35353c",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
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
          {/* The wordmark under the logo is the way back to the dashboard. */}
          <Link
            href="/app/dashboard"
            title="Back to Guestlist dashboard"
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

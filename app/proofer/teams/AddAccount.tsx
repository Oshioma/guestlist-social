"use client";

import { useState, useTransition } from "react";
import { startAccountConnect } from "@/lib/auth/team-actions";

// The add-account actions, laid out to sit right under the Facebook / Instagram
// column headers: "+ Add account" under Facebook (connects via Facebook and
// brings the linked Instagram — you pick the Page in the Meta picker and get
// both), and "Instagram only" under Instagram for accounts with no Facebook
// Page. There's no "Facebook vs Instagram" decision — Facebook is the default
// that adds both.
export function AddAccount({
  teamId,
  igConfigured,
}: {
  teamId: string;
  igConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [which, setWhich] = useState<"facebook" | "instagram" | null>(null);

  function go(platform: "facebook" | "instagram") {
    setWhich(platform);
    startTransition(async () => {
      const res = await startAccountConnect(teamId, platform);
      if (res?.url) window.location.href = res.url;
      else {
        setWhich(null);
        window.alert(res?.error ?? "Could not start connecting. Please try again.");
      }
    });
  }

  return (
    <div style={row}>
      <button
        type="button"
        onClick={() => go("facebook")}
        disabled={pending}
        style={addBtn}
        title="Log in with Facebook and pick the account — its Instagram comes with it"
      >
        {pending && which === "facebook" ? (
          <>
            <Spinner /> Opening…
          </>
        ) : (
          "+ Add account"
        )}
      </button>
      {igConfigured ? (
        <button
          type="button"
          onClick={() => go("instagram")}
          disabled={pending}
          style={igOnly}
          title="For an account that has an Instagram professional account but no Facebook Page"
        >
          {pending && which === "instagram" ? "Opening…" : "Instagram only"}
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" style={{ flex: "none" }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#e4e4e7" strokeWidth="3" />
      <path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="#52525b" strokeWidth="3" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.7s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

// Two columns, aligned with the Facebook / Instagram headers above.
const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  alignItems: "center",
  padding: "2px 0 8px",
};

const addBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#71717a",
  background: "transparent",
  border: "1px dashed #d8d8dd",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  justifySelf: "start",
};

const igOnly: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#a1a1aa",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
  justifySelf: "start",
};

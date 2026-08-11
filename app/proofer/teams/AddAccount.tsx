"use client";

import { useState, useTransition } from "react";
import { startAccountConnect } from "@/lib/auth/team-actions";

// The two "add" affordances, aligned under the Facebook and Instagram column
// titles so each sits in its own platform column. "+ Add account" (Facebook)
// connects via Facebook, which brings the Page AND its linked Instagram (you
// pick the Page in the Meta picker, and get both). "+ Instagram only" covers an
// account that has an Instagram professional account but no Facebook Page.
//
// Rendered as a 2-column grid matching `acctHeadRow` / `acctConns` on the Teams
// page, so the buttons line up directly beneath their column headers.
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
    <div style={grid}>
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
          style={addBtn}
          title="For an account that has an Instagram professional account but no Facebook Page"
        >
          {pending && which === "instagram" ? (
            <>
              <Spinner /> Opening…
            </>
          ) : (
            "+ Instagram only"
          )}
        </button>
      ) : (
        <span />
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

// Two columns, matching the Facebook | Instagram header/account grid above so
// each button lines up under its platform title.
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 8,
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
  padding: "7px 12px",
  cursor: "pointer",
  width: "100%",
};

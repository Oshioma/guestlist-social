"use client";

import { useTransition } from "react";
import { startAccountConnect } from "@/lib/auth/team-actions";

// A single compact "+" button that sits right next to a platform title in the
// accounts header ("Facebook +" / "Instagram +"). Clicking it starts a connect
// for that platform into this team:
//   • facebook  — logs in with Facebook and brings the Page AND its linked
//                 Instagram (you pick the Page in the Meta picker, get both).
//   • instagram — an Instagram professional account with no Facebook Page.
export function AddAccount({
  teamId,
  platform,
}: {
  teamId: string;
  platform: "facebook" | "instagram";
}) {
  const [pending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      const res = await startAccountConnect(teamId, platform);
      if (res?.url) window.location.href = res.url;
      else {
        window.alert(res?.error ?? "Could not start connecting. Please try again.");
      }
    });
  }

  const title =
    platform === "facebook"
      ? "Add a Facebook account — its linked Instagram comes with it"
      : "Add an Instagram-only account (no Facebook Page)";

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      style={plusBtn}
      title={title}
      aria-label={
        platform === "facebook"
          ? "Add a Facebook account"
          : "Add an Instagram-only account"
      }
    >
      {pending ? <Spinner /> : "+"}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" style={{ flex: "none" }} aria-hidden="true">
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

const plusBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  padding: 0,
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  color: "#71717a",
  background: "transparent",
  border: "1px dashed #cfcfd4",
  borderRadius: 5,
  cursor: "pointer",
  flex: "none",
};

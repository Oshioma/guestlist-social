"use client";

import { useTransition } from "react";
import { startAccountConnect } from "@/lib/auth/team-actions";

// A small "+" next to the Facebook / Instagram column headers. Clicking it
// starts a connect for that platform (connect-first: the Meta picker adds and
// names the account), replacing the old "+ Add account" button + platform step.
export function PlatformAddButton({
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
      else if (res?.error) window.alert(res.error);
    });
  }

  const label =
    platform === "facebook" ? "Connect a Facebook account" : "Connect an Instagram account";

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      style={plusBtn}
      title={label}
      aria-label={label}
    >
      +
    </button>
  );
}

const plusBtn: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  flex: "none",
};

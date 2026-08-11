"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamAccount } from "@/lib/auth/team-actions";

// Small ✕ that removes an account from THIS team (it isn't deleted, and stays in
// any other team it belongs to). This is the "delete from one, add to another"
// path that replaces moving accounts between teams.
export function AccountRemoveButton({
  teamId,
  clientId,
  name,
}: {
  teamId: string;
  clientId: number;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Remove “${name}” from this team? It stays in any other team it's in.`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("clientId", String(clientId));
      fd.set("action", "remove");
      const res = await setTeamAccount(null, fd);
      if (res?.error) window.alert(res.error);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      style={btn}
      title="Remove account from this team"
      aria-label={`Remove ${name} from this team`}
    >
      ✕
    </button>
  );
}

const btn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 12,
  padding: 2,
  lineHeight: 1,
};

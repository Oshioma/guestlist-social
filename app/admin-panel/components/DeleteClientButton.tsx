"use client";

import { useTransition } from "react";
import { deleteClientAction } from "../lib/client-actions";

export default function DeleteClientButton({
  clientId,
  redirectTo,
}: {
  clientId: string;
  redirectTo?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this client? This cannot be undone.")) return;

    startTransition(async () => {
      await deleteClientAction(clientId, redirectTo);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 10,
        background: "transparent",
        color: "#b91c1c",
        border: "1px solid #fecaca",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: isPending ? "wait" : "pointer",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {isPending ? "Deleting..." : "Delete client"}
    </button>
  );
}

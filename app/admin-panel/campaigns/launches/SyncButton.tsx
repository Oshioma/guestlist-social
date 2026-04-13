"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function syncNow() {
    setLoading(true);
    setMsg(null);

    // POST to sync API
    const resp = await fetch("/api/launches-sync", { method: "POST" });
    const data = await resp.json();
    setMsg(resp.ok ? `Synced ${data.updated} launches.` : `Error: ${data.error}`);
    setLoading(false);
    // Refresh the page to see new launches
    startTransition(() => router.refresh());
  }

  return (
    <div className="mb-4">
      <button
        onClick={syncNow}
        disabled={loading || isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        {loading || isPending ? "Syncing..." : "Sync launches"}
      </button>
      {msg && <span className="ml-3 text-xs text-gray-600">{msg}</span>}
    </div>
  );
}

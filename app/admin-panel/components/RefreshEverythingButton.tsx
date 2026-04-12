"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { humanAgo } from "@/app/admin-panel/lib/utils";

type Step = {
  name: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string;
};

type Job = {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  steps: Step[] | null;
  result_summary: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export default function RefreshEverythingButton({
  clientId,
}: {
  clientId?: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusUrl = clientId
    ? `/api/job-status?type=client_refresh&client=${clientId}`
    : `/api/job-status?type=full_refresh`;

  // Load the most recent job on mount so the pill shows "last updated X ago".
  useEffect(() => {
    let cancelled = false;
    fetch(statusUrl)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.job) setJob(data.job);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statusUrl]);

  // Poll while a job is running.
  useEffect(() => {
    if (!job || (job.status !== "running" && job.status !== "queued")) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/job-status?id=${job.id}`);
        const data = await res.json();
        if (data.ok && data.job) {
          setJob(data.job);
          if (data.job.status === "done" || data.job.status === "failed") {
            router.refresh();
          }
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job, router]);

  async function handleClick() {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId ?? undefined }),
      });
      const data = await res.json();
      if (data.ok && data.job_id) {
        // Seed a running job row locally so the UI flips immediately.
        setJob({
          id: data.job_id,
          status: "running",
          steps: [
            {
              name: "meta_sync",
              label: "Fetching the latest ad data",
              status: "running",
            },
          ],
          result_summary: null,
          error: null,
          started_at: new Date().toISOString(),
          finished_at: null,
          created_at: new Date().toISOString(),
        });
      }
    } finally {
      setStarting(false);
    }
  }

  const running = job?.status === "running" || job?.status === "queued";
  const currentStep = job?.steps?.find((s) => s.status === "running");
  const lastDoneStep = [...(job?.steps ?? [])]
    .reverse()
    .find((s) => s.status === "done");

  let pillText = "Not refreshed yet";
  let pillColor = "#71717a";
  if (running) {
    pillText = currentStep?.label ?? "Working…";
    pillColor = "#1e40af";
  } else if (job?.status === "done") {
    pillText = `Up to date · ${humanAgo(job.finished_at)}`;
    pillColor = "#166534";
  } else if (job?.status === "failed") {
    pillText = "Last refresh hit a snag";
    pillColor = "#991b1b";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={handleClick}
        disabled={starting || running}
        style={{
          padding: "10px 18px",
          borderRadius: 10,
          border: "1px solid #18181b",
          background: running ? "#f4f4f5" : "#18181b",
          color: running ? "#71717a" : "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: running || starting ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {running && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "2px solid #a1a1aa",
              borderTopColor: "#18181b",
              display: "inline-block",
              animation: "refresh-spin 0.8s linear infinite",
            }}
          />
        )}
        {running ? "Refreshing…" : "Refresh everything"}
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 12,
            color: pillColor,
            fontWeight: 600,
          }}
        >
          {pillText}
        </span>
        {running && lastDoneStep?.detail && (
          <span style={{ fontSize: 11, color: "#71717a" }}>
            {lastDoneStep.detail}
          </span>
        )}
        {!running && job?.result_summary && (
          <span style={{ fontSize: 11, color: "#71717a" }}>
            {job.result_summary}
          </span>
        )}
      </div>

      <style>{`
        @keyframes refresh-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

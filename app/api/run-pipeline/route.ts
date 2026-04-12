import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncMetaData } from "@/app/admin-panel/lib/meta-sync-action";

export const dynamic = "force-dynamic";
// Allow longer runs on Vercel — full pipeline can take a minute.
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// /api/run-pipeline
//
// One entry point. Enqueues a job row, returns { job_id } immediately, and
// runs the full refresh in the background via Next 16's after(). The UI
// polls /api/job-status?id=... every couple of seconds to show progress in
// layman's terms.
//
// Pipeline steps:
//   1. Meta sync  (pulls the latest ad data)
//   2. Score ads  (labels winners / losing / testing / paused)
//   3. Generate actions
//   4. Generate decisions
//   5. Regenerate global learnings
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";
type Step = {
  name: string;
  label: string; // layman-friendly
  status: StepStatus;
  detail?: string;
};

const INITIAL_STEPS: Step[] = [
  { name: "meta_sync", label: "Fetching the latest ad data", status: "pending" },
  { name: "score", label: "Checking how each ad is doing", status: "pending" },
  { name: "actions", label: "Deciding what to do about each one", status: "pending" },
  { name: "decisions", label: "Drafting the big calls", status: "pending" },
  { name: "global_learnings", label: "Updating the proven playbook", status: "pending" },
];

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function updateJob(
  supabase: ReturnType<typeof admin>,
  jobId: number,
  patch: Record<string, unknown>
) {
  await supabase.from("jobs").update(patch).eq("id", jobId);
}

function setStep(
  steps: Step[],
  name: string,
  status: StepStatus,
  detail?: string
): Step[] {
  return steps.map((s) =>
    s.name === name ? { ...s, status, detail: detail ?? s.detail } : s
  );
}

async function callInternal(
  baseUrl: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: res.ok && data.ok !== false, data };
  } catch (err) {
    return {
      ok: false,
      data: {},
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

async function runPipeline(
  jobId: number,
  clientId: string | null,
  baseUrl: string
) {
  const supabase = admin();
  let steps: Step[] = INITIAL_STEPS.map((s) => ({ ...s }));

  await updateJob(supabase, jobId, {
    status: "running",
    started_at: new Date().toISOString(),
    steps,
  });

  const summaries: string[] = [];

  // --- 1. Meta sync --------------------------------------------------------
  steps = setStep(steps, "meta_sync", "running");
  await updateJob(supabase, jobId, { steps });
  try {
    if (clientId) {
      const syncResult = await syncMetaData(clientId);
      if (syncResult.ok) {
        steps = setStep(
          steps,
          "meta_sync",
          "done",
          syncResult.log?.slice(-1)[0] ?? "Fetched latest ads"
        );
        summaries.push("Ad data refreshed");
      } else {
        steps = setStep(
          steps,
          "meta_sync",
          "failed",
          syncResult.error ?? "Meta sync failed"
        );
      }
    } else {
      // Full-account sync via the existing GET route
      const res = await fetch(`${baseUrl}/api/meta-sync`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        steps = setStep(steps, "meta_sync", "done", "Fetched latest ads");
        summaries.push("Ad data refreshed");
      } else {
        steps = setStep(
          steps,
          "meta_sync",
          "failed",
          data.error ?? "Meta sync failed"
        );
      }
    }
  } catch (err) {
    steps = setStep(
      steps,
      "meta_sync",
      "failed",
      err instanceof Error ? err.message : "Meta sync error"
    );
  }
  await updateJob(supabase, jobId, { steps });

  // --- 2. Score ads --------------------------------------------------------
  steps = setStep(steps, "score", "running");
  await updateJob(supabase, jobId, { steps });
  const scoreRes = await callInternal(baseUrl, "/api/score-ads", {
    clientId: clientId ?? undefined,
  });
  if (scoreRes.ok) {
    const breakdown = scoreRes.data.breakdown as
      | { winner?: number; losing?: number; testing?: number; paused?: number }
      | undefined;
    const detail = breakdown
      ? `${breakdown.winner ?? 0} doing well, ${breakdown.losing ?? 0} struggling, ${breakdown.testing ?? 0} still learning`
      : "Scores updated";
    steps = setStep(steps, "score", "done", detail);
    if (breakdown) {
      summaries.push(
        `${breakdown.winner ?? 0} winners / ${breakdown.losing ?? 0} strugglers`
      );
    }
  } else {
    steps = setStep(steps, "score", "failed", scoreRes.error ?? "Scoring failed");
  }
  await updateJob(supabase, jobId, { steps });

  // --- 3. Generate actions -------------------------------------------------
  steps = setStep(steps, "actions", "running");
  await updateJob(supabase, jobId, { steps });
  const actionsRes = await callInternal(baseUrl, "/api/generate-actions", {
    clientId: clientId ?? undefined,
  });
  if (actionsRes.ok) {
    const generated = Number(actionsRes.data.generated ?? 0);
    steps = setStep(
      steps,
      "actions",
      "done",
      generated > 0
        ? `${generated} new ${generated === 1 ? "thing" : "things"} to do`
        : "No new actions needed right now"
    );
    if (generated > 0) summaries.push(`${generated} new actions`);
  } else {
    steps = setStep(
      steps,
      "actions",
      "failed",
      actionsRes.error ?? "Actions failed"
    );
  }
  await updateJob(supabase, jobId, { steps });

  // --- 4. Generate decisions -----------------------------------------------
  steps = setStep(steps, "decisions", "running");
  await updateJob(supabase, jobId, { steps });
  const decisionsRes = await callInternal(baseUrl, "/api/generate-decisions", {
    clientId: clientId ?? undefined,
  });
  if (decisionsRes.ok) {
    const generated = Number(
      decisionsRes.data.generated ?? decisionsRes.data.count ?? 0
    );
    steps = setStep(
      steps,
      "decisions",
      "done",
      generated > 0 ? `${generated} big calls queued` : "No big calls needed"
    );
  } else {
    steps = setStep(steps, "decisions", "skipped", decisionsRes.error);
  }
  await updateJob(supabase, jobId, { steps });

  // --- 5. Global learnings -------------------------------------------------
  steps = setStep(steps, "global_learnings", "running");
  await updateJob(supabase, jobId, { steps });
  const learnRes = await callInternal(
    baseUrl,
    "/api/generate-global-learnings"
  );
  if (learnRes.ok) {
    const generated = Number(learnRes.data.generated ?? 0);
    steps = setStep(
      steps,
      "global_learnings",
      "done",
      generated > 0 ? `${generated} patterns in the playbook` : "Playbook up to date"
    );
  } else {
    steps = setStep(
      steps,
      "global_learnings",
      "skipped",
      learnRes.error ?? "Skipped"
    );
  }

  // --- Done ----------------------------------------------------------------
  const anyFailed = steps.some((s) => s.status === "failed");
  await updateJob(supabase, jobId, {
    status: anyFailed ? "failed" : "done",
    steps,
    result_summary:
      summaries.length > 0 ? summaries.join(" · ") : "Everything up to date",
    finished_at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientId: string | null = body.clientId ? String(body.clientId) : null;

    const supabase = admin();
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        type: clientId ? "client_refresh" : "full_refresh",
        client_id: clientId ? Number(clientId) : null,
        status: "queued",
        steps: INITIAL_STEPS,
      })
      .select("id")
      .single();

    if (error || !job) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Failed to create job" },
        { status: 500 }
      );
    }

    const jobId = Number(job.id);

    // Resolve a base URL for internal fetches.
    //
    // We deliberately prefer the request's own origin over VERCEL_URL.
    // VERCEL_URL points at the deployment-specific hostname
    // (`<project>-<hash>.vercel.app`), which is gated by Vercel
    // Authentication when it's enabled — so internal fetches to it come
    // back as the SSO HTML page and every downstream JSON.parse fails
    // with "Unexpected token '<'". The host the user just hit (e.g.
    // `www.guestlistsocial.com`) is always the right callback target.
    //
    // NEXT_PUBLIC_APP_URL is still honoured first as an explicit override
    // for environments where the request origin isn't trustworthy (e.g.
    // a cron run with no inbound request).
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      new URL(req.url).origin;

    // after() runs post-response so the browser isn't blocked.
    after(async () => {
      try {
        await runPipeline(jobId, clientId, baseUrl);
      } catch (err) {
        const sb = admin();
        await sb
          .from("jobs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : "Pipeline crashed",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    });

    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

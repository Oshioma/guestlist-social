// ---------------------------------------------------------------------------
// Tiny Capsule CRM client.
//
// Capsule's v2 REST API directly via fetch — no SDK dependency. Used to pull
// the sales calendar (open tasks, each linked to a contact) into the Sales
// call list and the daily admin email, so "who do I call today?" is answered
// by the CRM the calls are actually planned in.
//
// Gated on CAPSULE_API_TOKEN (a personal API token, generated in Capsule
// under My Preferences → API Authentication Tokens). Missing token or a
// failed request degrades to "not configured / empty" rather than crashing —
// callers render a setup note or an empty section. CAPSULE_SITE (the
// account's subdomain, e.g. "guestlist" for guestlist.capsulecrm.com) is
// optional and only used to build deep links back into Capsule.
//
// Field mapping is deliberately defensive: only the handful of fields we
// display are read, and every one tolerates being absent.
// ---------------------------------------------------------------------------

import "server-only";

const CAPSULE_API_BASE = "https://api.capsulecrm.com/api/v2";

export type CapsuleTask = {
  id: number;
  description: string;
  detail: string;
  dueOn: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM[:SS]
  partyName: string;
  partyId: number | null;
  opportunityName: string;
  categoryName: string;
  ownerName: string;
};

export type CapsuleTasksResult =
  | { ok: true; tasks: CapsuleTask[] }
  | { ok: false; configured: false }
  | { ok: false; configured: true; error: string };

export function isCapsuleConfigured(): boolean {
  return Boolean(process.env.CAPSULE_API_TOKEN);
}

// Deep link to a Capsule party (contact) page, when the site subdomain is
// configured; null otherwise so callers render plain text.
export function capsulePartyUrl(partyId: number | null): string | null {
  const site = process.env.CAPSULE_SITE;
  if (!site || partyId == null) return null;
  return `https://${site}.capsulecrm.com/party/${partyId}`;
}

// A party summary is an organisation (name) or a person (firstName/lastName).
function partyDisplayName(party: unknown): string {
  if (!party || typeof party !== "object") return "";
  const p = party as {
    name?: unknown;
    firstName?: unknown;
    lastName?: unknown;
  };
  if (typeof p.name === "string" && p.name.trim()) return p.name.trim();
  const first = typeof p.firstName === "string" ? p.firstName : "";
  const last = typeof p.lastName === "string" ? p.lastName : "";
  return `${first} ${last}`.trim();
}

function mapTask(raw: unknown): CapsuleTask | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const id = Number(t.id);
  if (!Number.isFinite(id)) return null;

  const party = t.party as { id?: unknown } | undefined;
  const opportunity = t.opportunity as { name?: unknown } | undefined;
  const category = t.category as { name?: unknown } | undefined;
  const owner = t.owner as { name?: unknown; username?: unknown } | undefined;

  return {
    id,
    description: typeof t.description === "string" ? t.description : "",
    detail: typeof t.detail === "string" ? t.detail : "",
    dueOn: typeof t.dueOn === "string" && t.dueOn ? t.dueOn.slice(0, 10) : null,
    dueTime: typeof t.dueTime === "string" && t.dueTime ? t.dueTime.slice(0, 5) : null,
    partyName: partyDisplayName(t.party),
    partyId: party && Number.isFinite(Number(party.id)) ? Number(party.id) : null,
    opportunityName:
      opportunity && typeof opportunity.name === "string" ? opportunity.name : "",
    categoryName:
      category && typeof category.name === "string" ? category.name : "",
    ownerName:
      owner && typeof owner.name === "string"
        ? owner.name
        : owner && typeof owner.username === "string"
          ? owner.username
          : "",
  };
}

const TASKS_PER_PAGE = 100;
// Pages collected once the recent window is found — up to 3,000 tasks due
// after the cutoff, which is plenty of runway of actual upcoming work.
const MAX_FORWARD_PAGES = 30;
// How far back "recent" reaches. Wider than the UI's one-month overdue
// window so the pages handed to it always cover what it wants to show.
const RECENT_WINDOW_DAYS = 45;

class CapsuleHttpError extends Error {
  constructor(public status: number) {
    super(`Capsule API returned ${status}.`);
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

type TaskPage = { tasks: CapsuleTask[]; short: boolean };

async function getPage(token: string, page: number): Promise<TaskPage> {
  const url =
    `${CAPSULE_API_BASE}/tasks?status=open&embed=party,opportunity` +
    `&perPage=${TASKS_PER_PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new CapsuleHttpError(res.status);
  const body = (await res.json()) as { tasks?: unknown[] };
  const tasks = (body.tasks ?? [])
    .map(mapTask)
    .filter((t): t is CapsuleTask => t != null);
  return { tasks, short: tasks.length < TASKS_PER_PAGE };
}

// Preferred path: ask Capsule's structured-filter endpoint for tasks due
// after the cutoff, so the ancient backlog never travels over the wire.
// Returns null when the endpoint isn't available for tasks (older accounts /
// API surface differences) so the caller can fall back to page-skipping.
async function tasksViaFilter(
  token: string,
  cutoffKey: string
): Promise<CapsuleTask[] | null> {
  const out: CapsuleTask[] = [];
  for (let page = 1; page <= MAX_FORWARD_PAGES; page++) {
    const url =
      `${CAPSULE_API_BASE}/tasks/filters?embed=party,opportunity` +
      `&perPage=${TASKS_PER_PAGE}&page=${page}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          conditions: [
            { field: "dueOn", operator: "is after", value: cutoffKey },
          ],
        },
      }),
      cache: "no-store",
    });
    if (res.status === 401) throw new CapsuleHttpError(401);
    if (!res.ok) return null; // not supported here — fall back
    const body = (await res.json()) as { tasks?: unknown[] };
    const tasks = (body.tasks ?? [])
      .map(mapTask)
      .filter((t): t is CapsuleTask => t != null);
    out.push(...tasks);
    if (tasks.length < TASKS_PER_PAGE) break;
  }
  return out;
}

// Fallback path: Capsule lists open tasks oldest-due first and this account
// carries thousands of ancient ones, so walking pages from the start never
// reaches the current month. Instead, binary-search the page range for the
// first page that touches the recent window (exponential probe for the upper
// bound, then bisect — pages are cached so nothing is fetched twice), and
// collect forward from there. The boundary page brings some pre-cutoff tasks
// along, which is fine — they're the near-term overdue the UI still shows.
async function tasksViaPageSkip(
  token: string,
  cutoffKey: string
): Promise<CapsuleTask[]> {
  const cache = new Map<number, TaskPage>();
  const page = async (p: number): Promise<TaskPage> => {
    const hit = cache.get(p);
    if (hit) return hit;
    const loaded = await getPage(token, p);
    cache.set(p, loaded);
    return loaded;
  };
  const reachesWindow = (pg: TaskPage): boolean => {
    if (pg.short) return true; // last page (or empty) — nothing beyond it
    let max: string | null = null;
    for (const t of pg.tasks) {
      if (t.dueOn && (max == null || t.dueOn > max)) max = t.dueOn;
    }
    return max != null && max >= cutoffKey;
  };

  const first = await page(1);
  let lo = 1; // greatest page known NOT to reach the window
  let hi: number | null = null; // least page known to reach it
  if (reachesWindow(first)) {
    hi = 1;
  } else {
    for (let p = 2; p <= 512; p *= 2) {
      const pg = await page(p);
      if (pg.tasks.length === 0 || reachesWindow(pg)) {
        hi = p;
        break;
      }
      lo = p;
    }
    if (hi == null) {
      // >51k open tasks before the window — give up gracefully.
      console.warn("[capsule] open-task backlog too deep to skip");
      return first.tasks;
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const pg = await page(mid);
      if (pg.tasks.length === 0 || reachesWindow(pg)) hi = mid;
      else lo = mid;
    }
  }

  const out: CapsuleTask[] = [];
  const seen = new Set<number>();
  let p = hi;
  for (let i = 0; i < MAX_FORWARD_PAGES; i++, p++) {
    const pg = await page(p);
    for (const t of pg.tasks) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    if (pg.short) break;
  }
  return out;
}

// Open (not yet completed) tasks in and after the recent window — Capsule's
// calendar without the ancient backlog. Sorted by due date, undated last.
export async function getCapsuleOpenTasks(): Promise<CapsuleTasksResult> {
  const token = process.env.CAPSULE_API_TOKEN;
  if (!token) return { ok: false, configured: false };

  const cutoffKey = isoDaysAgo(RECENT_WINDOW_DAYS);
  let tasks: CapsuleTask[];
  try {
    tasks =
      (await tasksViaFilter(token, cutoffKey)) ??
      (await tasksViaPageSkip(token, cutoffKey));
  } catch (e) {
    const hint =
      e instanceof CapsuleHttpError
        ? e.status === 401
          ? "Capsule rejected the API token (check CAPSULE_API_TOKEN)."
          : e.message
        : "Could not reach Capsule.";
    console.warn("[capsule] task fetch failed:", hint);
    return { ok: false, configured: true, error: hint };
  }

  tasks.sort((a, b) => {
    if (a.dueOn == null && b.dueOn == null) return a.id - b.id;
    if (a.dueOn == null) return 1;
    if (b.dueOn == null) return -1;
    return (
      a.dueOn.localeCompare(b.dueOn) ||
      (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") ||
      a.id - b.id
    );
  });

  return { ok: true, tasks };
}

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
const TASKS_MAX_PAGES = 25; // up to 2,500 open tasks

async function fetchTaskPage(
  token: string,
  page: number
): Promise<{ ok: true; tasks: CapsuleTask[] } | { ok: false; status: number }> {
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
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json()) as { tasks?: unknown[] };
  return {
    ok: true,
    tasks: (body.tasks ?? [])
      .map(mapTask)
      .filter((t): t is CapsuleTask => t != null),
  };
}

// Open (not yet completed) tasks — Capsule's calendar. Sorted by due date,
// undated tasks last.
//
// Capsule returns open tasks oldest-due first, and this account carries a
// backlog of hundreds of overdue ones — so a shallow fetch never reaches the
// current month and the calendar looks empty. Page 1 runs alone (it also
// validates the token); the remaining pages are fetched in parallel so depth
// doesn't cost wall-clock time. A failed later page degrades to partial data
// rather than an error.
export async function getCapsuleOpenTasks(): Promise<CapsuleTasksResult> {
  const token = process.env.CAPSULE_API_TOKEN;
  if (!token) return { ok: false, configured: false };

  const tasks: CapsuleTask[] = [];
  try {
    const first = await fetchTaskPage(token, 1);
    if (!first.ok) {
      const hint =
        first.status === 401
          ? "Capsule rejected the API token (check CAPSULE_API_TOKEN)."
          : `Capsule API returned ${first.status}.`;
      console.warn("[capsule] task fetch failed:", hint);
      return { ok: false, configured: true, error: hint };
    }
    tasks.push(...first.tasks);

    if (first.tasks.length === TASKS_PER_PAGE) {
      const rest = await Promise.all(
        Array.from({ length: TASKS_MAX_PAGES - 1 }, (_, i) =>
          fetchTaskPage(token, i + 2).catch(
            () => ({ ok: false, status: 0 }) as const
          )
        )
      );
      let exhausted = false;
      for (const pageResult of rest) {
        if (!pageResult.ok) {
          console.warn(
            "[capsule] a task page failed — continuing with partial data"
          );
          exhausted = true;
          break;
        }
        tasks.push(...pageResult.tasks);
        if (pageResult.tasks.length < TASKS_PER_PAGE) {
          exhausted = true;
          break;
        }
      }
      if (!exhausted) {
        console.warn(
          `[capsule] more than ${TASKS_MAX_PAGES * TASKS_PER_PAGE} open tasks — furthest-out tasks not loaded`
        );
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[capsule] task fetch failed:", message);
    return { ok: false, configured: true, error: "Could not reach Capsule." };
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

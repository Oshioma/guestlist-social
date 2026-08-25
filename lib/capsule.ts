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

// Open (not yet completed) tasks — Capsule's calendar. Sorted by due date,
// undated tasks last. Fetches up to two pages of 100; a sales team's open
// call list realistically fits well inside that.
export async function getCapsuleOpenTasks(): Promise<CapsuleTasksResult> {
  const token = process.env.CAPSULE_API_TOKEN;
  if (!token) return { ok: false, configured: false };

  const tasks: CapsuleTask[] = [];
  try {
    for (let page = 1; page <= 2; page++) {
      const url =
        `${CAPSULE_API_BASE}/tasks?status=open&embed=party,opportunity` +
        `&perPage=100&page=${page}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        const hint =
          res.status === 401
            ? "Capsule rejected the API token (check CAPSULE_API_TOKEN)."
            : `Capsule API returned ${res.status}.`;
        console.warn("[capsule] task fetch failed:", hint);
        return { ok: false, configured: true, error: hint };
      }
      const body = (await res.json()) as { tasks?: unknown[] };
      const pageTasks = (body.tasks ?? [])
        .map(mapTask)
        .filter((t): t is CapsuleTask => t != null);
      tasks.push(...pageTasks);
      if (pageTasks.length < 100) break;
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

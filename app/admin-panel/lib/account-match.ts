// Pure account-targeting logic shared by the server publisher
// (meta-publish.ts) and the client publish board (PublishQueueBoard.tsx).
//
// Keeping this in ONE pure module (no "use server", no Supabase, no DOM) is
// deliberate: the board uses it to warn "this won't publish" the instant a
// post is queued/scheduled, and the publisher uses it to decide where a post
// actually goes. They must never drift — a warning the operator sees has to
// mean exactly what the cron will do.

export type MatchAccount = { account_id: string; account_name: string | null };

export type MatchResult<T> =
  | { ok: true; account: T }
  | { ok: false; reason: string };

// Normalize a handle/username for comparison: lower-case, trimmed, no leading
// "@". "@Organzibar " and "organzibar" compare equal.
export function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

// Looser normalization for Facebook PAGE NAMES only: strips everything but
// letters/digits so a page called "Guestlist Social" also matches an operator
// who typed "guestlistsocial" (the handle form). Page names routinely carry
// spaces, "&", and punctuation the operator won't reproduce exactly. This is
// safe: it only ever runs against the accounts already connected UNDER ONE
// client, and if two of them collapse to the same value the matcher reports it
// as ambiguous and blocks rather than guessing. NOT used for Instagram — IG
// usernames are exact and dots/underscores are significant.
export function looseName(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Whether a declared Facebook Page value identifies a given connected account,
// by exact id, normalized name, or loose (alphanumeric-only) name.
export function facebookPageMatches(
  declared: string | null | undefined,
  account: { account_id: string; account_name: string | null }
): boolean {
  const wanted = normalizeHandle(declared);
  if (!wanted) return false;
  if ((account.account_id ?? "").trim().toLowerCase() === wanted) return true;
  if (normalizeHandle(account.account_name) === wanted) return true;
  const wantedLoose = looseName(declared);
  return !!wantedLoose && looseName(account.account_name) === wantedLoose;
}

// Whether a block reason is one the operator fixes on the client edit page
// (a missing/mismatched Instagram handle or Facebook Page) versus one that
// needs a different action (connecting an account). The board uses this to
// decide whether to show the "Edit here" shortcut.
export function isClientSettingsReason(reason: string): boolean {
  return /instagram handle|facebook page/i.test(reason);
}

// Resolve the ONE account a post may publish to, refusing to guess. The
// binding key is the handle the post was written for — the client's declared
// Instagram handle / Facebook Page. See meta-publish.ts for the full rationale.
export function resolveAccountMatch<T extends MatchAccount>(args: {
  accounts: T[];
  platform: "facebook" | "instagram";
  handle: string | null;
  fbPage: string | null;
}): MatchResult<T> {
  const { accounts, platform, handle, fbPage } = args;

  if (accounts.length === 0) {
    return {
      ok: false,
      reason:
        platform === "instagram"
          ? "No Instagram account connected for this client."
          : "No Facebook Page connected for this client.",
    };
  }

  if (platform === "instagram") {
    const wanted = normalizeHandle(handle);
    if (wanted) {
      const matches = accounts.filter(
        (a) => normalizeHandle(a.account_name) === wanted
      );
      if (matches.length === 1) return { ok: true, account: matches[0] };
      if (matches.length === 0) {
        return {
          ok: false,
          reason: `No connected Instagram account matches this client's handle (@${wanted}).`,
        };
      }
      return {
        ok: false,
        reason: `More than one connected Instagram account matches @${wanted} — remove the duplicate.`,
      };
    }
    if (accounts.length === 1) return { ok: true, account: accounts[0] };
    return { ok: false, reason: "Instagram handle not set for this client." };
  }

  // Facebook: match the declared Page against the connected Page's name or id
  // (exact id, normalized name, or loose alphanumeric name — see looseName).
  const wantedPage = normalizeHandle(fbPage);
  if (wantedPage) {
    const matches = accounts.filter((a) => facebookPageMatches(fbPage, a));
    if (matches.length === 1) return { ok: true, account: matches[0] };
    if (matches.length === 0) {
      return {
        ok: false,
        reason: `No connected Facebook Page matches this client's Page ("${fbPage}").`,
      };
    }
    return {
      ok: false,
      reason: `More than one connected Facebook Page matches "${fbPage}" — remove the duplicate.`,
    };
  }
  if (accounts.length === 1) return { ok: true, account: accounts[0] };
  return { ok: false, reason: "Facebook Page not linked for this client." };
}

"use client";

import { setLastProoferClientAction } from "./prefs-actions";

// Remember the account (client) the user is currently viewing so the board
// resumes on it after they leave and come back.
//
// Two stores, written together:
//   1. The durable per-user server preference (user_proofer_prefs) — the
//      authoritative source. Works across devices AND across the two product
//      domains, and can't go stale relative to the account actually chosen.
//   2. A browser cookie — a fast same-request hint. Scoped to the registrable
//      domain (".postproofer.com") so apex and www share it; without that the
//      cookie is host-only and postproofer.com vs www.postproofer.com would
//      each keep their own stale value.
//
// The board reads the server preference FIRST, then this cookie, so a stale or
// wrong-host cookie can never override the account the user actually left on.
export function rememberLastClient(clientId: string): void {
  const id = (clientId ?? "").trim();
  if (!id) return;

  document.cookie = buildCookie(id);
  // Fire-and-forget: never block board navigation on the write.
  setLastProoferClientAction(id).catch(() => {});
}

function buildCookie(id: string): string {
  const maxAge = 60 * 60 * 24 * 365; // one year
  let domainAttr = "";
  try {
    const host = window.location.hostname;
    // Skip the domain attribute on localhost / raw IPs (invalid there).
    const isPlainHost =
      host === "localhost" ||
      host.endsWith(".localhost") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (!isPlainHost) {
      const registrable = host.split(".").slice(-2).join(".");
      if (registrable.includes(".")) domainAttr = `;domain=.${registrable}`;
    }
  } catch {
    /* window unavailable — fall back to a host-only cookie */
  }
  return `proofer_last_client=${id};path=/;max-age=${maxAge}${domainAttr};samesite=lax`;
}

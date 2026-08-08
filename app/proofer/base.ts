import { headers } from "next/headers";

// Hosts that serve the standalone Proofer at their own root. Keep this in sync
// with PROOFER_HOSTS in middleware.ts, which does the request-side rewrite.
const PROOFER_HOSTS = new Set(["postproofer.com", "www.postproofer.com"]);

export type ProoferBase = {
  // Prefix the Proofer route tree lives under for this request. On the
  // standalone domain the /proofer prefix is hidden (""), so links resolve at
  // the domain root; everywhere else it stays "/proofer".
  base: string;
  // Absolute origin of the parent Guestlist app, used for links that leave
  // Proofer (dashboard, client view, publish queue) — those surfaces aren't
  // served on the standalone domain, so they can't be relative there. Empty on
  // the normal host, where those links stay relative exactly as before.
  parentOrigin: string;
};

// Resolves how Proofer links should be built for the current request, based on
// the host it came in on.
export async function getProoferBase(): Promise<ProoferBase> {
  const host = (await headers()).get("host")?.toLowerCase().split(":")[0] ?? "";
  const standalone = PROOFER_HOSTS.has(host);
  return {
    base: standalone ? "" : "/proofer",
    parentOrigin: standalone ? process.env.NEXT_PUBLIC_SITE_URL ?? "" : "",
  };
}

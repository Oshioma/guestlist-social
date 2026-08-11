"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { metaServiceClient } from "@/app/admin-panel/lib/meta-auth";
import {
  attachMetaPage,
  canManageClientAccount,
  type PageCandidate,
} from "@/app/admin-panel/lib/meta-attach";

// Server action behind the Facebook Page chooser. The OAuth callback stashed the
// candidate Pages in `pending_meta_connections` (keyed by a nonce it also set in
// the httpOnly `meta_pick` cookie) and sent the user here. We look up the pending
// row by that cookie, verify the caller may manage the target client, attach ONLY
// the Page they picked (plus its linked Instagram), delete the pending row, and
// send them back to where they came from.
export async function attachSelectedMetaPage(formData: FormData): Promise<void> {
  const pageId = String(formData.get("pageId") ?? "");
  if (!pageId) redirect("/proofer/teams?meta_error=No+account+selected.");

  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");

  const cookieStore = await cookies();
  const nonce = cookieStore.get("meta_pick")?.value ?? "";
  if (!nonce) {
    redirect("/proofer/teams?meta_error=Your+connection+session+expired.+Please+try+again.");
  }

  const svc = metaServiceClient();
  const { data: pending, error: pendErr } = await svc
    .from("pending_meta_connections")
    .select("nonce, client_id, return_to, pages, token_expires_at")
    .eq("nonce", nonce)
    .maybeSingle();

  if (pendErr || !pending) {
    cookieStore.delete("meta_pick");
    redirect("/proofer/teams?meta_error=Your+connection+session+expired.+Please+try+again.");
  }

  const clientId = Number(pending!.client_id);
  const returnTo =
    typeof pending!.return_to === "string" && pending!.return_to.startsWith("/")
      ? pending!.return_to
      : "/proofer/teams";

  // Authorise: staff always, otherwise owner/admin of a team holding this client.
  const allowed = await canManageClientAccount(
    access.userId,
    clientId,
    access.kind === "staff"
  );
  if (!allowed) {
    redirect(`${returnTo}?meta_error=You+can%27t+manage+this+account.`);
  }

  const candidates = (pending!.pages ?? []) as PageCandidate[];
  const chosen = candidates.find((c) => c.id === pageId);
  if (!chosen) {
    redirect(`${returnTo}?meta_error=That+account+is+no+longer+available.+Please+try+again.`);
  }

  const res = await attachMetaPage(
    clientId,
    chosen!,
    (pending!.token_expires_at as string | null) ?? null
  );

  // Clean up the pending row and the cookie regardless of the attach outcome so
  // the short-lived Page tokens don't linger.
  await svc.from("pending_meta_connections").delete().eq("nonce", nonce);
  cookieStore.delete("meta_pick");

  if (res.error) {
    redirect(`${returnTo}?meta_error=${encodeURIComponent(`Could not save connection: ${res.error}`)}`);
  }
  redirect(`${returnTo}?meta=connected&fb=${res.fb}&ig=${res.ig}`);
}

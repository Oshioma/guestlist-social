import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { metaServiceClient } from "@/app/admin-panel/lib/meta-auth";
import {
  canManageClientAccount,
  type PageCandidate,
} from "@/app/admin-panel/lib/meta-attach";
import { PagePicker, type PickerPage } from "./PagePicker";

export const dynamic = "force-dynamic";

// The Facebook Page chooser. The OAuth callback lands here when a login returns
// more than one Page: it stashed the candidates in `pending_meta_connections`
// and set the nonce in the httpOnly `meta_pick` cookie. We read that pending row
// server-side, confirm the caller may manage the target client, and render a
// radio list. Page access tokens NEVER reach the browser — we hand PagePicker
// only id / name / ig_username.
export default async function ConnectSelectPage() {
  const access = await getProoferAccess();
  if (!access) redirect("/sign-in");

  const cookieStore = await cookies();
  const nonce = cookieStore.get("meta_pick")?.value ?? "";
  if (!nonce) {
    redirect("/proofer/teams?meta_error=Your+connection+session+expired.+Please+try+again.");
  }

  const svc = metaServiceClient();
  const { data: pending } = await svc
    .from("pending_meta_connections")
    .select("client_id, pages")
    .eq("nonce", nonce)
    .maybeSingle();

  if (!pending) {
    redirect("/proofer/teams?meta_error=Your+connection+session+expired.+Please+try+again.");
  }

  const clientId = Number(pending!.client_id);
  const allowed = await canManageClientAccount(
    access.userId,
    clientId,
    access.kind === "staff"
  );
  if (!allowed) {
    redirect("/proofer/teams?meta_error=You+can%27t+manage+this+account.");
  }

  const { data: clientRow } = await svc
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();
  const clientName = (clientRow?.name as string | null) ?? null;

  // Strip tokens: the browser only needs to see which Page is which.
  const candidates = (pending!.pages ?? []) as PageCandidate[];
  const pages: PickerPage[] = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    ig_username: c.ig_username,
  }));

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "48px auto",
        padding: "0 20px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181b", margin: "0 0 6px" }}>
        Choose a Facebook account
      </h1>
      <p style={{ fontSize: 15, color: "#52525b", margin: "0 0 24px" }}>
        Your login manages more than one Facebook Page. Pick the one to connect
        {clientName ? (
          <>
            {" "}
            to <strong>{clientName}</strong>
          </>
        ) : null}
        . Only that Page and its linked Instagram will be added.
      </p>
      <PagePicker pages={pages} clientName={clientName} />
    </div>
  );
}

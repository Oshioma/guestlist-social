import ProoferNav from "../ProoferNav";
import { resolveNavData } from "../navData";
import PublishQueueView, {
  type ConnectResult,
} from "../../admin-panel/proofer/publish/PublishQueueView";

export const dynamic = "force-dynamic";
// Matches the admin publish route — "Publish now" polls Meta container status
// for videos (~up to 2 min), so the server action needs the extra headroom.
export const maxDuration = 300;

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = {
  maxWidth: 1160,
  margin: "0 auto",
  width: "100%",
};

// Standalone Proofer publish queue at /proofer/publish (served at /publish on
// postproofer.com). Same board and data as the admin panel's publish page, but
// wrapped in Proofer's own chrome and with in-app links. The Meta connection
// panel IS shown here so operators can see their team's connected accounts and
// connect from this surface. `/api/meta/connect` passes straight through on the
// Proofer host, so the OAuth popup runs fine; it finishes on the admin domain
// (the fixed Meta redirect URI) and closes, after which this page refreshes and
// the newly connected accounts appear.
export default async function ProoferPublishStandalone({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const nav = await resolveNavData(first(sp.client), first(sp.month));

  // Meta callback outcome, mirrored from the admin page so a connect attempt
  // that does land back here still reads cleanly.
  const metaFlag = first(sp.meta);
  const metaError = first(sp.meta_error);
  const pagesParam = first(sp.pages);
  const returnedPages = pagesParam ? pagesParam.split("|").filter(Boolean) : [];
  let connectResult: ConnectResult | null = null;
  if (metaError) {
    connectResult = { status: "error", message: metaError, pages: returnedPages };
  } else if (metaFlag === "connected") {
    connectResult = {
      status: "success",
      pages: returnedPages,
      fbCount: Number(first(sp.fb)) || 0,
      igCount: Number(first(sp.ig)) || 0,
    };
  }

  return (
    <>
      <ProoferNav
        clients={nav.clients}
        clientId={nav.clientId}
        month={nav.month}
        pillars={nav.pillars}
        posts={nav.posts}
        teams={nav.teams}
        occupiedDates={nav.occupiedDates}
        isSuperAdmin={nav.superAdmin}
        showBoardControls={false}
        base={nav.base}
        parentOrigin={nav.parentOrigin}
      />
      <main style={mainStyle}>
        <div style={centerStyle}>
          <PublishQueueView
            connectResult={connectResult}
            backHref={nav.base || "/"}
            settingsHref={`${nav.parentOrigin}/app/settings`}
            clientEditBase={`${nav.base}/clients`}
            showMetaConnection={true}
            connectOrigin={nav.parentOrigin}
          />
        </div>
      </main>
    </>
  );
}

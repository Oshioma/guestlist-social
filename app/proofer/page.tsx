import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getProoferData,
  getProoferPillarPosts,
  getProoferOccupiedDates,
} from "../admin-panel/lib/queries";
import { shouldRunOnboarding, getOnboardingResume } from "@/lib/onboarding";
import OnboardingFinishBanner from "./OnboardingFinishBanner";
import OnboardingResumeBanner from "./OnboardingResumeBanner";
import EmptyBoardCard from "./EmptyBoardCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayTimezone } from "@/lib/app-settings";
import ProoferBoard from "../admin-panel/proofer/ProoferBoard";
import EmptyState from "../admin-panel/components/EmptyState";
import ProoferNav from "./ProoferNav";
import {
  getMyTeams,
  getTeamClientIds,
  getMyTeamClientIds,
  getLastProoferClientId,
  getShowClients,
} from "./navData";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getProoferBase } from "./base";

export const dynamic = "force-dynamic";

// Shared with /app/proofer so the "last client" memory follows the user across
// both surfaces.
const COOKIE_NAME = "proofer_last_client";

function getNextSixMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    months.push({ value, label });
  }
  return months;
}

// Human label for the finish banner's saved-post date (e.g. "Saturday, 9 Aug").
function formatFinishDate(iso?: string): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = {
  maxWidth: 1160,
  margin: "0 auto",
  width: "100%",
};

export default async function ProoferStandalonePage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    month?: string;
    team?: string;
    tour?: string;
    d?: string;
  }>;
}) {
  const sp = await searchParams;

  // Divert brand-new posters into the guided first-run tour (resumes if
  // mid-flow). Must run before the try/catch below so the NEXT_REDIRECT isn't
  // swallowed. shouldRunOnboarding fails closed for staff / completed / skipped.
  const { base: obBase } = await getProoferBase();
  if (await shouldRunOnboarding()) {
    redirect(`${obBase}/onboarding`);
  }
  // Started but unfinished: no longer force-diverted (that trapped the Back
  // button), so offer the way back in on the board instead.
  const resume = await getOnboardingResume();

  const showFinishBanner = sp.tour === "done";
  const finishDateLabel = formatFinishDate(sp.d);
  const finishDateISO =
    sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : null;

  const months = getNextSixMonths();
  const defaultMonth = months[0]?.value ?? "";
  // On the onboarding finish, open on the saved post's month so its day is in
  // range for the board to render and scroll to (otherwise a rollover could
  // land us on the wrong month with the post nowhere on screen).
  const selectedMonth =
    sp.month ??
    (showFinishBanner && finishDateISO ? finishDateISO.slice(0, 7) : defaultMonth);

  const cookieStore = await cookies();
  // Resolve the last account from the DURABLE server-side preference first — it's
  // the authoritative, per-user, cross-device/cross-domain source. The cookie is
  // only a fast fallback; preferring it caused a stale or wrong-host cookie
  // (postproofer.com vs www) to override the account you actually left on.
  const lastClient =
    (await getLastProoferClientId()) || cookieStore.get(COOKIE_NAME)?.value || "";
  const { base, parentOrigin } = await getProoferBase();
  const myTeams = await getMyTeams();
  const superAdmin = await isSuperAdmin();
  const showClients = await getShowClients();

  // Hard tenant boundary: only accounts in teams the viewer belongs to are ever
  // shown — even for agency staff, so another tenant's account can't leak into
  // the picker. An optional ?team= filter (clicking a team in the nav) narrows
  // WITHIN that boundary.
  const myClientIds = await getMyTeamClientIds();
  const teamId = sp.team ?? "";
  const teamClientIds = teamId ? new Set(await getTeamClientIds(teamId)) : null;
  const inScope = (id: string) =>
    myClientIds.has(id) && (!teamClientIds || teamClientIds.has(id));

  try {
    let selectedClientId = sp.client ?? "";
    if (selectedClientId && !inScope(selectedClientId)) selectedClientId = "";
    if (!selectedClientId && lastClient && inScope(lastClient)) {
      selectedClientId = lastClient;
    }
    if (!selectedClientId) {
      const { clients } = await getProoferData();
      const pool = clients.filter((c) => inScope(String(c.id)));
      selectedClientId = pool[0]?.id ?? "";
    }

    const raw = await getProoferData(
      selectedClientId || undefined,
      selectedClientId ? selectedMonth : undefined
    );
    const data = {
      ...raw,
      clients: raw.clients.filter((c) => inScope(String(c.id))),
    };

    let displayTimezone = "Etc/GMT";
    try {
      displayTimezone = await getDisplayTimezone(createAdminClient());
    } catch (err) {
      console.error("Display timezone load error:", err);
    }

    // All-time pillar posts power the nav's pillar hover popups (the board's
    // own data stays month-scoped).
    const pillarPosts = selectedClientId
      ? await getProoferPillarPosts(selectedClientId)
      : [];
    const occupiedDates = selectedClientId
      ? await getProoferOccupiedDates(selectedClientId)
      : [];

    // A brand-new user with no accounts shouldn't be dropped into the full
    // board (frequency toggles, publish queue, month stepper, client picker) —
    // it's noise before they've made anything. Show a clean "set up your first
    // post" card and hide the board controls in the nav until they have an
    // account.
    const hasClients = data.clients.length > 0;

    return (
      <>
        <ProoferNav
          clients={data.clients}
          clientId={selectedClientId}
          month={selectedMonth}
          pillars={data.pillars}
          posts={pillarPosts}
          teams={myTeams}
          teamId={teamId}
          occupiedDates={occupiedDates}
          isSuperAdmin={superAdmin}
          showClients={showClients}
          showBoardControls={hasClients}
          base={base}
          parentOrigin={parentOrigin}
        />
        <main style={mainStyle}>
          <div style={centerStyle}>
            {showFinishBanner && (
              <OnboardingFinishBanner dateLabel={finishDateLabel} date={finishDateISO} />
            )}
            {/* Only alongside a real board — with no account the setup card
                below is already the invitation, and two CTAs would compete. */}
            {resume && hasClients && !showFinishBanner && (
              <OnboardingResumeBanner
                href={`${base}/onboarding`}
                step={resume.step}
                total={resume.total}
              />
            )}
            {!hasClients ? (
              <EmptyBoardCard base={base} />
            ) : (
            <ProoferBoard
              // Remount when client/month change (driven from the top nav) so
              // the board's internal state re-seeds cleanly from fresh data.
              key={`${selectedClientId}:${selectedMonth}`}
              clients={data.clients}
              months={months}
              initialClientId={selectedClientId}
              initialMonth={selectedMonth}
              initialPosts={data.posts}
              initialPillars={data.pillars}
              initialIdeas={data.ideas}
              initialPostIdeas={data.postIdeas}
              timeZone={displayTimezone}
              basePath={base || "/"}
              // Publish queue now lives inside the Proofer app itself
              // ("/publish" on postproofer.com, "/proofer/publish" elsewhere)
              // rather than bouncing out to the parent Guestlist admin.
              publishPath={`${base || ""}/publish`}
              standalone
              // Onboarding finish: force-render and scroll to the just-saved
              // post's day so it's always visible and centred.
              focusDateKey={showFinishBanner ? (finishDateISO ?? undefined) : undefined}
            />
            )}
          </div>
        </main>
      </>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <>
        <ProoferNav clients={[]} clientId="" month={selectedMonth} pillars={[]} posts={[]} teams={myTeams} teamId={teamId} isSuperAdmin={superAdmin} showClients={showClients} base={base} parentOrigin={parentOrigin} />
        <main style={mainStyle}>
          <div style={centerStyle}>
            <EmptyState title="Unable to load proofer" description={message} />
          </div>
        </main>
      </>
    );
  }
}

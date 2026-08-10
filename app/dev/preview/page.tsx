import { notFound } from "next/navigation";
// The same stylesheet app/proofer/layout.tsx pulls in. Without it the board's
// class-based rules (.mobile-strip and friends) are missing and the harness
// lies to you — rows that scroll in production stack vertically here.
import "../../admin-panel/admin.css";
import OnboardingFlow, {
  type StepId,
} from "@/app/proofer/onboarding/OnboardingFlow";
import OnboardingResumeBanner from "@/app/proofer/OnboardingResumeBanner";
import EmptyBoardCard from "@/app/proofer/EmptyBoardCard";
import ProoferBoard from "@/app/admin-panel/proofer/ProoferBoard";
import PublishQueueBoard from "@/app/admin-panel/proofer/publish/PublishQueueBoard";
import ClientContentBoard from "@/app/portal/[clientId]/content/ClientContentBoard";
import { AddAccountWizard } from "@/app/proofer/teams/AddAccountWizard";
import { CreateTeamForm } from "@/app/admin-panel/settings/teams/CreateTeamForm";

// ---------------------------------------------------------------------------
// Dev-only rendering harness.
//
// The Proofer surfaces sit behind auth and Supabase, so an agent (or anyone
// without credentials) can't load them to check how they actually render —
// which is how a batch of mobile layout bugs shipped: text clipped off-screen,
// a "Back" control invisible against its backdrop, labels wrapping onto three
// lines. All of those are pure layout, and pure layout needs no data.
//
// This route mounts the REAL components with fixture props so they can be
// loaded at any viewport and screenshotted. It renders nothing of its own that
// could drift from production — if a card looks right here, it's because the
// component is right.
//
// 404s outside development, and it isn't in the middleware matcher, so it never
// touches auth or Supabase.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const STEPS: StepId[] = [
  "welcome",
  "connect",
  "idea",
  "hook",
  "fun",
  "shorter",
  "image",
  "time",
  "save",
  "green",
  "board",
];

const VIEWS = [
  "index",
  "tour",
  "empty",
  "resume",
  "board",
  "publish",
  "portal",
  "teams",
] as const;
type View = (typeof VIEWS)[number];

export default async function DevPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; step?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "")
    ? (sp.view as View)
    : "index";
  const step = STEPS.includes(sp.step as StepId)
    ? (sp.step as StepId)
    : "welcome";

  if (view === "tour") {
    return (
      <OnboardingFlow
        base="/proofer"
        accountClientId="preview"
        initialStep={0}
        // demo: nothing is written, no server action fires, and it's the gate
        // that lets previewStep take effect.
        demo
        previewStep={step}
        metaResult={null}
        todayISO="2026-08-09"
      />
    );
  }

  if (view === "empty") {
    return (
      <Frame title="Empty board — no account yet">
        <EmptyBoardCard base="/proofer" />
      </Frame>
    );
  }

  if (view === "board") {
    // The board itself, empty of posts — enough to render its chrome: the
    // mobile toolbar (client · month · Ideas · Queue), the date strip and the
    // day view. This is the surface a poster spends all their time on.
    return (
      <Frame title="Board — one account, no posts">
        <ProoferBoard
          clients={[{ id: "preview", name: "OSHI" }]}
          months={[
            { value: "2026-08", label: "August 2026" },
            { value: "2026-09", label: "September 2026" },
          ]}
          initialClientId="preview"
          initialMonth="2026-08"
          initialPosts={[]}
          initialPillars={[]}
          initialIdeas={[]}
          initialPostIdeas={[]}
          basePath="/proofer"
          publishPath="/proofer/publish"
          standalone
        />
      </Frame>
    );
  }

  if (view === "publish") {
    // The publish queue with nothing queued — its chrome, empty state and the
    // Meta connection panel, which is where a poster lands from "Queue →".
    return (
      <Frame title="Publish queue — nothing queued">
        <PublishQueueBoard
          queueItems={[]}
          defaultScheduleValue="2026-08-12T09:00"
          clients={[{ id: "preview", name: "OSHI" }]}
          currentMonth="2026-08"
          backHref="/proofer"
        />
      </Frame>
    );
  }

  if (view === "portal") {
    // What a CLIENT sees when they open their review link — a different app
    // from the poster's board, and easy to forget when checking mobile.
    return (
      <Frame title="Client portal — content review">
        <ClientContentBoard
          clientId={1}
          month="2026-08"
          monthLabel="August 2026"
          prevMonth="2026-07"
          nextMonth="2026-09"
          timeZone="Etc/GMT"
          posts={[
            {
              id: "p1",
              postDate: "2026-08-15",
              platform: "instagram",
              caption:
                "What if your food actually tasted like food? Wild concept. Real flavors, real ingredients, real good times.",
              mediaUrls: [],
              publishTime: "18:30",
              status: "check",
              published: false,
              comments: [
                {
                  id: "c1",
                  comment: "Love this — can we try a shorter first line?",
                  author: "Client",
                  authorRole: "client",
                  resolved: false,
                  createdAt: "2026-08-09T10:00:00Z",
                },
              ],
            },
          ]}
        />
      </Frame>
    );
  }

  if (view === "teams") {
    // The two interactive pieces of the teams page. The page itself is a server
    // component that reads from Supabase, so only these render here.
    return (
      <Frame title="Teams — create team / add account">
        <div style={{ display: "grid", gap: 20 }}>
          <AddAccountWizard
            teams={[{ id: "t1", name: "Guestlist" }]}
            base="/proofer"
          />
          <CreateTeamForm />
        </div>
      </Frame>
    );
  }

  if (view === "resume") {
    return (
      <Frame title="Board — unfinished tour">
        <OnboardingResumeBanner href="/proofer/onboarding" step={4} total={11} />
      </Frame>
    );
  }

  return (
    <Frame title="Preview harness">
      <p style={{ fontSize: 14, color: "#52525b", lineHeight: 1.6 }}>
        Real components, fixture props, no auth. Load any of these at a phone
        viewport to check layout.
      </p>
      <ul style={{ fontSize: 14, lineHeight: 2, paddingLeft: 18 }}>
        <li>
          <a href="/dev/preview?view=empty">?view=empty</a> — the board&apos;s
          empty state
        </li>
        <li>
          <a href="/dev/preview?view=resume">?view=resume</a> — the resume banner
        </li>
        <li>
          <a href="/dev/preview?view=board">?view=board</a> — the board itself
        </li>
        <li>
          <a href="/dev/preview?view=publish">?view=publish</a> — the publish
          queue
        </li>
        <li>
          <a href="/dev/preview?view=portal">?view=portal</a> — the client
          review portal
        </li>
        <li>
          <a href="/dev/preview?view=teams">?view=teams</a> — teams forms
        </li>
        <li>
          <a href="/dev/preview?view=tour&step=welcome">?view=tour&amp;step=…</a>{" "}
          — any tour step: {STEPS.join(", ")}
        </li>
      </ul>
    </Frame>
  );
}

// Stands in for the board's page chrome (padding + max width) so a card is
// measured in roughly the space it really gets.
function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ padding: 24, background: "#f4f4f5", minHeight: "100dvh" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: "#a1a1aa",
            margin: "0 0 12px",
          }}
        >
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./onboarding.css";
import {
  startOnboardingAction,
  saveOnboardingStepAction,
  skipOnboardingAction,
  completeOnboardingAction,
  ensureOnboardingAccountAction,
  renameOnboardingAccountAction,
  pickTourConnectionAction,
  listMyAccountsAction,
  useExistingOnboardingAccountAction,
  getOnboardingOccupiedDatesAction,
  getTourConnectionAction,
  saveFirstPostAction,
  logOnboardingEvent,
} from "./actions";

type MyAccount = { clientId: string; name: string };

// ---------------------------------------------------------------------------
// The guided first-run tour. A single-post composer wired to the REAL AI,
// stock-image and save backends. It teaches by doing: the user turns a rough
// idea into a finished, saved Instagram post in ~2 minutes — and learns that
// yellow = Save (stays safe) and green = Schedule (go), without ever pressing
// green. Nothing here can publish.
// ---------------------------------------------------------------------------

type StepId =
  | "welcome"
  | "connect"
  | "idea"
  | "hook"
  | "fun"
  | "shorter"
  | "image"
  | "time"
  | "save"
  | "green"
  | "board"
  | "finish";

// Ordered steps that count toward the "Step X of 11" progress indicator.
const PROGRESS_STEPS: StepId[] = [
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

// Numeric step persisted server-side (1-based), used for resume.
const STEP_NUMBER: Record<StepId, number> = {
  welcome: 1,
  connect: 2,
  idea: 3,
  hook: 4,
  fun: 5,
  shorter: 6,
  image: 7,
  time: 8,
  save: 9,
  green: 10,
  board: 11,
  finish: 11,
};

type Photo = {
  id: string | number;
  thumb: string;
  full: string;
  photographer?: string;
};

type ConnectedAccount = { platform: string; accountId: string; accountName: string };

type MetaResult =
  | { status: "success"; platforms: string[]; accounts: ConnectedAccount[] }
  | { status: "error"; message: string }
  | null;

export type OnboardingFlowProps = {
  base: string; // "" on postproofer.com, else "/proofer"
  accountClientId: string | null;
  initialStep: number;
  demo: boolean; // replay / tour-again: never creates or saves real data
  metaResult: MetaResult;
  todayISO: string; // YYYY-MM-DD from the server (avoids hydration drift)
};

const AI_LABELS: Record<string, string> = {
  new_hook: "Hook",
  more_playful: "More Fun",
  shorter: "Shorter",
  regenerate: "Regenerate",
};

const DRAFT_KEY = "proofer_onboarding_draft_v1";

// The board's real traffic-light dot colours (STATUS_BUTTONS in ProoferBoard):
// check = yellow/Save, proofed = green/Schedule. Reused here so the tour's
// Save/Schedule buttons look exactly like the controls the user meets next.
const STATUS_DOT = { check: "#f59e0b", proofed: "#22c55e" } as const;

// A solid coloured status dot, drawn the same way the board draws it.
function TrafficDot({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid #e4e4e7",
        background: color,
      }}
    />
  );
}

export default function OnboardingFlow({
  base,
  accountClientId: initialAccountId,
  initialStep,
  demo,
  metaResult,
  todayISO,
}: OnboardingFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<StepId>("welcome");
  const [accountClientId, setAccountClientId] = useState<string | null>(
    initialAccountId
  );
  const [accountName, setAccountName] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Composer working state.
  const [idea, setIdea] = useState("");
  const [caption, setCaption] = useState("");
  const [prevCaption, setPrevCaption] = useState<string | null>(null); // for Undo
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [postDate, setPostDate] = useState(todayISO);
  const [publishTime, setPublishTime] = useState("18:30");
  const [captionFlash, setCaptionFlash] = useState(0); // bump to replay flash

  // Async / error state.
  const [busy, setBusy] = useState<string | null>(null); // which async op is running
  const [error, setError] = useState<string | null>(null);

  // Brief spotlight on the instruction card each time the step changes.
  const [coachSpotlight, setCoachSpotlight] = useState(false);

  // Connect step. The OAuth runs in a popup so this page never navigates away
  // (a cross-domain redirect could otherwise strand the user); these get filled
  // in by polling once the connection lands.
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>(
    metaResult?.status === "success" ? metaResult.platforms : []
  );
  // A Meta login can return many Pages/IG accounts — collect them so the user
  // can pick just one instead of attaching the whole portfolio.
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>(
    metaResult?.status === "success" ? metaResult.accounts : []
  );
  const [connecting, setConnecting] = useState(false);
  const [connectHint, setConnectHint] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  // Whether we still need the user to choose which account to keep.
  const needsPick = connectedAccounts.length > 1 && !pickedName;

  // Existing accounts the user could post to instead of a new one. null = not
  // loaded; [] = none (genuinely new user → auto-create).
  const [myAccounts, setMyAccounts] = useState<MyAccount[] | null>(null);
  // Days already taken on the chosen account — the tour only saves onto a blank
  // day so it can't overwrite existing content.
  const [occupied, setOccupied] = useState<Set<string>>(new Set());

  // Stock image step.
  const [imgQuery, setImgQuery] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [imgSearched, setImgSearched] = useState(false);

  const captionRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- resume / hydrate ---------------------------------------------------
  useEffect(() => {
    // Restore in-progress UI draft (survives refresh / navigation to Meta).
    let restored: Partial<{
      step: StepId;
      idea: string;
      caption: string;
      mediaUrls: string[];
      postDate: string;
      publishTime: string;
      accountName: string;
    }> = {};
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    if (restored.idea) setIdea(restored.idea);
    if (restored.caption) setCaption(restored.caption);
    if (Array.isArray(restored.mediaUrls)) setMediaUrls(restored.mediaUrls);
    if (restored.postDate) setPostDate(restored.postDate);
    if (restored.publishTime) setPublishTime(restored.publishTime);
    if (restored.accountName) setAccountName(restored.accountName);

    // Decide where to resume. initialStep 0 means "not started" (or an explicit
    // restart) → always begin at the welcome screen, ignoring any stale account
    // pointer so a clean restart really is clean.
    let start: StepId = "welcome";
    if (metaResult) {
      // Just came back from the Meta OAuth round-trip → land on connect.
      start = "connect";
    } else if (initialStep >= 1) {
      if (!initialAccountId) {
        start = "connect";
      } else {
        // Account exists. Restore the composer step if we have a local draft,
        // else restart the composer cleanly at "idea".
        const restoredStep = restored.step;
        const composerSteps: StepId[] = [
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
        if (restoredStep && composerSteps.includes(restoredStep) && restored.caption) {
          start = restoredStep;
        } else {
          start = "idea";
        }
      }
    }

    if (demo) start = "welcome";
    setStep(start);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the in-progress draft locally whenever it changes.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, idea, caption, mediaUrls, postDate, publishTime, accountName })
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, step, idea, caption, mediaUrls, postDate, publishTime, accountName]);

  // Persist coarse step server-side for cross-device resume (fire-and-forget).
  useEffect(() => {
    if (!hydrated || demo) return;
    if (step === "welcome" || step === "finish") return;
    void saveOnboardingStepAction(STEP_NUMBER[step]);
  }, [hydrated, demo, step]);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- helpers ------------------------------------------------------------
  const progressIndex = PROGRESS_STEPS.indexOf(step);
  const progressNumber = progressIndex >= 0 ? progressIndex + 1 : PROGRESS_STEPS.length;

  const goto = useCallback((next: StepId) => {
    setError(null);
    setStep(next);
    // Scroll the coach into view on mobile.
    if (typeof window !== "undefined" && window.innerWidth <= 820) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const flashCaption = useCallback(() => setCaptionFlash((n) => n + 1), []);

  // On each guided step, briefly dim the rest of the page so the instruction
  // card on the left reads clearly, then fade it back.
  useEffect(() => {
    if (!hydrated || step === "welcome" || step === "finish") return;
    setCoachSpotlight(true);
    const t = window.setTimeout(() => setCoachSpotlight(false), 4500);
    return () => window.clearTimeout(t);
  }, [hydrated, step]);

  const aiModify = useCallback(
    async (modifier: string, nextStep: StepId, eventName: string) => {
      const text = caption.trim();
      if (!text) return;
      setBusy(modifier);
      setError(null);
      const before = caption;
      try {
        const res = await fetch("/api/modify-caption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: accountClientId ?? "",
            text,
            modifier,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok || typeof data.value !== "string") {
          throw new Error(data?.error || "The AI is busy — try again.");
        }
        setPrevCaption(before);
        setCaption(data.value);
        flashCaption();
        if (!demo) void logOnboardingEvent(eventName, STEP_NUMBER[nextStep]);
        // Small beat so the flash is visible before the coach advances.
        window.setTimeout(() => goto(nextStep), 650);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
    },
    [caption, accountClientId, demo, flashCaption, goto]
  );

  const undoCaption = useCallback(() => {
    if (prevCaption == null) return;
    setCaption(prevCaption);
    setPrevCaption(null);
    flashCaption();
  }, [prevCaption, flashCaption]);

  // ---- step actions -------------------------------------------------------
  const handleStart = useCallback(async () => {
    setBusy("start");
    if (!demo) await startOnboardingAction();
    setBusy(null);
    goto("connect");
  }, [demo, goto]);

  const handleSkipAll = useCallback(async () => {
    setBusy("skip");
    if (!demo) await skipOnboardingAction(STEP_NUMBER[step]);
    clearDraft();
    router.push(`${base}/` || "/");
  }, [demo, step, base, router, clearDraft]);

  // On reaching the connect step, decide the account. A brand-new solo user
  // (no accounts) gets one auto-created; a user whose team already has accounts
  // is asked to reuse one or create a new one — so invited teammates don't get
  // a duplicate account.
  const accountInitRef = useRef(false);
  useEffect(() => {
    if (step !== "connect" || demo) return;
    if (accountClientId || accountInitRef.current) return;
    accountInitRef.current = true;
    setBusy("provision");
    void (async () => {
      const list = await listMyAccountsAction();
      if (!list.ok) {
        accountInitRef.current = false;
        setBusy(null);
        setError(list.error);
        return;
      }
      if (list.accounts.length === 0) {
        const res = await ensureOnboardingAccountAction();
        setBusy(null);
        if (!res.ok) {
          accountInitRef.current = false;
          setError(res.error);
          return;
        }
        setAccountClientId(res.clientId);
        if (res.name && !accountName) setAccountName(res.name);
      } else {
        setBusy(null);
        setMyAccounts(list.accounts); // show the account chooser
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, demo, accountClientId]);

  const chooseExistingAccount = useCallback(
    async (acc: MyAccount) => {
      setBusy("account");
      setError(null);
      const res = await useExistingOnboardingAccountAction(acc.clientId);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAccountClientId(res.clientId);
      setAccountName(res.name || acc.name);
      setMyAccounts(null);
      goto("idea"); // existing account: skip the connect lesson
    },
    [goto]
  );

  const createNewAccount = useCallback(async () => {
    setBusy("account");
    setError(null);
    const res = await ensureOnboardingAccountAction();
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAccountClientId(res.clientId);
    if (res.name) setAccountName(res.name);
    setMyAccounts(null); // stay on connect → Meta connect UI now shows
  }, []);

  // Load the taken days for the chosen account so date choices stay on blank
  // days only.
  useEffect(() => {
    if (demo || !accountClientId) return;
    void (async () => {
      const res = await getOnboardingOccupiedDatesAction(accountClientId);
      if (res.ok) setOccupied(new Set(res.dates));
    })();
  }, [demo, accountClientId]);

  const handleRename = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || demo) return;
      await renameOnboardingAccountAction(trimmed);
    },
    [demo]
  );

  // Let the user keep just one account when a login returned several.
  const handlePickAccount = useCallback(
    async (acc: ConnectedAccount) => {
      if (!accountClientId) return;
      setPicking(true);
      setError(null);
      const res = await pickTourConnectionAction(
        accountClientId,
        acc.platform,
        acc.accountId
      );
      setPicking(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConnectedPlatforms(res.platforms);
      setPickedName(res.name || acc.accountName);
    },
    [accountClientId]
  );

  // Once connected (and, when several were returned, once one is chosen),
  // celebrate briefly then move on.
  useEffect(() => {
    if (step !== "connect") return;
    if (connectedPlatforms.length === 0) return;
    if (needsPick) return; // wait for the user to choose
    const t = window.setTimeout(() => goto("idea"), 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, connectedPlatforms.length, needsPick]);

  // Open the Meta OAuth in a POPUP (matching the publish page). The onboarding
  // page stays put, so a cross-domain redirect during OAuth can never strand the
  // user on another surface — whatever happens in the popup, they're still on
  // the guide. We poll for the connection landing, then advance.
  const openConnectPopup = useCallback(() => {
    if (!accountClientId) return;
    setError(null);
    setConnectHint(null);
    // Run the whole flow on THIS origin. The connect route is now host-aware, so
    // on a standalone Proofer host the OAuth stays on that host — cookies,
    // callback and session all share the domain, and it can't detour to the
    // main app's portal.
    const url = `/api/meta/connect?clientId=${encodeURIComponent(accountClientId)}`;
    const popup = window.open(url, "metaConnect", "width=600,height=760");
    if (!popup) {
      setConnectHint("Please allow pop-ups to connect, then try again — or skip for now.");
      return;
    }
    popup.focus();
    setConnecting(true);
    let elapsed = 0;
    const timer = window.setInterval(async () => {
      elapsed += 1500;
      const res = await getTourConnectionAction(accountClientId);
      if (res.ok && res.accounts.length > 0) {
        window.clearInterval(timer);
        try { popup.close(); } catch { /* ignore */ }
        setConnecting(false);
        setConnectedAccounts(res.accounts);
        setConnectedPlatforms(res.platforms);
        if (!demo) void logOnboardingEvent("social_connected", 2, { platforms: res.platforms });
        return;
      }
      if (popup.closed) {
        window.clearInterval(timer);
        setConnecting(false);
        // One last check in case it landed just before they closed it.
        const done = await getTourConnectionAction(accountClientId);
        if (done.ok && done.accounts.length > 0) {
          setConnectedAccounts(done.accounts);
          setConnectedPlatforms(done.platforms);
        } else {
          setConnectHint("Didn't finish connecting. You can try again, or skip for now.");
        }
        return;
      }
      if (elapsed > 180000) {
        window.clearInterval(timer);
        setConnecting(false);
      }
    }, 1500);
  }, [accountClientId, demo]);

  const handleGenerate = useCallback(async () => {
    const seed = idea.trim();
    if (seed.length < 4) {
      setError("Tell Proofer a little more about your idea first.");
      return;
    }
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch("/api/modify-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: accountClientId ?? "",
          text: seed,
          modifier: "regenerate",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || typeof data.value !== "string") {
        throw new Error(data?.error || "The AI is busy — try again.");
      }
      setCaption(data.value);
      setPrevCaption(null);
      flashCaption();
      if (!demo) void logOnboardingEvent("first_post_generated", STEP_NUMBER.hook);
      window.setTimeout(() => goto("hook"), 500);
    } catch (e) {
      // Keep their original text; offer Try Again.
      setError(e instanceof Error ? e.message : "Couldn't generate — try again.");
    } finally {
      setBusy(null);
    }
  }, [idea, accountClientId, demo, flashCaption, goto]);

  const runImageSearch = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (!query) return;
      setBusy("image-search");
      setError(null);
      setImgSearched(true);
      try {
        const res = await fetch(
          `/api/suggest-images?q=${encodeURIComponent(query)}&per_page=12`
        );
        const data = await res.json();
        if (!res.ok || !data?.ok || !Array.isArray(data.photos)) {
          throw new Error(data?.error || "Image search is unavailable.");
        }
        setPhotos(data.photos as Photo[]);
        if ((data.photos as Photo[]).length === 0) {
          setError("No images for that search — try different words, or skip.");
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Image search failed — you can skip this."
        );
      } finally {
        setBusy(null);
      }
    },
    []
  );

  // Auto-seed the image search from the caption when entering the image step.
  useEffect(() => {
    if (step !== "image" || imgSearched) return;
    const seed =
      idea.trim().split(/\s+/).slice(0, 5).join(" ") ||
      caption.trim().split(/\s+/).slice(0, 4).join(" ");
    if (seed) {
      setImgQuery(seed);
      void runImageSearch(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const selectPhoto = useCallback(
    (p: Photo) => {
      setMediaUrls([p.full]);
      if (!demo) void logOnboardingEvent("stock_image_selected", STEP_NUMBER.image);
      goto("time");
    },
    [demo, goto]
  );

  const applyPreset = useCallback(
    (date: string, time: string) => {
      setError(null);
      setPostDate(date);
      setPublishTime(time);
    },
    []
  );

  // Custom date entry — only free days are allowed, so the tour never
  // overwrites an existing post.
  const handleDatePick = useCallback(
    (date: string) => {
      if (occupied.has(date)) {
        setError("That day already has a post — pick a free day.");
        return;
      }
      setError(null);
      setPostDate(date);
    },
    [occupied]
  );

  const handleTimeChosen = useCallback(() => {
    // Never let them proceed on a taken day — the tour must not overwrite a
    // real post.
    if (occupied.has(postDate)) {
      setError("That day already has a post — pick a free day.");
      return;
    }
    if (!demo) void logOnboardingEvent("schedule_time_selected", STEP_NUMBER.save, {
      postDate,
      publishTime,
    });
    goto("save");
  }, [demo, occupied, postDate, publishTime, goto]);

  const handleSave = useCallback(async () => {
    setBusy("save");
    setError(null);
    if (demo) {
      setBusy(null);
      goto("green");
      return;
    }
    if (!accountClientId) {
      setBusy(null);
      setError("Your account is missing — please restart the tour.");
      return;
    }
    const res = await saveFirstPostAction({
      clientId: accountClientId,
      caption,
      mediaUrls,
      postDate,
      publishTime,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error); // do NOT advance
      return;
    }
    goto("green");
  }, [demo, accountClientId, caption, mediaUrls, postDate, publishTime, goto]);

  const handleGreenAck = useCallback(() => {
    if (!demo) void logOnboardingEvent("green_explained", STEP_NUMBER.green);
    goto("board");
  }, [demo, goto]);

  const finish = useCallback(async () => {
    setBusy("finish");
    if (!demo) await completeOnboardingAction();
    clearDraft();
    // Land on THIS account and the post's month, not whatever the board would
    // default to (a last-viewed / first client, current month) — otherwise a
    // user whose team already has other accounts lands on the wrong, full board
    // and can't find the post they just made.
    const params = new URLSearchParams({ tour: "done", d: postDate });
    if (accountClientId) params.set("client", accountClientId);
    params.set("month", postDate.slice(0, 7));
    router.push(`${base}/?${params.toString()}`);
  }, [demo, base, postDate, accountClientId, router, clearDraft]);

  // ---- derived display ----------------------------------------------------
  // The name shown on the post preview: the CONNECTED social account's real
  // name/handle when there is one (the account they picked / linked), not a
  // slug of the brand name. Falls back to the brand name if not connected.
  const previewName = useMemo(() => {
    const connected =
      pickedName ||
      (connectedAccounts.length === 1 ? connectedAccounts[0]?.accountName : "") ||
      connectedAccounts.find((a) => a.platform === "instagram")?.accountName ||
      "";
    return (connected || accountName || "").trim() || "your account";
  }, [pickedName, connectedAccounts, accountName]);

  const scheduleLabel = useMemo(() => formatSchedule(postDate, publishTime), [
    postDate,
    publishTime,
  ]);
  const presets = useMemo(() => buildPresets(todayISO, occupied), [todayISO, occupied]);

  // If the currently-chosen day is taken on this account, snap to the first
  // free suggestion so the user never starts on an occupied day.
  useEffect(() => {
    if (occupied.has(postDate) && presets[0]) {
      setPostDate(presets[0].date);
      setPublishTime(presets[0].time);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupied]);

  if (!hydrated) {
    return (
      <div className="ob-root" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <span className="ob-spinner ob-spinner-dark" />
      </div>
    );
  }

  // Full-screen moments: welcome + finish.
  if (step === "welcome") {
    return (
      <WelcomeScreen
        demo={demo}
        busy={busy}
        onStart={handleStart}
        onSkip={handleSkipAll}
      />
    );
  }
  if (step === "finish") {
    return null;
  }

  // ---- the guided composer ------------------------------------------------
  const coach = coachFor(step, {
    accountName,
    scheduleLabel,
    connectedPlatforms,
  });

  return (
    <div className="ob-root">
      <TopBar
        progressNumber={progressNumber}
        total={PROGRESS_STEPS.length}
        demo={demo}
        onSkip={handleSkipAll}
      />

      {/* Brief page dim that spotlights the instruction card on each step. */}
      <div className={"ob-dim-overlay" + (coachSpotlight ? " on" : "")} aria-hidden />

      <div className="ob-stage">
        {/* Coach-mark rail */}
        <div className={"ob-coach" + (coachSpotlight ? " ob-coach-lift" : "")}>
          <CoachCard
            key={step}
            eyebrow={`Step ${progressNumber} of ${PROGRESS_STEPS.length}`}
            title={coach.title}
            body={coach.body}
            example={coach.example}
            tone={coach.tone}
          />
          {error && (
            <div style={errorBox} role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Working surface */}
        <div>
          {step === "connect" ? (
            <ConnectPanel
              accountName={accountName}
              setAccountName={setAccountName}
              accountClientId={accountClientId}
              onConnect={openConnectPopup}
              connecting={connecting}
              connectHint={connectHint}
              connectedPlatforms={connectedPlatforms}
              connectedAccounts={connectedAccounts}
              needsPick={needsPick}
              picking={picking}
              pickedName={pickedName}
              onPick={handlePickAccount}
              myAccounts={myAccounts}
              onChooseExisting={chooseExistingAccount}
              onCreateNew={createNewAccount}
              busy={busy}
              demo={demo}
              metaError={metaResult?.status === "error" ? metaResult.message : null}
              onRename={handleRename}
              onContinue={() => goto("idea")}
            />
          ) : (
            <Composer
              step={step}
              busy={busy}
              // idea
              idea={idea}
              setIdea={setIdea}
              onGenerate={handleGenerate}
              // caption
              caption={caption}
              setCaption={setCaption}
              captionRef={captionRef}
              captionFlash={captionFlash}
              canUndo={prevCaption != null}
              onUndo={undoCaption}
              onHook={() => aiModify("new_hook", "fun", "hook_used")}
              onFun={() => aiModify("more_playful", "shorter", "more_fun_used")}
              onShorter={() => aiModify("shorter", "image", "shorter_used")}
              // image
              accountName={accountName}
              previewName={previewName}
              mediaUrls={mediaUrls}
              imgQuery={imgQuery}
              setImgQuery={setImgQuery}
              photos={photos}
              onSearch={() => runImageSearch(imgQuery)}
              onSelectPhoto={selectPhoto}
              onSkipImage={() => goto("time")}
              // time
              presets={presets}
              postDate={postDate}
              publishTime={publishTime}
              todayISO={todayISO}
              dateTaken={occupied.has(postDate)}
              onPreset={applyPreset}
              onDatePick={handleDatePick}
              setPublishTime={setPublishTime}
              onTimeChosen={handleTimeChosen}
              scheduleLabel={scheduleLabel}
              // save / green / board
              onSave={handleSave}
              onGreenAck={handleGreenAck}
              onFinish={finish}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Sub-components                                                             */
/* ========================================================================== */

function TopBar({
  progressNumber,
  total,
  demo,
  onSkip,
}: {
  progressNumber: number;
  total: number;
  demo: boolean;
  onSkip: () => void;
}) {
  return (
    <div style={topBarStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={brandStyle}>
          Post<span style={{ color: "#6d28d9" }}>Proofer</span>
        </span>
        {demo && <span style={demoPill}>Tour replay · nothing is saved</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", gap: 4 }} aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 18,
                height: 5,
                borderRadius: 3,
                background: i < progressNumber ? "#6d28d9" : "#e4e4e7",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12, color: "#71717a", fontWeight: 600 }}>
          Getting started · {progressNumber} of {total}
        </span>
        <button type="button" onClick={onSkip} style={skipLinkStyle}>
          {demo ? "Exit" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}

function CoachCard({
  eyebrow,
  title,
  body,
  example,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  example?: string;
  tone?: "default" | "yellow" | "green";
}) {
  const accent =
    tone === "yellow" ? "#f59e0b" : tone === "green" ? "#22c55e" : "#6d28d9";
  return (
    <div className="ob-pop" style={{ ...coachCardStyle, borderTopColor: accent }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: accent, textTransform: "uppercase" }}>
        {eyebrow}
      </div>
      <h2 style={{ margin: "8px 0 6px", fontSize: 19, fontWeight: 800, lineHeight: 1.25 }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: "#3f3f46", lineHeight: 1.5 }}>{body}</p>
      {example && (
        <p style={exampleStyle}>
          e.g. “{example}”
        </p>
      )}
    </div>
  );
}

function WelcomeScreen({
  demo,
  busy,
  onStart,
  onSkip,
}: {
  demo: boolean;
  busy: string | null;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="ob-root" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div className="ob-fade-up" style={welcomeCardStyle}>
        <div style={{ fontSize: 40 }}>👋</div>
        <h1 style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 850, letterSpacing: -0.5 }}>
          Let&apos;s create your first post
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 16, color: "#52525b", lineHeight: 1.55, maxWidth: 460 }}>
          We&apos;ll show you how Proofer works by making one together. It takes
          about 2 minutes — and you stay in control the whole way.
        </p>
        <button
          type="button"
          className="ob-btn"
          onClick={onStart}
          disabled={!!busy}
          style={{ ...primaryBtn, marginTop: 26, padding: "14px 26px", fontSize: 16 }}
        >
          {busy === "start" ? <span className="ob-spinner" /> : null}
          Let&apos;s go →
        </button>
        <button type="button" onClick={onSkip} style={{ ...skipLinkStyle, marginTop: 14 }}>
          {demo ? "Exit tour" : "Skip for now"}
        </button>
        {!demo && (
          <p style={{ margin: "18px 0 0", fontSize: 12, color: "#a1a1aa" }}>
            You can restart this tour any time from the “?” menu.
          </p>
        )}
      </div>
    </div>
  );
}

function ConnectPanel({
  accountName,
  setAccountName,
  accountClientId,
  onConnect,
  connecting,
  connectHint,
  connectedPlatforms,
  connectedAccounts,
  needsPick,
  picking,
  pickedName,
  onPick,
  myAccounts,
  onChooseExisting,
  onCreateNew,
  busy,
  demo,
  metaError,
  onRename,
  onContinue,
}: {
  accountName: string;
  setAccountName: (v: string) => void;
  accountClientId: string | null;
  onConnect: () => void;
  connecting: boolean;
  connectHint: string | null;
  connectedPlatforms: string[];
  connectedAccounts: ConnectedAccount[];
  needsPick: boolean;
  picking: boolean;
  pickedName: string | null;
  onPick: (acc: ConnectedAccount) => void;
  myAccounts: MyAccount[] | null;
  onChooseExisting: (acc: MyAccount) => void;
  onCreateNew: () => void;
  busy: string | null;
  demo: boolean;
  metaError: string | null;
  onRename: (name: string) => void;
  onContinue: () => void;
}) {
  const ready = !!accountClientId || demo;
  const provisioning = busy === "provision";
  const igOn = connectedPlatforms.includes("instagram");
  const fbOn = connectedPlatforms.includes("facebook");
  const anyOn = igOn || fbOn;
  const [editingName, setEditingName] = useState(false);

  // The user's team already has accounts → let them reuse one or make a new
  // one, so an invited teammate doesn't get a duplicate account.
  if (!accountClientId && myAccounts && myAccounts.length > 0) {
    return (
      <div style={cardStyle} className="ob-pop">
        <h3 style={{ ...cardTitle, fontSize: 16 }}>Where should this post go?</h3>
        <p style={cardSub}>
          Post to one of your existing accounts, or start a brand-new one.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
          {myAccounts.map((acc) => (
            <button
              key={acc.clientId}
              type="button"
              onClick={() => onChooseExisting(acc)}
              disabled={busy === "account"}
              style={pickRowStyle}
            >
              <span style={{ fontSize: 18 }}>📋</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {acc.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9" }}>Use this →</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ob-btn"
          onClick={onCreateNew}
          disabled={busy === "account"}
          style={{ ...secondaryBtn, marginTop: 12 }}
        >
          {busy === "account" ? <span className="ob-spinner ob-spinner-dark" /> : "＋"} Create a new account
        </button>
      </div>
    );
  }

  // The login returned several accounts — let the user keep just one. Instagram
  // accounts first (that's what the post targets), then Facebook Pages.
  if (needsPick) {
    const sorted = [...connectedAccounts].sort((a, b) =>
      a.platform === b.platform ? 0 : a.platform === "instagram" ? -1 : 1
    );
    return (
      <div style={cardStyle} className="ob-pop">
        <h3 style={{ ...cardTitle, fontSize: 16 }}>Which account do you want to post to?</h3>
        <p style={cardSub}>
          Your login has access to {connectedAccounts.length} accounts. Pick the
          one for this brand — you can add others later from Team settings.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
          {sorted.map((acc) => {
            const isIg = acc.platform === "instagram";
            return (
              <button
                key={`${acc.platform}:${acc.accountId}`}
                type="button"
                onClick={() => onPick(acc)}
                disabled={picking}
                style={pickRowStyle}
              >
                <span style={{ fontSize: 18 }}>{isIg ? "📸" : "📘"}</span>
                <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, textAlign: "left" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {isIg ? "@" : ""}
                    {acc.accountName}
                  </span>
                  <span style={{ fontSize: 11.5, color: "#a1a1aa" }}>
                    {isIg ? "Instagram" : "Facebook Page"}
                  </span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9" }}>
                  {picking ? "" : "Use this →"}
                </span>
              </button>
            );
          })}
        </div>
        {picking && (
          <p style={{ ...cardSub, marginTop: 12, marginBottom: 0 }}>
            <span className="ob-spinner ob-spinner-dark" /> Setting that as your account…
          </p>
        )}
      </div>
    );
  }

  // Connected (and, if several, one chosen) → confirmation + auto-advance.
  if (anyOn) {
    return (
      <div style={cardStyle} className="ob-pop">
        <div style={{ ...successPill, display: "inline-flex", fontSize: 15, padding: "10px 18px" }}>
          ✓ {pickedName ? `${pickedName} · ` : ""}
          {igOn ? "Instagram" : ""}
          {igOn && fbOn ? " & " : ""}
          {fbOn ? "Facebook" : ""} connected
        </div>
        <p style={{ ...cardSub, marginTop: 14, marginBottom: 0 }}>
          Nice — that&apos;s your posting account linked. Taking you to your first post…
        </p>
        <div style={{ marginTop: 14 }}>
          <button type="button" className="ob-btn" onClick={onContinue} style={primaryBtn}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 26 }}>📸</span>
        <h3 style={{ ...cardTitle, fontSize: 17 }}>Connect your Instagram or Facebook</h3>
      </div>
      <p style={cardSub}>
        This is how Proofer posts for you. Connecting opens Meta&apos;s secure
        login and takes a few seconds — your account is already set up and
        waiting.
      </p>

      {(metaError || connectHint) && (
        <div style={errorBox}>
          {metaError
            ? `Couldn't connect: ${metaError} — you can try again, or skip and connect later.`
            : connectHint}
        </div>
      )}

      {/* The real connection — opens in a popup so this page never navigates
          away (and can't strand the user on a cross-domain redirect). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {demo ? (
          <span style={{ ...primaryBtn, opacity: 0.6, borderRadius: 10, textAlign: "center" }}>
            🔗 Connect (disabled in tour replay)
          </span>
        ) : provisioning || !ready ? (
          <span style={{ ...primaryBtn, opacity: 0.7, borderRadius: 10, display: "inline-flex", justifyContent: "center", gap: 8 }}>
            <span className="ob-spinner" /> Setting up your account…
          </span>
        ) : connecting ? (
          <span style={{ ...primaryBtn, opacity: 0.85, borderRadius: 10, display: "inline-flex", justifyContent: "center", gap: 8 }}>
            <span className="ob-spinner" /> Opening Facebook… finish in the pop-up
          </span>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="ob-btn ob-highlight"
            style={{ ...primaryBtn, justifyContent: "center", fontSize: 15, padding: "13px 20px" }}
          >
            🔗 Connect Instagram / Facebook
          </button>
        )}

        <button type="button" onClick={onContinue} style={{ ...skipLinkStyle, alignSelf: "flex-start" }} disabled={provisioning}>
          Skip for now — I&apos;ll connect later →
        </button>
      </div>

      {/* Quiet, optional rename of the auto-created account. */}
      {ready && !demo && (
        <div style={{ marginTop: 18, borderTop: "1px solid #f0f0f2", paddingTop: 14 }}>
          {editingName ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Your business name"
                style={{ ...inputStyle, maxWidth: 260, flex: 1 }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename(accountName);
                    setEditingName(false);
                  }
                }}
              />
              <button
                type="button"
                className="ob-btn"
                style={secondaryBtn}
                onClick={() => {
                  onRename(accountName);
                  setEditingName(false);
                }}
              >
                Save name
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: "#a1a1aa" }}>
              Posting as <strong style={{ color: "#52525b" }}>{accountName || "your account"}</strong>{" "}
              ·{" "}
              <button
                type="button"
                onClick={() => setEditingName(true)}
                style={{ ...skipLinkStyle, fontSize: 12.5 }}
              >
                Rename
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type ComposerProps = {
  step: StepId;
  busy: string | null;
  idea: string;
  setIdea: (v: string) => void;
  onGenerate: () => void;
  caption: string;
  setCaption: (v: string) => void;
  captionRef: React.RefObject<HTMLTextAreaElement | null>;
  captionFlash: number;
  canUndo: boolean;
  onUndo: () => void;
  onHook: () => void;
  onFun: () => void;
  onShorter: () => void;
  accountName: string;
  previewName: string;
  mediaUrls: string[];
  imgQuery: string;
  setImgQuery: (v: string) => void;
  photos: Photo[];
  onSearch: () => void;
  onSelectPhoto: (p: Photo) => void;
  onSkipImage: () => void;
  presets: { label: string; date: string; time: string }[];
  postDate: string;
  publishTime: string;
  todayISO: string;
  dateTaken: boolean;
  onPreset: (date: string, time: string) => void;
  onDatePick: (v: string) => void;
  setPublishTime: (v: string) => void;
  onTimeChosen: () => void;
  scheduleLabel: string;
  onSave: () => void;
  onGreenAck: () => void;
  onFinish: () => void;
};

function Composer(props: ComposerProps) {
  const { step } = props;
  const showIdea = step === "idea";
  const hasCaption = props.caption.trim().length > 0;
  const aiStep = step === "hook" || step === "fun" || step === "shorter";
  const showImage = step === "image";
  const showTime = step === "time";
  const showSave = step === "save";
  const showGreen = step === "green";
  const showBoard = step === "board";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* IDEA */}
      {showIdea && (
        <div style={cardStyle} className="ob-fade-up">
          <label style={cardTitle}>What would you like to post about?</label>
          <p style={cardSub}>
            Just write a few words about what you offer or what you want to say.
          </p>
          <textarea
            className="ob-highlight"
            value={props.idea}
            onChange={(e) => props.setIdea(e.target.value)}
            rows={4}
            placeholder="Tell people about our new summer menu and invite them to come this weekend."
            style={textareaStyle}
            autoFocus
          />
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="ob-btn"
              onClick={props.onGenerate}
              disabled={props.busy === "generate" || props.idea.trim().length < 4}
              style={primaryBtn}
            >
              {props.busy === "generate" ? (
                <>
                  <span className="ob-spinner" /> Writing your post…
                </>
              ) : (
                "Create my post →"
              )}
            </button>
          </div>
        </div>
      )}

      {/* CAPTION + AI TOOLS */}
      {!showIdea && hasCaption && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={cardTitle}>Your post</span>
            {props.canUndo && (
              <button type="button" onClick={props.onUndo} style={undoBtn} title="Undo last change">
                ↶ Undo
              </button>
            )}
          </div>
          <textarea
            key={`cap-${props.captionFlash}`}
            ref={props.captionRef}
            className={props.captionFlash ? "ob-changed" : undefined}
            value={props.caption}
            onChange={(e) => props.setCaption(e.target.value)}
            rows={7}
            style={{
              ...textareaStyle,
              ...(aiStep ? {} : {}),
            }}
          />

          {/* AI editing chips */}
          <div
            className={aiStep ? "ob-highlight" : undefined}
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, padding: aiStep ? 6 : 0, borderRadius: 12 }}
          >
            <AiChip
              label={AI_LABELS.new_hook}
              hint="stronger opening"
              active={step === "hook"}
              running={props.busy === "new_hook"}
              disabled={!!props.busy || step !== "hook"}
              onClick={props.onHook}
            />
            <AiChip
              label={AI_LABELS.more_playful}
              hint="more personality"
              active={step === "fun"}
              running={props.busy === "more_playful"}
              disabled={!!props.busy || step !== "fun"}
              onClick={props.onFun}
            />
            <AiChip
              label={AI_LABELS.shorter}
              hint="trim it down"
              active={step === "shorter"}
              running={props.busy === "shorter"}
              disabled={!!props.busy || step !== "shorter"}
              onClick={props.onShorter}
            />
          </div>
        </div>
      )}

      {/* IMAGE */}
      {showImage && (
        <div style={cardStyle} className="ob-fade-up">
          <span style={cardTitle}>Let&apos;s give your post an image</span>
          <p style={cardSub}>Search free stock photos and pick one you like.</p>
          <div className="ob-highlight" style={{ display: "flex", gap: 8, padding: 6, borderRadius: 12 }}>
            <input
              value={props.imgQuery}
              onChange={(e) => props.setImgQuery(e.target.value)}
              placeholder="Stock images — e.g. summer cocktails"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && props.onSearch()}
            />
            <button type="button" className="ob-btn" onClick={props.onSearch} disabled={props.busy === "image-search"} style={primaryBtn}>
              {props.busy === "image-search" ? <span className="ob-spinner" /> : "Search"}
            </button>
          </div>

          <div style={photoGrid}>
            {props.photos.map((p) => (
              <button key={String(p.id)} type="button" onClick={() => props.onSelectPhoto(p)} style={photoBtn} title="Choose this image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" style={photoImg} />
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={props.onSkipImage} style={undoBtn}>
              Skip image for now →
            </button>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW (from image step onward) */}
      {(showImage || showTime || showSave || showGreen || showBoard) && hasCaption && (
        <PostPreview displayName={props.previewName} caption={props.caption} mediaUrls={props.mediaUrls} />
      )}

      {/* TIME */}
      {showTime && (
        <div style={cardStyle} className="ob-fade-up">
          <span style={cardTitle}>When would you like this to go out?</span>
          <p style={cardSub}>Pick a suggested time or choose your own. (You&apos;re just setting it — nothing sends yet.)</p>
          <div className="ob-highlight" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8, borderRadius: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {props.presets.map((pre) => {
                const on = pre.date === props.postDate && pre.time === props.publishTime;
                return (
                  <button
                    key={pre.label}
                    type="button"
                    onClick={() => props.onPreset(pre.date, pre.time)}
                    style={on ? presetBtnOn : presetBtn}
                  >
                    {pre.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#71717a", fontWeight: 600 }}>Or choose:</span>
              <input
                type="date"
                value={props.postDate}
                min={props.todayISO}
                onChange={(e) => props.onDatePick(e.target.value)}
                style={inputStyle}
              />
              <input type="time" value={props.publishTime} onChange={(e) => props.setPublishTime(e.target.value)} style={inputStyle} />
            </div>
            <span style={{ fontSize: 12, color: "#a1a1aa" }}>
              We only show free days so your first post won&apos;t clash with anything.
            </span>
          </div>
          {props.dateTaken ? (
            <div style={{ ...scheduleBanner, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
              That day already has a post — pick a free day above.
            </div>
          ) : (
            <div style={scheduleBanner}>
              📅 Instagram • <strong>{props.scheduleLabel}</strong>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="ob-btn"
              onClick={props.onTimeChosen}
              disabled={props.dateTaken}
              style={primaryBtn}
            >
              Looks good →
            </button>
          </div>
        </div>
      )}

      {/* SAVE (YELLOW) + SCHEDULE (GREEN) action bar */}
      {(showSave || showGreen || showBoard) && (
        <div className="ob-actionbar">
          <div style={cardStyle}>
            {showSave && (
              <p style={{ ...cardSub, marginBottom: 12 }}>
                <strong style={{ color: "#18181b" }}>Yellow means SAVE.</strong> Your post stays
                safely in Proofer and won&apos;t be published. Press it to save your first post.
              </p>
            )}
            {showGreen && (
              <p style={{ ...cardSub, marginBottom: 12 }}>
                <strong style={{ color: "#18181b" }}>Green means GO.</strong> When you&apos;re happy
                with a post, press green and Proofer schedules it for the time you chose —{" "}
                <em>{props.scheduleLabel}</em>. We&apos;re leaving your first post <strong>saved</strong> for
                now. Press green whenever you&apos;re ready.
              </p>
            )}

            {!showBoard && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {/* YELLOW = SAVE — matches the board's traffic-light dot */}
                <button
                  type="button"
                  className={"ob-btn" + (showSave ? " ob-highlight" : "")}
                  onClick={props.onSave}
                  disabled={!showSave || props.busy === "save"}
                  style={yellowBtn}
                  aria-label="Save post (yellow)"
                >
                  {props.busy === "save" ? (
                    <span className="ob-spinner ob-spinner-dark" />
                  ) : (
                    <TrafficDot color={STATUS_DOT.check} />
                  )}{" "}
                  Save
                </button>

                {/* GREEN = SCHEDULE (demonstrated, not pressed) */}
                <button
                  type="button"
                  className={"ob-btn" + (showGreen ? " ob-highlight" : "")}
                  onClick={showGreen ? props.onGreenAck : undefined}
                  disabled={showSave}
                  title={showSave ? "We'll get to green next" : "Green = Schedule"}
                  style={{ ...greenBtn, ...(showSave ? { opacity: 0.5 } : {}) }}
                  aria-label="Schedule post (green)"
                >
                  <TrafficDot color={STATUS_DOT.proofed} /> Schedule
                </button>

                {showSave && (
                  <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                    Nothing posts automatically — you&apos;re in control.
                  </span>
                )}
              </div>
            )}

            {showGreen && (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="ob-btn" onClick={props.onGreenAck} style={primaryBtn}>
                  Got it →
                </button>
              </div>
            )}

            {showBoard && (
              <FinishBlock scheduleLabel={props.scheduleLabel} onFinish={props.onFinish} busy={props.busy} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AiChip({
  label,
  hint,
  active,
  running,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  running: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...aiChipStyle,
        ...(active ? aiChipActive : {}),
        ...(disabled && !active ? { opacity: 0.5 } : {}),
      }}
    >
      {running ? <span className="ob-spinner ob-spinner-dark" /> : null}
      <span style={{ fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 11, color: active ? "#5b21b6" : "#a1a1aa" }}>· {hint}</span>
    </button>
  );
}

function PostPreview({
  displayName,
  caption,
  mediaUrls,
}: {
  displayName: string;
  caption: string;
  mediaUrls: string[];
}) {
  // The real connected social account name — shown as-is, not slugified.
  const name = (displayName || "your account").trim();
  return (
    <div className="ob-fade-up" style={previewCard}>
      <div style={previewHeader}>
        <div style={previewAvatar}>{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
          <span style={{ fontSize: 11, color: "#a1a1aa" }}>Instagram · preview</span>
        </div>
      </div>
      {mediaUrls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrls[0]} alt="" style={previewImage} />
      ) : (
        <div style={previewImagePlaceholder}>🖼️ Your image will appear here</div>
      )}
      <div style={{ padding: "12px 14px" }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#27272a" }}>
          <strong>{name}</strong> {caption}
        </p>
      </div>
    </div>
  );
}

function FinishBlock({
  scheduleLabel,
  onFinish,
  busy,
}: {
  scheduleLabel: string;
  onFinish: () => void;
  busy: string | null;
}) {
  return (
    <div className="ob-fade-up" style={{ marginTop: 6 }}>
      <div style={{ fontSize: 34 }}>🎉</div>
      <h3 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 850 }}>You&apos;re ready</h3>
      <p style={{ ...cardSub, marginBottom: 10 }}>
        You just created your first post with Proofer — it&apos;s <strong>saved</strong> and waiting
        for {scheduleLabel}.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={legendYellow}>🟡 Yellow = Saved</span>
        <span style={legendGreen}>🟢 Green = Scheduled</span>
      </div>
      <p style={{ ...cardSub, marginTop: 12 }}>
        <strong style={{ color: "#18181b" }}>We did NOT schedule this post.</strong> Mark it green
        when you&apos;re happy for it to go out. Your post lives on your board — tap it any time to
        reopen and edit.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="ob-btn" onClick={onFinish} disabled={!!busy} style={primaryBtn}>
          {busy === "finish" ? <span className="ob-spinner" /> : null}
          Go to my posts
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Content + helpers                                                          */
/* ========================================================================== */

function coachFor(
  step: StepId,
  ctx: { accountName: string; scheduleLabel: string; connectedPlatforms: string[] }
): { title: string; body: string; example?: string; tone?: "default" | "yellow" | "green" } {
  switch (step) {
    case "connect":
      return {
        title: "First, connect a social account",
        body: "Link the Instagram or Facebook you want to post to. It opens Meta's secure login — or skip and connect later. Either way, you'll build a real post next.",
      };
    case "idea":
      return {
        title: "Give Proofer a rough idea",
        body: "Type a sentence or two about what you want to say. Proofer turns it into a real caption.",
        example: "Tell people about our new summer menu and invite them to come this weekend.",
      };
    case "hook":
      return {
        title: "Want a stronger opening?",
        body: "Press Hook and Proofer rewrites just your first line to grab attention.",
      };
    case "fun":
      return {
        title: "Change the personality",
        body: "Press More Fun to give it more energy. You can change the tone whenever you like.",
      };
    case "shorter":
      return {
        title: "Too much? Make it shorter",
        body: "Press Shorter to trim it down. You're always in control — edit it yourself or use Undo. Nothing posts automatically.",
      };
    case "image":
      return {
        title: "Add an image",
        body: "Search free stock photos and choose one you like. This is where your rough idea starts to look like a real post.",
      };
    case "time":
      return {
        title: "Choose when it could post",
        body: "Pick a suggested time or set your own. You're only choosing a time — nothing sends yet.",
      };
    case "save":
      return {
        title: "Yellow means SAVE",
        body: "Press the yellow Save button. Your post stays safely in Proofer and won't be published.",
        tone: "yellow",
      };
    case "green":
      return {
        title: "Green means GO",
        body: `Green schedules a post for the time you chose (${ctx.scheduleLabel}). We're leaving yours saved — press green whenever you're ready.`,
        tone: "green",
      };
    case "board":
      return {
        title: "That's your first post 🎉",
        body: "It's saved on your board — we did NOT schedule it. Yellow = Saved, Green = Scheduled. Mark it green when you're happy for it to go out.",
      };
    default:
      return { title: "", body: "" };
  }
}

// A few friendly suggestions — but only ever days that are FREE on this
// account, so the tour can't land on (and overwrite) an existing post. Walks
// forward from today collecting the first blank days.
function buildPresets(
  todayISO: string,
  occupied: Set<string>
): { label: string; date: string; time: string }[] {
  const times = ["18:30", "09:00", "11:00"];
  const out: { label: string; date: string; time: string }[] = [];
  for (let i = 0; i < 60 && out.length < 3; i++) {
    const date = addDaysISO(todayISO, i);
    if (occupied.has(date)) continue;
    const time = times[out.length] ?? "18:30";
    const label = `${friendlyDayLabel(date, todayISO)} · ${formatClock(time)}`;
    out.push({ label, date, time });
  }
  return out;
}

function friendlyDayLabel(dateISO: string, todayISO: string): string {
  if (dateISO === todayISO) return "Today";
  if (dateISO === addDaysISO(todayISO, 1)) return "Tomorrow";
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function formatClock(time: string): string {
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(2000, 0, 1, hh ?? 18, mm ?? 0);
  return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatSchedule(dateISO: string, time: string): string {
  try {
    const [y, m, d] = dateISO.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 18, mm ?? 0);
    const weekday = dt.toLocaleDateString(undefined, { weekday: "long" });
    const clock = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${weekday} at ${clock}`;
  } catch {
    return `${dateISO} at ${time}`;
  }
}

/* ========================================================================== */
/* Inline styles (match the Proofer/admin convention)                        */
/* ========================================================================== */

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 20px",
  borderBottom: "1px solid #ececef",
  background: "rgba(255,255,255,0.8)",
  backdropFilter: "blur(6px)",
  position: "sticky",
  top: 0,
  zIndex: 10,
  flexWrap: "wrap",
};

const brandStyle: React.CSSProperties = { fontSize: 16, fontWeight: 850, letterSpacing: -0.3 };

const demoPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6d28d9",
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  borderRadius: 999,
  padding: "3px 9px",
};

const skipLinkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
};

const coachCardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderTop: "3px solid #6d28d9",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 1px 2px rgba(24,24,27,.04), 0 10px 30px -18px rgba(24,24,27,.18)",
};

const exampleStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 13,
  color: "#6d28d9",
  background: "#f5f3ff",
  border: "1px solid #ede9fe",
  borderRadius: 10,
  padding: "8px 10px",
  lineHeight: 1.45,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  padding: 18,
};

const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 750, color: "#18181b", display: "block" };
const cardSub: React.CSSProperties = { margin: "6px 0 12px", fontSize: 13.5, color: "#71717a", lineHeight: 1.5 };

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d4d4d8",
  fontSize: 14,
  color: "#18181b",
  outline: "none",
  background: "#fff",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  resize: "vertical",
  lineHeight: 1.5,
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  background: "#6d28d9",
  color: "#fff",
  border: "1px solid #6d28d9",
  padding: "11px 18px",
};

const secondaryBtn: React.CSSProperties = {
  background: "#fff",
  color: "#3f3f46",
  border: "1px solid #d4d4d8",
  padding: "11px 18px",
  textDecoration: "none",
};

const yellowBtn: React.CSSProperties = {
  background: "#fef9c3",
  color: "#854d0e",
  border: "1px solid #fde047",
  padding: "12px 22px",
  fontSize: 15,
};

const greenBtn: React.CSSProperties = {
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #86efac",
  padding: "12px 22px",
  fontSize: 15,
};

const undoBtn: React.CSSProperties = {
  background: "#f4f4f5",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const aiChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  color: "#3f3f46",
  cursor: "pointer",
};

const aiChipActive: React.CSSProperties = {
  border: "1px solid #c4b5fd",
  background: "#f5f3ff",
  color: "#5b21b6",
  boxShadow: "0 0 0 3px rgba(109,40,217,0.12)",
};

const pickRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fff",
  cursor: "pointer",
};

const presetBtn: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  color: "#3f3f46",
  cursor: "pointer",
};
const presetBtnOn: React.CSSProperties = {
  ...presetBtn,
  border: "1px solid #6d28d9",
  background: "#f5f3ff",
  color: "#5b21b6",
};

const scheduleBanner: React.CSSProperties = {
  marginTop: 12,
  background: "#faf5ff",
  border: "1px solid #ede9fe",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#5b21b6",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.45,
};

const successPill: React.CSSProperties = {
  alignSelf: "center",
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #86efac",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
};

const welcomeCardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 20,
  padding: "40px 32px",
  maxWidth: 560,
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  boxShadow: "0 1px 2px rgba(24,24,27,.04), 0 30px 60px -30px rgba(24,24,27,.22)",
};

const photoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
  gap: 8,
  marginTop: 12,
};

const photoBtn: React.CSSProperties = {
  padding: 0,
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  overflow: "hidden",
  cursor: "pointer",
  background: "#f4f4f5",
  aspectRatio: "1 / 1",
};

const photoImg: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

const previewCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  overflow: "hidden",
  maxWidth: 420,
};

const previewHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
};

const previewAvatar: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  background: "linear-gradient(135deg,#dd2a7b,#f59e0b)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  fontSize: 14,
};

const previewImage: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  display: "block",
  background: "#f4f4f5",
};

const previewImagePlaceholder: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  display: "grid",
  placeItems: "center",
  color: "#a1a1aa",
  fontSize: 13,
  background: "#f4f4f5",
};

const legendYellow: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#854d0e",
  background: "#fef9c3",
  border: "1px solid #fde047",
  borderRadius: 999,
  padding: "5px 12px",
};
const legendGreen: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#166534",
  background: "#dcfce7",
  border: "1px solid #86efac",
  borderRadius: 999,
  padding: "5px 12px",
};

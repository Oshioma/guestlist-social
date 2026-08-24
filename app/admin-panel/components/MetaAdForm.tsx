"use client";

import { useState, useTransition, useEffect } from "react";
import ImageUpload from "./ImageUpload";
import CreativeLibraryPicker from "./CreativeLibraryPicker";
import AiInlineSuggestion from "./AiInlineSuggestion";

type Props = {
  campaignName: string;
  clientId?: string;
  clientWebsite?: string;
  objective?: string;
  existingCreatives?: { url: string; name: string; source: "meta" | "ads" | "proofer" | "storage"; ctr?: number | null; spend?: number | null; status?: string | null }[];
  onSubmit: (data: {
    name: string;
    imageUrl: string;
    headline: string;
    body: string;
    ctaType: string;
    destinationUrl: string;
  }) => Promise<{ error?: string; warning?: string }>;
  /**
   * When set, the ad in progress is mirrored into localStorage under this key.
   * Writing an ad is real work — copy, a chosen or generated image — and it
   * used to live only in component state, so a reload (or the hard refresh
   * Next does when a deploy invalidates a server action id) threw all of it
   * away with nothing to recover from.
   */
  draftKey?: string;
};

const CTA_OPTIONS = [
  { value: "learn_more", label: "Learn More" },
  { value: "shop_now", label: "Shop Now" },
  { value: "sign_up", label: "Sign Up" },
  { value: "contact_us", label: "Contact Us" },
  { value: "book_now", label: "Book Now" },
  { value: "apply_now", label: "Apply Now" },
  { value: "watch_more", label: "Watch More" },
  { value: "download", label: "Download" },
  { value: "get_quote", label: "Get Quote" },
];

export default function MetaAdForm({ campaignName, clientId, clientWebsite, objective, existingCreatives, onSubmit, draftKey }: Props) {
  const [name, setName] = useState(`${campaignName} — ad 1`);
  const [imageUrl, setImageUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaType, setCtaType] = useState("learn_more");
  const [destinationUrl, setDestinationUrl] = useState(clientWebsite ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // ── Attempt trace ──────────────────────────────────────────────────────
  // A create that dies takes the page with it: the form, the error and the
  // console all go. Write down what a click did BEFORE it can disappear, and
  // show it back on the next render. An attempt with a start and no finish is
  // the signature of a request that never came back — which is otherwise
  // indistinguishable from a click that never happened.
  type Attempt = {
    startedAt: number;
    finishedAt?: number;
    outcome?: "created" | "saved-with-warning" | "refused" | "threw";
    detail?: string;
  };
  const attemptKey = draftKey ? `${draftKey}:last-attempt` : "ad-form:last-attempt";
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);

  // Everything that remembers a failure across the reload has been going to
  // localStorage — drafts, the attempt trace, the failure recorder — and none
  // of it has ever shown up on the affected machine. If site storage is
  // blocked there, all of it silently no-ops, so say that plainly instead of
  // looking like the features are missing.
  const [storageBlocked, setStorageBlocked] = useState(false);
  useEffect(() => {
    try {
      const probe = "gs:storage-probe";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
    } catch {
      setStorageBlocked(true);
    }
  }, []);

  // A marker in the URL survives what storage can't: it rides through a hard
  // reload, needs no permissions, and — unlike anything else here — it shows
  // up in a screenshot of the address bar.
  const [urlAttempt, setUrlAttempt] = useState<string | null>(null);
  useEffect(() => {
    const h = window.location.hash;
    if (h.startsWith("#ad-attempt-")) setUrlAttempt(h.replace("#ad-attempt-", ""));
  }, []);

  function markUrl(fragment: string) {
    try {
      const u = new URL(window.location.href);
      u.hash = fragment;
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(attemptKey);
      if (raw) setLastAttempt(JSON.parse(raw) as Attempt);
    } catch {
      /* ignore */
    }
  }, [attemptKey]);

  function writeAttempt(a: Attempt) {
    setLastAttempt(a);
    try {
      window.localStorage.setItem(attemptKey, JSON.stringify(a));
    } catch {
      /* ignore */
    }
  }
  const [draftRestored, setDraftRestored] = useState(false);

  // ── Draft recovery ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!draftKey) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(draftKey);
    } catch {
      return; // storage blocked — drafts are best-effort
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Record<string, unknown>;
      const apply = (k: string, set: (v: string) => void) => {
        const v = d[k];
        if (typeof v === "string" && v !== "") set(v);
      };
      apply("name", setName);
      apply("imageUrl", setImageUrl);
      apply("headline", setHeadline);
      apply("body", setBody);
      apply("ctaType", setCtaType);
      apply("destinationUrl", setDestinationUrl);
      setDraftRestored(true);
    } catch {
      /* corrupt draft — ignore it */
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || success) return;
    const isEmpty = !imageUrl && !headline.trim() && !body.trim();
    try {
      if (isEmpty) window.localStorage.removeItem(draftKey);
      else
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ name, imageUrl, headline, body, ctaType, destinationUrl })
        );
    } catch {
      /* storage full or blocked — never break the form over a draft */
    }
  }, [draftKey, success, name, imageUrl, headline, body, ctaType, destinationUrl]);

  function clearDraft() {
    if (!draftKey) return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }
  type Sug = { suggestion: string | null; reasoning: string | null };
  type Variation = { headline: string; body: string; cta: string; reasoning: string };
  const [variations, setVariations] = useState<Variation[]>([]);
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const [bodyIdx, setBodyIdx] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [nextHeadlineLoading, setNextHeadlineLoading] = useState(false);
  const [nextBodyLoading, setNextBodyLoading] = useState(false);

  const ai = {
    headline: variations[headlineIdx]
      ? { suggestion: variations[headlineIdx].headline, reasoning: variations[headlineIdx].reasoning }
      : { suggestion: null, reasoning: null },
    body: variations[bodyIdx]
      ? { suggestion: variations[bodyIdx].body, reasoning: variations[bodyIdx].reasoning }
      : { suggestion: null, reasoning: null },
  };

  function fetchAdCopy() {
    if (!clientId) return;
    return fetch("/api/ai-write-ad-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, objective: objective ?? "engagement", campaignName }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.variations) {
          setVariations(data.variations);
          setHeadlineIdx(0);
          setBodyIdx(0);
        } else if (data.ok) {
          setVariations([{ headline: data.headline, body: data.body, cta: data.cta, reasoning: data.reasoning }]);
          setHeadlineIdx(0);
          setBodyIdx(0);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!clientId) return;
    setAiLoading(true);
    fetchAdCopy()?.finally(() => setAiLoading(false));
  }, [clientId]);

  function handleNextHeadline() {
    if (variations.length > 1 && headlineIdx < variations.length - 1) {
      setHeadlineIdx((i) => i + 1);
      return;
    }
    setNextHeadlineLoading(true);
    fetchAdCopy()?.finally(() => setNextHeadlineLoading(false));
  }

  function handleNextBody() {
    if (variations.length > 1 && bodyIdx < variations.length - 1) {
      setBodyIdx((i) => i + 1);
      return;
    }
    setNextBodyLoading(true);
    fetchAdCopy()?.finally(() => setNextBodyLoading(false));
  }
  const [creativeLoading, setCreativeLoading] = useState(false);
  const [creativeBrief, setCreativeBrief] = useState<{
    brief: string;
    rationale: string;
    generatedImageUrl: string | null;
    imageGenerationEnabled: boolean;
  } | null>(null);

  const ready =
    name.trim() &&
    imageUrl.trim() &&
    headline.trim() &&
    body.trim() &&
    destinationUrl.trim();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      // A server action that rejects — a timeout, a 500, an action id the
      // current deployment no longer knows — throws out of this transition,
      // and Next recovers by re-rendering the route from scratch. That is
      // what "clicked create and came back to an empty form" was: the failure
      // took the form with it and said nothing. Catch it here so the ad stays
      // on screen and the reason is visible.
      const attempt: Attempt = { startedAt: Date.now() };
      const stamp = new Date(attempt.startedAt)
        .toTimeString()
        .slice(0, 8)
        .replace(/:/g, "");
      writeAttempt(attempt);
      markUrl(`ad-attempt-${stamp}`);
      setUrlAttempt(null);

      let result: { error?: string; warning?: string };
      try {
        result = await onSubmit({
          name: name.trim(),
          imageUrl: imageUrl.trim(),
          headline: headline.trim(),
          body: body.trim(),
          ctaType,
          destinationUrl: destinationUrl.trim(),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        writeAttempt({ ...attempt, finishedAt: Date.now(), outcome: "threw", detail });
        markUrl(`ad-threw-${stamp}`);
        setError(
          `The ad could not be sent to the server — ${detail}. Your ad is still here and saved locally. If this keeps happening, reload the page and try once more.`
        );
        return;
      }
      if (result.error) {
        writeAttempt({
          ...attempt,
          finishedAt: Date.now(),
          outcome: "refused",
          detail: result.error,
        });
        markUrl(`ad-refused-${stamp}`);
        setError(result.error);
      } else {
        writeAttempt({
          ...attempt,
          finishedAt: Date.now(),
          outcome: result.warning ? "saved-with-warning" : "created",
          detail: result.warning,
        });
        markUrl(`ad-${result.warning ? "saved" : "created"}-${stamp}`);
        // The ad exists — even when Meta refused it, which comes back as a
        // warning rather than an error so the operator isn't invited to
        // submit it a second time.
        setWarning(result.warning ?? null);
        clearDraft();
        setSuccess(true);
      }
    });
  }

  if (success) {
    return (
      <div
        style={{
          background: "#ecfdf5",
          border: "1px solid #bbf7d0",
          borderRadius: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#166534" }}>
          {warning ? "Ad saved" : "Ad created"}
        </div>
        <p style={{ fontSize: 14, color: "#52525b", margin: "8px 0 16px" }}>
          &ldquo;{name}&rdquo; has been saved. It starts paused — review it
          on the ads page, then switch it to active when ready.
        </p>
        {warning && (
          <p
            style={{
              fontSize: 13,
              color: "#92400e",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "10px 12px",
              margin: "0 0 16px",
              textAlign: "left",
              lineHeight: 1.5,
            }}
          >
            {warning}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setWarning(null);
              setName(`${campaignName} — ad ${Date.now() % 100}`);
              setImageUrl("");
              setHeadline("");
              setBody("");
              // Back to the client's site, not blank — the next ad almost
              // always points at the same place, and an empty destination
              // silently disables "Create ad".
              setDestinationUrl(clientWebsite ?? "");
            }}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              background: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Add another ad
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "#18181b",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            View campaign
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24, alignItems: "start" }}>
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 18,
        padding: "28px 28px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {urlAttempt && (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: "#92400e",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            The create at{" "}
            {`${urlAttempt.slice(0, 2)}:${urlAttempt.slice(2, 4)}:${urlAttempt.slice(4, 6)}`}{" "}
            never came back — the page reloaded before the server answered. The
            ad was not created. Nothing is wrong with what you typed.
          </div>
        )}

        {storageBlocked && (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: "#92400e",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            This browser is blocking site storage for guestlistsocial.com, so
            drafts of this ad can&rsquo;t be saved and a failure can&rsquo;t be
            reported back to you after a reload. Allow site data for this site
            to get both.
          </div>
        )}

        {draftRestored && !error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 13,
              color: "#3f3f46",
              background: "#fafafa",
              border: "1px solid #e4e4e7",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <span>Restored the ad you were writing.</span>
            <button
              type="button"
              onClick={() => {
                setName(`${campaignName} — ad 1`);
                setImageUrl("");
                setHeadline("");
                setBody("");
                setCtaType("learn_more");
                setDestinationUrl(clientWebsite ?? "");
                clearDraft();
                setDraftRestored(false);
              }}
              style={{
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#52525b",
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 8,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Start blank
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 13,
              color: "#991b1b",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "10px 12px",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label style={labelStyle}>Ad name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Summer Push — video 1"
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Image</label>
            {clientId && (
              <button
                type="button"
                disabled={creativeLoading}
                onClick={async () => {
                  setCreativeLoading(true);
                  setCreativeBrief(null);
                  try {
                    const res = await fetch("/api/ai-creative", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        clientId,
                        objective: objective ?? "engagement",
                        campaignName,
                        headline,
                        body,
                      }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setCreativeBrief({
                        brief: data.brief,
                        rationale: data.rationale,
                        generatedImageUrl: data.generatedImageUrl,
                        imageGenerationEnabled: data.imageGenerationEnabled,
                      });
                      if (data.generatedImageUrl) {
                        setImageUrl(data.generatedImageUrl);
                      }
                    } else {
                      setError(data.error);
                    }
                  } catch {
                    setError("Network error");
                  } finally {
                    setCreativeLoading(false);
                  }
                }}
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: creativeLoading
                    ? "#c7d2fe"
                    : "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: creativeLoading ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                {creativeLoading ? "AI generating..." : <><span style={{ fontSize: 12 }}>&#9733;</span> AI Creative</>}
              </button>
            )}
          </div>

          {creativeBrief && (
            <div
              style={{
                marginBottom: 8,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#eef2ff",
                border: "1px solid #e0e7ff",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: "#4338ca", fontWeight: 700, flexShrink: 0 }}>&#9733;</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#18181b", lineHeight: 1.5 }}>
                  {creativeBrief.brief}
                </div>
                {creativeBrief.generatedImageUrl && (
                  <div style={{ fontSize: 11, color: "#166534", fontWeight: 600, marginTop: 2 }}>
                    Image applied
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCreativeBrief(null)}
                style={{ background: "none", border: "none", color: "#a1a1aa", fontSize: 14, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
              >
                x
              </button>
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            {imageUrl ? (
              <div style={{ position: "relative" }}>
                <img
                  src={imageUrl}
                  alt="Ad preview"
                  style={{
                    width: 120,
                    height: 120,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid #e4e4e7",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "none",
                    background: "#18181b",
                    color: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  x
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <ImageUpload
                bucket="postimages"
                folder="ad-creatives"
                onUploaded={(url) => setImageUrl(url)}
                label="Upload image"
                accept="image/*"
              />
              {existingCreatives && (
                <CreativeLibraryPicker
                  creatives={existingCreatives}
                  onPick={(url) => setImageUrl(url)}
                />
              )}
              <span style={{ fontSize: 11, color: "#71717a" }}>
                Or paste a URL:
              </span>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                style={{ ...inputStyle, fontSize: 12 }}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Headline</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.headline.suggestion}
                reasoning={ai.headline.reasoning}
                loading={aiLoading}
                onNextIdea={handleNextHeadline}
                nextLoading={nextHeadlineLoading}
                onApply={(v) => setHeadline(v)}
              />
            )}
          </div>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            style={inputStyle}
            placeholder="Summer deals you don't want to miss"
            maxLength={255}
          />
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
            {headline.length}/255
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Body text</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.body.suggestion}
                reasoning={ai.body.reasoning}
                loading={aiLoading}
                onNextIdea={handleNextBody}
                nextLoading={nextBodyLoading}
                onApply={(v) => setBody(v)}
              />
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
            placeholder="Tell people what your ad is about..."
            maxLength={2200}
          />
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
            {body.length}/2200
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Call to action</label>
            <select
              value={ctaType}
              onChange={(e) => setCtaType(e.target.value)}
              style={inputStyle}
            >
              {CTA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Destination URL</label>
            {clientWebsite && (
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4, marginTop: -2 }}>
                Check this is the right landing page for this campaign
              </div>
            )}
            <input
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              style={inputStyle}
              placeholder="https://yoursite.com/landing"
              type="url"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ready || isPending}
          style={{
            border: "none",
            borderRadius: 12,
            padding: "14px 20px",
            background: ready && !isPending ? "#18181b" : "#d4d4d8",
            color: ready && !isPending ? "#fff" : "#a1a1aa",
            fontSize: 15,
            fontWeight: 700,
            cursor: ready && !isPending ? "pointer" : "not-allowed",
            width: "100%",
          }}
        >
          {isPending ? "Creating ad in Meta..." : "Create ad"}
        </button>

        {lastAttempt && !isPending && (
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              color: lastAttempt.finishedAt ? "#71717a" : "#92400e",
              background: lastAttempt.finishedAt ? "transparent" : "#fffbeb",
              border: lastAttempt.finishedAt ? "none" : "1px solid #fde68a",
              borderRadius: 8,
              padding: lastAttempt.finishedAt ? 0 : "8px 10px",
            }}
          >
            {lastAttempt.finishedAt ? (
              <>
                Last attempt {new Date(lastAttempt.startedAt).toLocaleTimeString()} ·{" "}
                {((lastAttempt.finishedAt - lastAttempt.startedAt) / 1000).toFixed(1)}s ·{" "}
                {lastAttempt.outcome}
                {lastAttempt.detail ? ` — ${lastAttempt.detail}` : ""}
              </>
            ) : (
              <>
                The attempt at {new Date(lastAttempt.startedAt).toLocaleTimeString()} never
                came back — the page reloaded before the server answered. Nothing you typed
                was lost; it is restored above.
              </>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Live preview */}
    <div style={{ position: "sticky", top: 80 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
        Preview
      </div>
      <div
        style={{
          border: "1px solid #dbdbdb",
          borderRadius: 8,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700 }}>
            {(campaignName ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#262626" }}>{name || "Ad name"}</div>
            <div style={{ fontSize: 11, color: "#8e8e8e" }}>Sponsored</div>
          </div>
        </div>

        {body.trim() && (
          <div style={{ padding: "4px 14px 8px", fontSize: 13, color: "#262626", lineHeight: 1.5 }}>
            {body}
          </div>
        )}

        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block", background: "#fafafa" }} />
        ) : (
          <div style={{ width: "100%", aspectRatio: "1/1", background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#c7c7c7", fontSize: 13 }}>
            No image yet
          </div>
        )}

        <div style={{ padding: "10px 14px 4px", display: "flex", gap: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </div>

        <div style={{ padding: "4px 14px", fontSize: 13, color: "#262626", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>{name || "Ad name"}</span>{" "}
          {headline.trim() || "Your headline here"}
        </div>

        <div style={{ padding: "8px 14px", background: "#f9fafb", borderTop: "1px solid #f4f4f5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {destinationUrl && (
              <div style={{ fontSize: 11, color: "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {destinationUrl.replace(/^https?:\/\//, "").split("/")[0]}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
              {headline.trim() || "Headline"}
            </div>
          </div>
          <div style={{ padding: "5px 12px", borderRadius: 6, background: "#e4e4e7", color: "#18181b", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            {CTA_OPTIONS.find((o) => o.value === ctaType)?.label ?? "Learn More"}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#52525b",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 15,
  background: "#fafafa",
  color: "#18181b",
  boxSizing: "border-box",
  transition: "border-color 150ms, background 150ms",
};

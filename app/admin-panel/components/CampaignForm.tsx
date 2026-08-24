"use client";

import React, { useActionState, useEffect, useRef, useState } from "react";
import AiInlineSuggestion from "./AiInlineSuggestion";
import ImageUpload from "./ImageUpload";
import CreativeLibraryPicker from "./CreativeLibraryPicker";

type CampaignFormValues = {
  name: string;
  objective: string;
  budget: number;
  audience: string;
  status: string;
  startDate?: string;
  endDate?: string;
  placement?: string;
};

const CTA_OPTIONS = [
  { value: "learn_more", label: "Learn More" },
  { value: "shop_now", label: "Shop Now" },
  { value: "sign_up", label: "Sign Up" },
  { value: "contact_us", label: "Contact Us" },
  { value: "book_now", label: "Book Now" },
];

type WinningAd = {
  name: string;
  imageUrl: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  destinationUrl: string | null;
  ctr: number;
  spend: number;
};

type Props = {
  clientId?: string;
  clientIndustry?: string;
  clientWebsite?: string;
  showAdFields?: boolean;
  existingCreatives?: { url: string; name: string; source: "meta" | "ads" | "proofer" | "storage"; ctr?: number | null; spend?: number | null; status?: string | null }[];
  winningAds?: WinningAd[];
  title?: string;
  submitLabel?: string;
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
  initialValues?: CampaignFormValues;
  /**
   * When set, the form keeps a local draft under this key so a hard reload
   * (expired session, a redeploy invalidating the server action id) can't throw
   * away what was typed. Only the create form passes one — edit forms already
   * have their values in the database.
   */
  draftKey?: string;
};

function getAudiencePresets(industry?: string): { label: string; value: string }[] {
  const i = (industry ?? "").toLowerCase();
  if (i.includes("hotel") || i.includes("villa") || i.includes("travel") || i.includes("hospitality") || i.includes("accommodation")) {
    return [
      { label: "Luxury travellers", value: "Ages 30-60, interests: luxury travel, boutique hotels, travel" },
      { label: "Couples getaway", value: "Ages 25-45, couples, interests: romantic getaways, honeymoon" },
      { label: "Family holidays", value: "Ages 30-55, parents, interests: family travel, holiday resorts" },
      { label: "Adventure seekers", value: "Ages 22-40, interests: adventure travel, eco tourism, diving" },
      { label: "International", value: "Ages 25-60, UK + Europe + US, interests: travel, holidays abroad" },
      { label: "Broad", value: "Ages 18-65, worldwide, interests: travel" },
    ];
  }
  if (i.includes("restaurant") || i.includes("food") || i.includes("cafe") || i.includes("dining")) {
    return [
      { label: "Local foodies", value: "Ages 22-45, 10mi radius, interests: food, dining out, restaurants" },
      { label: "Date night", value: "Ages 25-45, couples, 15mi radius, interests: fine dining, date night" },
      { label: "Families", value: "Ages 28-50, parents, 10mi radius, interests: family restaurants" },
      { label: "Health conscious", value: "Ages 25-45, interests: healthy eating, organic food, wellness" },
      { label: "Local 5mi", value: "Ages 18-55, 5mi radius, local area" },
      { label: "Broad local", value: "Ages 18-65, 25mi radius" },
    ];
  }
  if (i.includes("fitness") || i.includes("gym") || i.includes("health") || i.includes("wellness")) {
    return [
      { label: "Gym goers", value: "Ages 18-40, interests: gym, weight training, fitness" },
      { label: "Weight loss", value: "Ages 25-55, interests: weight loss, healthy lifestyle, diet" },
      { label: "Yoga & mindfulness", value: "Ages 22-50, interests: yoga, meditation, wellness" },
      { label: "Local 5mi", value: "Ages 18-55, 5mi radius, local area" },
      { label: "Parents", value: "Ages 28-50, parents, interests: family fitness, health" },
      { label: "Professionals", value: "Ages 25-45, interests: work-life balance, wellness" },
    ];
  }
  if (i.includes("beauty") || i.includes("salon") || i.includes("spa")) {
    return [
      { label: "Beauty enthusiasts", value: "Ages 18-40, interests: beauty, skincare, makeup" },
      { label: "Bridal", value: "Ages 22-38, interests: weddings, bridal beauty, makeup" },
      { label: "Self-care", value: "Ages 25-50, interests: self-care, spa treatments, wellness" },
      { label: "Local 5mi", value: "Ages 18-55, 5mi radius, local area" },
      { label: "Professionals", value: "Ages 25-45, women, interests: professional appearance" },
      { label: "Broad local", value: "Ages 18-65, 15mi radius" },
    ];
  }
  if (i.includes("retail") || i.includes("ecommerce") || i.includes("e-commerce") || i.includes("shop")) {
    return [
      { label: "Online shoppers", value: "Ages 18-45, interests: online shopping, deals, fashion" },
      { label: "Gift buyers", value: "Ages 25-55, interests: gifts, presents, special occasions" },
      { label: "Young adults", value: "Ages 18-30, interests: trending products, lifestyle" },
      { label: "Parents", value: "Ages 28-50, parents, interests: family shopping" },
      { label: "Broad UK", value: "Ages 18-65, United Kingdom" },
      { label: "Broad intl", value: "Ages 18-65, worldwide" },
    ];
  }
  return [
    { label: "Local 5mi", value: "Ages 25-55, 5mi radius, local area" },
    { label: "Local 10mi", value: "Ages 25-55, 10mi radius, surrounding area" },
    { label: "Young adults", value: "Ages 18-34, interests relevant to business" },
    { label: "Parents", value: "Ages 28-50, parents with children, family activities" },
    { label: "Professionals", value: "Ages 25-45, interests: business, career, networking" },
    { label: "Broad UK", value: "Ages 18-65, United Kingdom" },
  ];
}

export default function CampaignForm({
  clientId,
  clientIndustry,
  clientWebsite,
  showAdFields = false,
  existingCreatives,
  winningAds,
  title = "New Campaign",
  submitLabel = "Create campaign",
  action,
  initialValues,
  draftKey,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  // Every field below is CONTROLLED on purpose. React 19 auto-resets an
  // uncontrolled `<form action={fn}>` as soon as the action returns, so when
  // the server action came back with an error the whole form blanked itself
  // and the operator lost everything they had typed. Controlled inputs are
  // never reset, so a failed submit now leaves the form exactly as it was.
  const [name, setName] = useState(initialValues?.name ?? "");
  const [objective, setObjective] = useState(initialValues?.objective ?? "engagement");
  const [budget, setBudget] = useState(
    initialValues?.budget != null ? String(initialValues.budget) : "0"
  );
  const [audience, setAudience] = useState(initialValues?.audience ?? "");
  const [placement, setPlacement] = useState(initialValues?.placement ?? "automatic");
  const [status, setStatus] = useState(initialValues?.status ?? "testing");
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? "");
  const budgetNumber = Number(budget) || 0;

  // React 19 resets the form when a form action settles. Controlled text
  // inputs are restored from their value prop afterwards, but a controlled
  // <select> is not: the DOM snaps back to its first option while React still
  // believes the chosen one is selected, so the form silently shows — and on
  // the next submit sends — the wrong objective/placement/status. Push our
  // state back into them whenever an action result lands.
  const objectiveRef = useRef<HTMLSelectElement | null>(null);
  const placementRef = useRef<HTMLSelectElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);
  useEffect(() => {
    if (objectiveRef.current) objectiveRef.current.value = objective;
    if (placementRef.current) placementRef.current.value = placement;
    if (statusRef.current) statusRef.current.value = status;
  }, [state, objective, placement, status]);

  // `pending` stays true until the whole submit settles — including the
  // redirect and the render of the page it lands on — so a slow round trip
  // looks like a button frozen on "Creating…". Say something after a while
  // rather than leaving the operator staring at it.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(t);
  }, [pending]);

  // Errors render at the top of a long form — well above the submit button the
  // operator just clicked — so scroll them into view instead of letting the
  // submit look like a silent no-op.
  const errorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!state.error) return;
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  type Sug = { suggestion: string | null; reasoning: string | null };
  type SugList = Sug[];
  const [aiAll, setAiAll] = useState<{ audience: SugList; budget: SugList; headline: SugList }>({
    audience: [],
    budget: [],
    headline: [],
  });
  const [aiIndex, setAiIndex] = useState<{ audience: number; budget: number; headline: number }>({
    audience: 0,
    budget: 0,
    headline: 0,
  });
  const [aiLoading, setAiLoading] = useState(false);
  // The suggestions call used to fail into `.catch(() => {})`, so a broken
  // endpoint looked identical to a form that simply has no AI on it.
  const [aiError, setAiError] = useState<string | null>(null);
  const [nextLoadingField, setNextLoadingField] = useState<string | null>(null);

  const ai = {
    audience: aiAll.audience[aiIndex.audience] ?? { suggestion: null, reasoning: null },
    budget: aiAll.budget[aiIndex.budget] ?? { suggestion: null, reasoning: null },
    headline: aiAll.headline[aiIndex.headline] ?? { suggestion: null, reasoning: null },
  };

  function fetchSuggestions() {
    if (!clientId) return;
    return fetch("/api/ai-suggest-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, objective }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`${r.status} ${r.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`);
        }
        return r.json();
      })
      .then((data) => {
        if (data.ok && data.suggestions) {
          const norm = (v: unknown): SugList => {
            if (Array.isArray(v)) return v;
            if (v && typeof v === "object" && "suggestion" in v) return [v as Sug];
            return [];
          };
          setAiAll({
            audience: norm(data.suggestions.audience),
            budget: norm(data.suggestions.budget),
            headline: norm(data.suggestions.headline),
          });
          setAiIndex({ audience: 0, budget: 0, headline: 0 });
          setAiError(null);
        } else {
          setAiError(String(data.error ?? "No suggestions came back."));
        }
      })
      .catch((err) => {
        setAiError(err instanceof Error ? err.message : String(err));
      });
  }

  useEffect(() => {
    if (!clientId) return;
    setAiLoading(true);
    fetchSuggestions()?.finally(() => setAiLoading(false));
  }, [clientId]);

  function handleNextForField(field: "headline" | "budget" | "audience") {
    const list = aiAll[field];
    const currentIdx = aiIndex[field];
    if (list.length > 1 && currentIdx < list.length - 1) {
      setAiIndex((prev) => ({ ...prev, [field]: currentIdx + 1 }));
      return;
    }
    setNextLoadingField(field);
    fetchSuggestions()?.finally(() => setNextLoadingField(null));
  }

  // Ad fields state (only used when showAdFields is true)
  const [adImageUrl, setAdImageUrl] = useState("");
  const [adHeadline, setAdHeadline] = useState("");
  const [adBody, setAdBody] = useState("");
  const [adCtaType, setAdCtaType] = useState("learn_more");
  const [adDestinationUrl, setAdDestinationUrl] = useState(clientWebsite ?? "");

  // ── Draft recovery ─────────────────────────────────────────────────────
  // Controlled fields survive a failed server action, but a full page reload
  // (session expiry mid-form, or a deploy that invalidates the server action
  // id — Next silently refreshes the page in that case) still starts from
  // blank. Mirror the form into localStorage so nothing is ever lost, and drop
  // the draft once the campaign has actually been created.
  const [draftRestored, setDraftRestored] = useState(false);

  // A suggestion applied in CampaignCreator remounts this form with prefilled
  // values — don't clobber those with an older draft.
  const hasPrefill = Boolean(initialValues?.name || initialValues?.audience);

  useEffect(() => {
    if (!draftKey || hasPrefill) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(draftKey);
    } catch {
      return; // storage blocked — drafts are best-effort
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Record<string, unknown>;
      const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
      const apply = (k: string, set: (v: string) => void) => {
        const v = str(k);
        if (v !== null && v !== "") set(v);
      };
      apply("name", setName);
      apply("objective", setObjective);
      apply("budget", setBudget);
      apply("audience", setAudience);
      apply("placement", setPlacement);
      apply("status", setStatus);
      apply("startDate", setStartDate);
      apply("endDate", setEndDate);
      apply("adImageUrl", setAdImageUrl);
      apply("adHeadline", setAdHeadline);
      apply("adBody", setAdBody);
      apply("adCtaType", setAdCtaType);
      apply("adDestinationUrl", setAdDestinationUrl);
      setDraftRestored(true);
    } catch {
      /* corrupt draft — ignore it */
    }
  }, [draftKey, hasPrefill]);

  useEffect(() => {
    if (!draftKey) return;
    const isEmpty = !name && !audience && !adHeadline && !adBody && !adImageUrl;
    try {
      if (isEmpty) window.localStorage.removeItem(draftKey);
      else
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            name,
            objective,
            budget,
            audience,
            placement,
            status,
            startDate,
            endDate,
            adImageUrl,
            adHeadline,
            adBody,
            adCtaType,
            adDestinationUrl,
          })
        );
    } catch {
      /* storage full or blocked — never break the form over a draft */
    }
  }, [
    draftKey,
    name,
    objective,
    budget,
    audience,
    placement,
    status,
    startDate,
    endDate,
    adImageUrl,
    adHeadline,
    adBody,
    adCtaType,
    adDestinationUrl,
  ]);

  // Nothing here deletes the draft. Leaving the page — deliberately, by going
  // back, or because a submit stalled — must never throw the work away, and
  // the form can't tell those apart. The campaign page clears the draft once
  // the campaign actually exists (see ClearCampaignDraft).

  // AI ad copy suggestions
  type AdVariation = { headline: string; body: string; cta: string; reasoning: string };
  const [adVariations, setAdVariations] = useState<AdVariation[]>([]);
  const [adHIdx, setAdHIdx] = useState(0);
  const [adBIdx, setAdBIdx] = useState(0);
  const [adAiLoading, setAdAiLoading] = useState(false);
  const [adNextHLoading, setAdNextHLoading] = useState(false);
  const [adNextBLoading, setAdNextBLoading] = useState(false);

  const adAiHeadline = adVariations[adHIdx]
    ? { suggestion: adVariations[adHIdx].headline, reasoning: adVariations[adHIdx].reasoning }
    : { suggestion: null, reasoning: null };
  const adAiBody = adVariations[adBIdx]
    ? { suggestion: adVariations[adBIdx].body, reasoning: adVariations[adBIdx].reasoning }
    : { suggestion: null, reasoning: null };

  function fetchAdCopy() {
    if (!clientId) return;
    return fetch("/api/ai-write-ad-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, objective, campaignName: name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.variations) {
          setAdVariations(data.variations);
          setAdHIdx(0);
          setAdBIdx(0);
        } else if (data.ok) {
          setAdVariations([{ headline: data.headline, body: data.body, cta: data.cta, reasoning: data.reasoning }]);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!clientId || !showAdFields) return;
    setAdAiLoading(true);
    fetchAdCopy()?.finally(() => setAdAiLoading(false));
  }, [clientId, showAdFields]);

  return (
    <div
      style={{
        maxWidth: 720,
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {aiError && (
          <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
            AI suggestions are unavailable right now — {aiError}. Everything on
            this form still works without them.
          </div>
        )}

        {draftRestored && !state.error && (
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
            <span>Restored your unsaved draft.</span>
            <button
              type="button"
              onClick={() => {
                setName("");
                setObjective("engagement");
                setBudget("0");
                setAudience("");
                setPlacement("automatic");
                setStatus("testing");
                setStartDate("");
                setEndDate("");
                setAdImageUrl("");
                setAdHeadline("");
                setAdBody("");
                setAdCtaType("learn_more");
                setAdDestinationUrl(clientWebsite ?? "");
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

        {state.error && (
          <div
            ref={errorRef}
            style={{
              fontSize: 13,
              color: "#b91c1c",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            {state.error}
          </div>
        )}

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Campaign name</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.headline.suggestion}
                reasoning={ai.headline.reasoning}
                loading={aiLoading}
                onNextIdea={() => handleNextForField("headline")}
                nextLoading={nextLoadingField === "headline"}
                onApply={(v) => setName(v)}
              />
            )}
          </div>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Summer sale — image test"
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Objective</label>
          <select
            ref={objectiveRef}
            name="objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            style={inputStyle}
          >
            <option value="engagement">Engagement</option>
            <option value="conversions">Conversions</option>
            <option value="traffic">Traffic</option>
            <option value="awareness">Awareness</option>
            <option value="leads">Leads</option>
          </select>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Budget (£/day)</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.budget.suggestion}
                reasoning={ai.budget.reasoning}
                loading={aiLoading}
                onNextIdea={() => handleNextForField("budget")}
                nextLoading={nextLoadingField === "budget"}
                onApply={(v) => {
                  const match = v.match(/(\d+(?:\.\d+)?)/);
                  const num = match ? parseFloat(match[1]) : NaN;
                  if (Number.isFinite(num)) setBudget(String(num));
                }}
              />
            )}
          </div>
          <input
            name="budget"
            type="number"
            min="0"
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Audience</label>
            {clientId && (
              <AiInlineSuggestion
                suggestion={ai.audience.suggestion}
                reasoning={ai.audience.reasoning}
                loading={aiLoading}
                onNextIdea={() => handleNextForField("audience")}
                nextLoading={nextLoadingField === "audience"}
                onApply={(v) => setAudience(v)}
              />
            )}
          </div>
          <input
            name="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            style={inputStyle}
            placeholder="18-35, London, interests: nightlife"
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {getAudiencePresets(clientIndustry).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setAudience(preset.value)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #e4e4e7",
                  background: "#fafafa",
                  color: "#52525b",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <DurationPicker
          budget={budgetNumber}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        <div>
          <label style={labelStyle}>Placement</label>
          <select
            ref={placementRef}
            name="placement"
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            style={inputStyle}
          >
            <option value="automatic">Automatic (recommended)</option>
            <option value="feed_only">Feed only</option>
            <option value="stories_only">Stories only</option>
            <option value="feed_and_stories">Feed + Stories</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select
            ref={statusRef}
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={inputStyle}
          >
            <option value="testing">Draft — paused until ready</option>
            <option value="live">Live — active and spending</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        {showAdFields && (
          <>
            <div style={{ borderTop: "2px solid #e4e4e7", paddingTop: 16, marginTop: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b", marginBottom: 4 }}>
                Add your first ad
              </div>
              <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>
                Optional — fill in below to create the campaign and ad in one go.
              </div>
            </div>

            {winningAds && winningAds.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                {winningAds.slice(0, 3).map((w, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (w.imageUrl) setAdImageUrl(w.imageUrl);
                      if (w.headline) setAdHeadline(w.headline);
                      if (w.body) setAdBody(w.body);
                      if (w.cta) setAdCtaType(w.cta);
                      if (w.destinationUrl) setAdDestinationUrl(w.destinationUrl);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid #bbf7d0",
                      background: "#f0fdf4",
                      color: "#166534",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {w.imageUrl && <img src={w.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />}
                    Clone: {w.name.slice(0, 30)}{w.name.length > 30 ? "..." : ""}
                    <span style={{ color: "#15803d", fontSize: 11 }}>{w.ctr.toFixed(1)}% CTR</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <input type="hidden" name="adImageUrl" value={adImageUrl} />
                <input type="hidden" name="adHeadline" value={adHeadline} />
                <input type="hidden" name="adBody" value={adBody} />
                <input type="hidden" name="adCtaType" value={adCtaType} />
                <input type="hidden" name="adDestinationUrl" value={adDestinationUrl} />

                <div>
                  <label style={labelStyle}>Ad image</label>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    {adImageUrl && (
                      <div style={{ position: "relative" }}>
                        <img src={adImageUrl} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid #e4e4e7" }} />
                        <button type="button" onClick={() => setAdImageUrl("")} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", border: "none", background: "#18181b", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <ImageUpload bucket="postimages" folder="ad-creatives" onUploaded={(url) => setAdImageUrl(url)} label="Upload" accept="image/*" />
                      {existingCreatives && existingCreatives.length > 0 && (
                        <CreativeLibraryPicker creatives={existingCreatives} onPick={(url) => setAdImageUrl(url)} />
                      )}
                      <input value={adImageUrl} onChange={(e) => setAdImageUrl(e.target.value)} style={{ ...inputStyle, fontSize: 12 }} placeholder="Or paste URL..." />
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Headline</label>
                    <AiInlineSuggestion
                      suggestion={adAiHeadline.suggestion}
                      reasoning={adAiHeadline.reasoning}
                      loading={adAiLoading}
                      onNextIdea={() => {
                        if (adVariations.length > 1 && adHIdx < adVariations.length - 1) {
                          setAdHIdx((i) => i + 1);
                          return;
                        }
                        setAdNextHLoading(true);
                        fetchAdCopy()?.finally(() => setAdNextHLoading(false));
                      }}
                      nextLoading={adNextHLoading}
                      onApply={(v) => setAdHeadline(v)}
                    />
                  </div>
                  <input value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)} style={inputStyle} placeholder="Your headline" maxLength={255} />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Body text</label>
                    <AiInlineSuggestion
                      suggestion={adAiBody.suggestion}
                      reasoning={adAiBody.reasoning}
                      loading={adAiLoading}
                      onNextIdea={() => {
                        if (adVariations.length > 1 && adBIdx < adVariations.length - 1) {
                          setAdBIdx((i) => i + 1);
                          return;
                        }
                        setAdNextBLoading(true);
                        fetchAdCopy()?.finally(() => setAdNextBLoading(false));
                      }}
                      nextLoading={adNextBLoading}
                      onApply={(v) => setAdBody(v)}
                    />
                  </div>
                  <textarea value={adBody} onChange={(e) => setAdBody(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} placeholder="Tell people what your ad is about..." maxLength={2200} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>CTA</label>
                    <select value={adCtaType} onChange={(e) => setAdCtaType(e.target.value)} style={inputStyle}>
                      {CTA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Destination URL</label>
                    <input value={adDestinationUrl} onChange={(e) => setAdDestinationUrl(e.target.value)} style={inputStyle} placeholder="https://..." type="url" />
                  </div>
                </div>
              </div>

              {/* Live preview */}
              <div style={{ position: "sticky", top: 80 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Preview</div>
                <div style={{ border: "1px solid #dbdbdb", borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>A</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#262626" }}>Sponsored</div>
                    </div>
                  </div>
                  {adBody && <div style={{ padding: "2px 12px 6px", fontSize: 12, color: "#262626", lineHeight: 1.4 }}>{adBody}</div>}
                  {adImageUrl ? (
                    <img src={adImageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "4/3", background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#c7c7c7", fontSize: 12 }}>No image</div>
                  )}
                  <div style={{ padding: "8px 12px", background: "#f9fafb", borderTop: "1px solid #f4f4f5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#18181b", flex: 1, minWidth: 0 }}>{adHeadline || "Headline"}</div>
                    <div style={{ padding: "4px 10px", borderRadius: 5, background: "#e4e4e7", color: "#18181b", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{CTA_OPTIONS.find((o) => o.value === adCtaType)?.label ?? "Learn More"}</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {state.error && (
          <div style={{ fontSize: 13, color: "#b91c1c" }}>{state.error}</div>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "12px 14px",
            background: "#18181b",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending
            ? "Creating..."
            : showAdFields && (adImageUrl || adHeadline || adBody)
            ? "Create campaign + ad"
            : submitLabel}
        </button>

        {pending && slow && (
          <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.5 }}>
            Still working — this is taking longer than usual. Everything you
            typed is saved here, so nothing is lost.{" "}
            {clientId && (
              <>
                If it doesn&rsquo;t finish, check{" "}
                <a
                  href={`/app/clients/${clientId}`}
                  style={{ color: "#18181b", fontWeight: 600 }}
                >
                  this client&rsquo;s campaigns
                </a>{" "}
                before trying again — the campaign may already have been
                created.
              </>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function DurationPicker({
  budget,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  budget: number;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
}) {
  const [showCustom, setShowCustom] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null);

  const presets = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "1 month", days: 30 },
  ];

  function applyPreset(days: number, label: string) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    onStartDateChange(start.toISOString().split("T")[0]);
    onEndDateChange(end.toISOString().split("T")[0]);
    setSelectedPreset(label);
    setShowCustom(false);
  }

  const dayCount =
    startDate && endDate
      ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

  const totalBudget = dayCount * budget;

  return (
    <div>
      <label style={labelStyle}>Campaign duration</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.days, p.label)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: selectedPreset === p.label ? "none" : "1px solid #e4e4e7",
              background: selectedPreset === p.label ? "#18181b" : "#fff",
              color: selectedPreset === p.label ? "#fff" : "#52525b",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setShowCustom(!showCustom); setSelectedPreset(null); }}
          title="Custom dates"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: showCustom ? "none" : "1px solid #e4e4e7",
            background: showCustom ? "#18181b" : "#fff",
            color: showCustom ? "#fff" : "#71717a",
            fontSize: 16,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &#128197;
        </button>

        {dayCount > 0 && (
          <span style={{ fontSize: 13, color: "#18181b", fontWeight: 600, marginLeft: 4 }}>
            {dayCount} day{dayCount === 1 ? "" : "s"}
            {budget > 0 && <> · Total: £{totalBudget.toFixed(0)}</>}
            {budget === 0 && <> · Set budget above</>}
          </span>
        )}
      </div>

      {showCustom && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #e4e4e7",
            background: "#fafafa",
            marginBottom: 4,
          }}
        >
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { onStartDateChange(e.target.value); setSelectedPreset(null); }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { onEndDateChange(e.target.value); setSelectedPreset(null); }}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      <input type="hidden" name="startDate" value={startDate} />
      <input type="hidden" name="endDate" value={endDate} />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  color: "#18181b",
};

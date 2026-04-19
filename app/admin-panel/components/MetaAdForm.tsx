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
  existingCreatives?: { url: string; name: string; source: "meta" | "ads" | "proofer"; ctr?: number | null; spend?: number | null; status?: string | null }[];
  onSubmit: (data: {
    name: string;
    imageUrl: string;
    headline: string;
    body: string;
    ctaType: string;
    destinationUrl: string;
  }) => Promise<{ error?: string }>;
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

export default function MetaAdForm({ campaignName, clientId, clientWebsite, objective, existingCreatives, onSubmit }: Props) {
  const [name, setName] = useState(`${campaignName} — ad 1`);
  const [imageUrl, setImageUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaType, setCtaType] = useState("learn_more");
  const [destinationUrl, setDestinationUrl] = useState(clientWebsite ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  type Sug = { suggestion: string | null; reasoning: string | null };
  const [ai, setAi] = useState<{ headline: Sug; body: Sug }>({
    headline: { suggestion: null, reasoning: null },
    body: { suggestion: null, reasoning: null },
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [nextHeadlineLoading, setNextHeadlineLoading] = useState(false);
  const [nextBodyLoading, setNextBodyLoading] = useState(false);

  function fetchAdCopy(onlyField?: "headline" | "body") {
    if (!clientId) return;
    return fetch("/api/ai-write-ad-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, objective: objective ?? "engagement", campaignName }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          if (onlyField === "headline") {
            setAi((prev) => ({
              ...prev,
              headline: { suggestion: data.headline, reasoning: data.reasoning },
            }));
          } else if (onlyField === "body") {
            setAi((prev) => ({
              ...prev,
              body: { suggestion: data.body, reasoning: data.reasoning },
            }));
          } else {
            setAi({
              headline: { suggestion: data.headline, reasoning: data.reasoning },
              body: { suggestion: data.body, reasoning: data.reasoning },
            });
          }
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
    setNextHeadlineLoading(true);
    fetchAdCopy("headline")?.finally(() => setNextHeadlineLoading(false));
  }

  function handleNextBody() {
    setNextBodyLoading(true);
    fetchAdCopy("body")?.finally(() => setNextBodyLoading(false));
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
      const result = await onSubmit({
        name: name.trim(),
        imageUrl: imageUrl.trim(),
        headline: headline.trim(),
        body: body.trim(),
        ctaType,
        destinationUrl: destinationUrl.trim(),
      });
      if (result.error) {
        setError(result.error);
      } else {
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
          Ad created in Meta
        </div>
        <p style={{ fontSize: 14, color: "#52525b", margin: "8px 0 16px" }}>
          &ldquo;{name}&rdquo; is now in your ad account. It starts paused — review it
          in Ads Manager or on the ads page, then switch it to active when ready.
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccess(false);
            setName(`${campaignName} — ad ${Date.now() % 100}`);
            setImageUrl("");
            setHeadline("");
            setBody("");
            setDestinationUrl("");
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
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 760,
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 18,
        padding: "28px 28px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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

"use client";

import { useState, useTransition } from "react";
import ImageUpload from "./ImageUpload";

type Props = {
  campaignName: string;
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

export default function MetaAdForm({ campaignName, onSubmit }: Props) {
  const [name, setName] = useState(`${campaignName} — ad 1`);
  const [imageUrl, setImageUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaType, setCtaType] = useState("learn_more");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
        maxWidth: 720,
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
          <label style={labelStyle}>Image</label>
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
          <label style={labelStyle}>Headline</label>
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
          <label style={labelStyle}>Body text</label>
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
            borderRadius: 10,
            padding: "12px 14px",
            background: ready && !isPending ? "#18181b" : "#d4d4d8",
            color: ready && !isPending ? "#fff" : "#a1a1aa",
            fontSize: 14,
            fontWeight: 600,
            cursor: ready && !isPending ? "pointer" : "not-allowed",
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
  boxSizing: "border-box",
};

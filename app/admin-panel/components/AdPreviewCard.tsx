"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  adId: number;
  adName: string;
  imageUrl: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  destinationUrl: string | null;
  metaId: string | null;
  adsetMetaId: string | null;
  status: string;
};

const CTA_LABELS: Record<string, string> = {
  learn_more: "Learn More",
  shop_now: "Shop Now",
  sign_up: "Sign Up",
  contact_us: "Contact Us",
  book_now: "Book Now",
  apply_now: "Apply Now",
  watch_more: "Watch More",
  download: "Download",
  get_quote: "Get Quote",
};

export default function AdPreviewCard({
  adId,
  adName,
  imageUrl,
  headline,
  body,
  cta,
  destinationUrl,
  metaId,
  adsetMetaId,
  status,
}: Props) {
  const router = useRouter();
  const [pushState, setPushState] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const ctaLabel = CTA_LABELS[cta ?? ""] ?? cta ?? "Learn More";
  const alreadyOnMeta = !!metaId;
  const canPush = !!adsetMetaId && !alreadyOnMeta;

  async function handlePush() {
    setPushState("pushing");
    setErrorMsg("");
    try {
      const res = await fetch("/api/push-ad-to-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error ?? "Failed to push");
        setPushState("error");
      } else {
        setPushState("done");
        router.refresh();
      }
    } catch {
      setErrorMsg("Network error");
      setPushState("error");
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        overflow: "hidden",
        background: "#fff",
        maxWidth: 400,
      }}
    >
      {/* Ad mock header */}
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #f4f4f5",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#e4e4e7",
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
            {adName}
          </div>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>Sponsored</div>
        </div>
      </div>

      {/* Body text */}
      {body && (
        <div style={{ padding: "10px 14px 6px", fontSize: 13, color: "#27272a", lineHeight: 1.5 }}>
          {body}
        </div>
      )}

      {/* Image */}
      {imageUrl ? (
        <div style={{ width: "100%", aspectRatio: "1.91/1", overflow: "hidden", background: "#f4f4f5" }}>
          <img
            src={imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio: "1.91/1",
            background: "#f4f4f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#a1a1aa",
            fontSize: 13,
          }}
        >
          No image
        </div>
      )}

      {/* Headline + CTA bar */}
      <div
        style={{
          padding: "10px 14px",
          background: "#f9fafb",
          borderTop: "1px solid #f4f4f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {destinationUrl && (
            <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {destinationUrl.replace(/^https?:\/\//, "").split("/")[0]}
            </div>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
            {headline || "No headline"}
          </div>
        </div>
        <div
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            background: "#e4e4e7",
            color: "#18181b",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {ctaLabel}
        </div>
      </div>

      {/* Action bar */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid #e4e4e7",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {alreadyOnMeta ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#166534",
              padding: "4px 10px",
              borderRadius: 6,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
            }}
          >
            Live on Meta · {status}
          </span>
        ) : canPush ? (
          <button
            type="button"
            onClick={handlePush}
            disabled={pushState === "pushing"}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: pushState === "pushing" ? "#93c5fd" : "#1d4ed8",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: pushState === "pushing" ? "wait" : "pointer",
            }}
          >
            {pushState === "pushing" ? "Pushing to Meta..." : "Push to Meta"}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>
            No Meta ad set connected — create campaign with Meta first
          </span>
        )}

        {pushState === "done" && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#166534" }}>
            Pushed successfully
          </span>
        )}

        {pushState === "error" && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  );
}

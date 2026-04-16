"use client";

import { useState } from "react";

type Props = {
  urls: string[];
  size?: number;
};

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url);
}

export default function CarouselPreview({ urls, size = 120 }: Props) {
  const [idx, setIdx] = useState(0);
  const total = urls.length;

  if (total === 0) return null;

  const url = urls[idx] ?? urls[0];
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;

  return (
    <div
      style={{
        width: size,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 10,
          overflow: "hidden",
          background: "#f4f4f5",
          border: "1px solid #e4e4e7",
          position: "relative",
        }}
      >
        {isVideoUrl(url) ? (
          <video
            key={url}
            src={url}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <img
            key={url}
            src={url}
            alt={`Slide ${idx + 1}`}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {total > 1 && (
          <>
            {hasPrev && (
              <button
                type="button"
                onClick={() => setIdx((i) => i - 1)}
                style={navBtn("left")}
                aria-label="Previous"
              >
                &lsaquo;
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={() => setIdx((i) => i + 1)}
                style={navBtn("right")}
                aria-label="Next"
              >
                &rsaquo;
              </button>
            )}
            <div
              style={{
                position: "absolute",
                bottom: 4,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 4,
              }}
            >
              {urls.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: i === idx ? "#fff" : "rgba(255,255,255,0.5)",
                    border: "1px solid rgba(0,0,0,0.2)",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function navBtn(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 2,
    transform: "translateY(-50%)",
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.5)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
  };
}

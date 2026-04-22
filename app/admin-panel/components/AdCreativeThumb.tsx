"use client";

import Link from "next/link";

type Props = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  alt: string;
  href?: string | null;
  size?: number;
};

export default function AdCreativeThumb({
  imageUrl,
  videoUrl,
  alt,
  href,
  size = 64,
}: Props) {
  const content = (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        overflow: "hidden",
        background: "#f4f4f5",
        border: "1px solid #e4e4e7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#a1a1aa",
        fontSize: 10,
        flexShrink: 0,
      }}
      aria-label={alt}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : videoUrl ? (
        <video
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: "#000",
          }}
        />
      ) : (
        <span>No preview</span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none" }} title="Open ad details">
        {content}
      </Link>
    );
  }
  return content;
}

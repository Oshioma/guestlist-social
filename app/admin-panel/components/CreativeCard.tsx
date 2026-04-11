import type { Creative } from "../lib/types";
import StatusPill from "./StatusPill";
import { formatDate } from "../lib/utils";

export default function CreativeCard({ creative }: { creative: Creative }) {
  const typeLabel =
    creative.type === "image"
      ? "Image"
      : creative.type === "video"
        ? "Video"
        : "Carousel";

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          height: 120,
          borderRadius: 8,
          background: "#f4f4f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
          fontSize: 13,
          color: "#a1a1aa",
        }}
      >
        {typeLabel} preview
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
        {creative.name}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 12, color: "#71717a" }}>
          {formatDate(creative.createdAt)}
        </span>
        <StatusPill status={creative.status} />
      </div>
    </div>
  );
}

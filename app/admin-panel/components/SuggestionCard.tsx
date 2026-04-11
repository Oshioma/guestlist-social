import type { Suggestion } from "../lib/types";
import { priorityColor } from "../lib/utils";

export default function SuggestionCard({
  suggestion,
}: {
  suggestion: Suggestion;
}) {
  const { bg, text } = priorityColor(suggestion.priority);

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: "1px solid #e4e4e7",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {suggestion.title}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            background: bg,
            color: text,
            textTransform: "capitalize",
          }}
        >
          {suggestion.priority}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
        {suggestion.description}
      </p>
    </div>
  );
}

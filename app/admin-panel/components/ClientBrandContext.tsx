"use client";

import { useState, useTransition } from "react";
import { updateBrandContextAction } from "../lib/client-actions";
import type { BrandContext } from "../lib/types";

type Props = {
  clientId: string;
  initialContext: BrandContext;
};

const EMPTY: BrandContext = {
  toneOfVoice: "",
  targetAudience: "",
  offers: "",
  bannedWords: "",
  ctaStyle: "",
  visualStyle: "",
  hashtagsPolicy: "",
  platformRules: "",
};

const FIELDS: {
  key: keyof BrandContext;
  label: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "toneOfVoice",
    label: "Tone of voice",
    placeholder:
      "e.g. Warm, premium, relaxed. Never corporate. Think sun-drenched Sunday morning.",
    rows: 2,
  },
  {
    key: "targetAudience",
    label: "Target audience",
    placeholder:
      "e.g. Health-conscious families and couples aged 28–45 in Dubai. Tourists staying nearby. Expats who care about organic food.",
    rows: 2,
  },
  {
    key: "offers",
    label: "Offers & products",
    placeholder:
      "e.g. Breakfast bowls, cold-press smoothies, sunset dinners, beachside yoga sessions, organic kids menu.",
    rows: 3,
  },
  {
    key: "bannedWords",
    label: "Banned words & phrases",
    placeholder:
      "e.g. cheap, deal, discount, hustle, fast food, junk. Never say 'affordable'.",
    rows: 2,
  },
  {
    key: "ctaStyle",
    label: "CTA style",
    placeholder:
      "e.g. Soft invitations. 'Reserve your table', 'Join us this weekend', 'DM to book'. Never hard sell.",
    rows: 2,
  },
  {
    key: "visualStyle",
    label: "Visual style",
    placeholder:
      "e.g. Natural light, earthy tones, linen textures, overhead flat lays of food, candid lifestyle shots. No stock photos.",
    rows: 2,
  },
  {
    key: "hashtagsPolicy",
    label: "Hashtags policy",
    placeholder:
      "e.g. Max 5 hashtags per post. Always include #OrganizaBar. Mix location (#Dubai, #JBR) with niche (#OrganicEats, #HealthyDubai).",
    rows: 2,
  },
  {
    key: "platformRules",
    label: "Platform rules",
    placeholder:
      "e.g. Instagram Feed: polished, aspirational. Stories: behind-the-scenes, polls, countdowns. Reels: food prep, ambience, team. Facebook: longer captions, event posts.",
    rows: 3,
  },
];

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#18181b",
  background: "#fafafa",
  resize: "vertical",
  boxSizing: "border-box",
  lineHeight: 1.6,
};

export default function ClientBrandContext({ clientId, initialContext }: Props) {
  const [ctx, setCtx] = useState<BrandContext>({
    ...EMPTY,
    ...initialContext,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty =
    JSON.stringify(ctx) !== JSON.stringify({ ...EMPTY, ...initialContext });

  function set(key: keyof BrandContext, value: string) {
    setCtx((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateBrandContextAction(clientId, ctx);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
        maxWidth: 720,
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}
        >
          Brand context
        </h2>
        <p
          style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}
        >
          This is what the AI reads before generating any post ideas for this
          client. The more detail here, the better the output.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {FIELDS.map(({ key, label, placeholder, rows }) => (
          <label
            key={key}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span style={labelStyle}>{label}</span>
            <textarea
              value={ctx[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              rows={rows}
              style={textareaStyle}
            />
          </label>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 20,
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !isDirty}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: isPending || !isDirty ? "#e4e4e7" : "#18181b",
            color: isPending || !isDirty ? "#a1a1aa" : "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending || !isDirty ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Saving..." : "Save brand context"}
        </button>

        {error && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
        )}
        {saved && !isDirty && (
          <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

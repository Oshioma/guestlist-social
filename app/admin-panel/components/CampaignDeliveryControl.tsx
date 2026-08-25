"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCampaignDeliveryAction } from "../lib/campaign-actions";

type Props = {
  clientId: string;
  campaignId: string;
  /** Daily budget in pounds, as stored on the campaign. */
  dailyBudget: number;
  live: boolean;
  /** False when the campaign was never created in Meta — it cannot spend. */
  inMeta: boolean;
  adCount: number;
};

const money = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * The switch between "costs nothing" and "spends money", with the number said
 * out loud before it is committed. Turning delivery on asks for a second,
 * deliberate confirmation; turning it off never does — stopping spend should
 * be one click.
 */
export default function CampaignDeliveryControl({
  clientId,
  campaignId,
  dailyBudget,
  live,
  inMeta,
  adCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function apply(next: boolean) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      try {
        const res = await setCampaignDeliveryAction(clientId, campaignId, next);
        if (!res.ok) {
          setError(res.error ?? "Could not change delivery.");
          return;
        }
        if (res.dryRun) {
          setNote(
            "Dry-run mode is on (META_EXECUTE_DRY_RUN), so nothing was sent to Meta and no money is committed."
          );
          return;
        }
        setConfirming(false);
        router.refresh();
      } catch (err) {
        setError(
          `The change could not be sent — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  const weekly = dailyBudget * 7;
  const monthly = dailyBudget * 30;

  return (
    <div
      style={{
        border: `1px solid ${live ? "#bbf7d0" : "#e4e4e7"}`,
        background: live ? "#f0fdf4" : "#fafafa",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: live ? "#16a34a" : "#a1a1aa",
            flexShrink: 0,
          }}
        />
        <strong style={{ fontSize: 14, color: "#18181b" }}>
          {live ? "Live — spending" : "Not spending"}
        </strong>
        <span style={{ fontSize: 13, color: "#52525b" }}>
          {live
            ? `Up to ${money(dailyBudget)} a day is being spent from now until you pause it.`
            : dailyBudget > 0
              ? `Nothing has been committed. Switching on spends up to ${money(dailyBudget)} a day.`
              : "Nothing has been committed. This campaign has no daily budget set."}
        </span>
      </div>

      {!live && dailyBudget > 0 && (
        <div style={{ fontSize: 12, color: "#71717a" }}>
          That is about {money(weekly)} a week, {money(monthly)} a month, and it
          keeps going until you pause it or the end date you set in Meta.
        </div>
      )}

      {!inMeta && (
        <div style={{ fontSize: 12, color: "#92400e" }}>
          This campaign only exists here, not in Meta, so it cannot spend
          anything yet.
        </div>
      )}

      {inMeta && adCount === 0 && !live && (
        <div style={{ fontSize: 12, color: "#92400e" }}>
          There are no ads in it yet — switching on would spend nothing until
          you add one.
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "#991b1b",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "8px 10px",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {note && (
        <div
          style={{
            fontSize: 12,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "8px 10px",
            lineHeight: 1.5,
          }}
        >
          {note}
        </div>
      )}

      {live ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(false)}
          style={{
            alignSelf: "flex-start",
            border: "1px solid #e4e4e7",
            background: "#fff",
            color: "#18181b",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 10,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Pausing…" : "Pause spending"}
        </button>
      ) : confirming ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#18181b", lineHeight: 1.5 }}>
            <strong>This starts real spend.</strong> Meta will begin delivering
            immediately and charging up to {money(dailyBudget)} a day.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={pending || !inMeta}
              onClick={() => apply(true)}
              style={{
                border: "none",
                background: "#16a34a",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 10,
                cursor: pending ? "wait" : "pointer",
                opacity: inMeta ? 1 : 0.5,
              }}
            >
              {pending ? "Switching on…" : `Yes — spend up to ${money(dailyBudget)}/day`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              style={{
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#52525b",
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!inMeta}
          onClick={() => setConfirming(true)}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: inMeta ? "#18181b" : "#d4d4d8",
            color: inMeta ? "#fff" : "#a1a1aa",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 10,
            cursor: inMeta ? "pointer" : "not-allowed",
          }}
        >
          Switch on…
        </button>
      )}
    </div>
  );
}

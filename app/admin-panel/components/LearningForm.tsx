"use client";

import { useState, useTransition } from "react";

export default function LearningForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await action(formData);
          } catch (err) {
            setError("Could not save learning.");
          }
        });
      }}
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <input name="problem" placeholder="Problem (e.g. low CTR)" required />

      <input
        name="changeMade"
        placeholder="What did you change?"
        required
      />

      <input
        name="result"
        placeholder="Result (e.g. CTR increased to 2.3%)"
      />

      <input
        name="outcome"
        placeholder="Outcome (e.g. winner / still testing)"
      />

      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "#18181b",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        {isPending ? "Saving..." : "Save learning"}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: "red" }}>{error}</div>
      )}
    </form>
  );
}

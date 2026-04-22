"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  reorderConsultationDefaultQuestionsAction,
  type ReorderConsultationDefaultsState,
} from "../lib/consultation-actions";

type Props = {
  initialQuestions: string[];
};

const INITIAL_REORDER_STATE: ReorderConsultationDefaultsState = {
  error: null,
  success: null,
};

function moveItem(list: string[], fromIndex: number, toIndex: number) {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (moved == null) return list;
  next.splice(toIndex, 0, moved);
  return next;
}

export default function ConsultationDefaultQuestionsEditor({
  initialQuestions,
}: Props) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [state, action, pending] = useActionState(
    reorderConsultationDefaultQuestionsAction,
    INITIAL_REORDER_STATE
  );

  const orderPayload = useMemo(() => JSON.stringify(questions), [questions]);

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
        Drag and drop rows to reorder the default consultation questions, then
        click Save order.
      </p>
      {state.error ? (
        <div
          style={{
            border: "1px solid #fecaca",
            borderRadius: 10,
            background: "#fff5f5",
            color: "#991b1b",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div
          style={{
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            background: "#f0fdf4",
            color: "#166534",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {state.success}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((question, index) => (
          <div
            key={`${question}-${index}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={() => {
              if (dragIndex == null || dragIndex === index) return;
              setQuestions((previous) => moveItem(previous, dragIndex, index));
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              alignItems: "center",
              gap: 10,
              border: "1px solid #e4e4e7",
              borderRadius: 10,
              padding: "8px 10px",
              background: dragIndex === index ? "#f4f4f5" : "#fafafa",
              cursor: "grab",
            }}
            aria-label={`Reorder question ${index + 1}`}
          >
            <span
              style={{
                fontSize: 12,
                color: "#71717a",
                border: "1px solid #d4d4d8",
                borderRadius: 6,
                padding: "2px 6px",
                background: "#fff",
              }}
            >
              ⋮⋮
            </span>
            <span style={{ fontSize: 13, color: "#18181b" }}>{question}</span>
          </div>
        ))}
      </div>
      <form action={action}>
        <input type="hidden" name="orderedPrompts" value={orderPayload} />
        <button
          type="submit"
          disabled={pending}
          style={{
            border: "1px solid #d4d4d8",
            borderRadius: 8,
            background: "#fff",
            color: "#18181b",
            padding: "7px 11px",
            fontSize: 12,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.75 : 1,
          }}
        >
          {pending ? "Saving..." : "Save order"}
        </button>
      </form>
    </div>
  );
}

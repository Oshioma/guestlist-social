"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  reorderConsultationDefaultQuestionsAction,
  type ReorderConsultationDefaultsState,
} from "../lib/consultation-actions";

type Props = {
  initialQuestions: string[];
};

type EditableQuestion = {
  id: string;
  prompt: string;
};

const INITIAL_REORDER_STATE: ReorderConsultationDefaultsState = {
  error: null,
  success: null,
};

function createEditableQuestions(prompts: string[]): EditableQuestion[] {
  return prompts.map((prompt, index) => ({
    id: `question-${index}-${Math.random().toString(36).slice(2, 9)}`,
    prompt,
  }));
}

function moveItem(
  list: EditableQuestion[],
  fromIndex: number,
  toIndex: number
) {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (moved == null) return list;
  next.splice(toIndex, 0, moved);
  return next;
}

export default function ConsultationDefaultQuestionsEditor({
  initialQuestions,
}: Props) {
  const [questions, setQuestions] = useState(() =>
    createEditableQuestions(initialQuestions)
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    reorderConsultationDefaultQuestionsAction,
    INITIAL_REORDER_STATE
  );

  const orderPayload = useMemo(
    () => JSON.stringify(questions.map((question) => question.prompt)),
    [questions]
  );

  useEffect(() => {
    setQuestions(createEditableQuestions(initialQuestions));
    setLocalError(null);
    setConfirmDeleteId(null);
  }, [initialQuestions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
        Drag and drop these question boxes to reorder. Edit text directly, add
        or delete rows, then click Save changes.
      </p>
      {localError ? (
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
          {localError}
        </div>
      ) : null}
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
            key={question.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={() => {
              if (dragIndex == null || dragIndex === index) return;
              setQuestions((previous) => moveItem(previous, dragIndex, index));
              setDragIndex(null);
              setLocalError(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
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
            <input
              type="text"
              value={question.prompt}
              onChange={(event) => {
                const nextValue = event.target.value;
                setQuestions((previous) =>
                  previous.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, prompt: nextValue } : row
                  )
                );
                setLocalError(null);
              }}
              style={{
                width: "100%",
                border: "1px solid #d4d4d8",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                background: "#fff",
                color: "#18181b",
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (questions.length <= 1) return;

                if (confirmDeleteId !== question.id) {
                  setConfirmDeleteId(question.id);
                  return;
                }

                setQuestions((previous) =>
                  previous.filter((row) => row.id !== question.id)
                );
                setConfirmDeleteId(null);
                setLocalError(null);
              }}
              disabled={questions.length <= 1}
              style={{
                border:
                  confirmDeleteId === question.id
                    ? "1px solid #ef4444"
                    : "1px solid #fecaca",
                borderRadius: 8,
                background:
                  confirmDeleteId === question.id ? "#fee2e2" : "#fff5f5",
                color:
                  confirmDeleteId === question.id ? "#991b1b" : "#b91c1c",
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: questions.length <= 1 ? "not-allowed" : "pointer",
                opacity: questions.length <= 1 ? 0.55 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {confirmDeleteId === question.id ? "Confirm delete" : "Delete"}
            </button>
          </div>
        ))}
      </div>
      {confirmDeleteId ? (
        <p style={{ margin: 0, fontSize: 12, color: "#991b1b" }}>
          Click <strong>Confirm delete</strong> again to remove that question.
        </p>
      ) : null}
      <div>
        <button
          type="button"
          onClick={() => {
            setQuestions((previous) => [
              ...previous,
              {
                id: `question-new-${Math.random().toString(36).slice(2, 9)}`,
                prompt: "",
              },
            ]);
            setLocalError(null);
          }}
          style={{
            border: "none",
            borderRadius: 8,
            background: "#18181b",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add question
        </button>
      </div>
      <form
        action={action}
        onSubmit={(event) => {
          const hasEmptyPrompt = questions.some(
            (question) => question.prompt.trim().length === 0
          );
          if (confirmDeleteId) {
            event.preventDefault();
            setLocalError(
              "Confirm or cancel the pending delete before saving changes."
            );
            return;
          }
          if (hasEmptyPrompt) {
            event.preventDefault();
            setLocalError("Fill or delete empty questions before saving.");
            return;
          }
          setLocalError(null);
        }}
      >
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
          {pending ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}

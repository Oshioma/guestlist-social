"use client";

import { useActionState } from "react";
import { submitConsultationAction } from "./actions";

type Question = {
  id: number;
  prompt: string;
};

type Props = {
  clientId: number;
  formId: number;
  questions: Question[];
};

const INITIAL_STATE = {
  error: null as string | null,
  success: null as string | null,
};

export default function ConsultationForm({ clientId, formId, questions }: Props) {
  const formAction = submitConsultationAction.bind(
    null,
    String(clientId),
    formId
  );
  const [state, action, pending] = useActionState(formAction, INITIAL_STATE);

  return (
    <form
      action={action}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 20,
      }}
    >
      {state.error ? (
        <div
          style={{
            border: "1px solid #fecaca",
            borderRadius: 10,
            background: "#fff5f5",
            color: "#991b1b",
            fontSize: 13,
            padding: "10px 12px",
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
            fontSize: 13,
            padding: "10px 12px",
          }}
        >
          {state.success}
        </div>
      ) : null}

      {questions.map((question) => (
        <label
          key={question.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#0f172a",
              lineHeight: 1.5,
            }}
          >
            {question.prompt}
          </span>
          <textarea
            name={`question-${question.id}`}
            rows={4}
            style={{
              width: "100%",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "inherit",
              color: "#0f172a",
              resize: "vertical",
              background: "#fff",
              lineHeight: 1.6,
            }}
          />
        </label>
      ))}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 4,
          alignSelf: "flex-start",
          border: "none",
          borderRadius: 10,
          background: "#0f172a",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 16px",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.75 : 1,
        }}
      >
        {pending ? "Submitting..." : "Submit consultation"}
      </button>
    </form>
  );
}

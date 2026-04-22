"use client";

import { useActionState } from "react";
import {
  saveSingleConsultationSubmissionAnswersAction,
} from "../lib/consultation-actions";

type ConsultationQuestion = {
  id: number;
  prompt: string;
};

type ConsultationAnswer = {
  id: number;
  questionId: number | null;
  questionPrompt: string;
  answerText: string;
};

type ConsultationSubmission = {
  id: number;
  submittedAt: string;
  submittedBy: string | null;
  answers: ConsultationAnswer[];
};

type ConsultationForm = {
  id: number;
  title: string;
  isActive: boolean;
  questions: ConsultationQuestion[];
  submissions: ConsultationSubmission[];
};

type Props = {
  clientId: string;
  activeForm: ConsultationForm | null;
};

type SaveConsultationState = {
  error: string | null;
  success: string | null;
};

const INITIAL_SAVE_STATE: SaveConsultationState = {
  error: null,
  success: null,
};

function formatSubmittedAt(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildSubmissionPreview(submission: ConsultationSubmission) {
  const filled = submission.answers
    .map((answer) => answer.answerText.trim())
    .filter((answerText) => answerText.length > 0);
  if (filled.length === 0) return "No answers entered yet.";
  const merged = filled.join(" · ").replace(/\s+/g, " ").trim();
  if (merged.length <= 180) return merged;
  return `${merged.slice(0, 180)}…`;
}

export default function ClientConsultationAnswersManager({
  clientId,
  activeForm,
}: Props) {
  const selectedForm = activeForm;

  if (!selectedForm) {
    return (
      <details
        open
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          padding: 0,
          overflow: "hidden",
          maxWidth: 950,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            padding: "14px 16px",
            fontSize: 15,
            fontWeight: 700,
            color: "#18181b",
            listStyle: "none",
          }}
        >
          Consultation data
        </summary>
        <div style={{ borderTop: "1px solid #f4f4f5", padding: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>
            No consultation form found yet for this client.
          </p>
        </div>
      </details>
    );
  }

  const submissions = [...selectedForm.submissions];
  const saveAnswersAction = saveSingleConsultationSubmissionAnswersAction.bind(
    null,
    clientId,
    selectedForm.id
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveAnswersAction,
    INITIAL_SAVE_STATE
  );
  const latestSubmission = submissions[0] ?? null;
  const answersByQuestionId = new Map<number, ConsultationAnswer>();
  for (const answer of latestSubmission?.answers ?? []) {
    if (answer.questionId != null) {
      answersByQuestionId.set(Number(answer.questionId), answer);
    }
  }

  const knownQuestionIds = new Set(
    selectedForm.questions.map((question) => Number(question.id))
  );
  const orphanAnswers = (latestSubmission?.answers ?? []).filter(
    (answer) =>
      answer.questionId == null || !knownQuestionIds.has(Number(answer.questionId))
  );

  return (
    <details
      open
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 0,
        overflow: "hidden",
        maxWidth: 950,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          listStyle: "none",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
          Consultation data
        </span>
        <span
          style={{
            fontSize: 12,
            color: "#71717a",
            maxWidth: 620,
            whiteSpace: "normal",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            textAlign: "right",
          }}
        >
          {submissions.length > 0
            ? buildSubmissionPreview(submissions[0])
            : "No answers yet"}
        </span>
      </summary>

      <div
        style={{
          borderTop: "1px solid #f4f4f5",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {latestSubmission ? (
          <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
            Last updated: {formatSubmittedAt(latestSubmission.submittedAt)}
          </p>
        ) : null}

        {saveState.error ? (
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
            {saveState.error}
          </div>
        ) : null}
        {saveState.success ? (
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
            {saveState.success}
          </div>
        ) : null}

        <form action={saveAction}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {selectedForm.questions.map((question) => (
              <label
                key={question.id}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <span style={{ fontSize: 12, color: "#3f3f46", fontWeight: 600 }}>
                  {question.prompt}
                </span>
                <textarea
                  name={`question-${question.id}`}
                  defaultValue={
                    answersByQuestionId.get(Number(question.id))?.answerText ?? ""
                  }
                  rows={2}
                  style={textAreaStyle}
                />
              </label>
            ))}
            {orphanAnswers.length > 0 ? (
              <div
                style={{
                  borderTop: "1px solid #f4f4f5",
                  paddingTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {orphanAnswers.map((answer) => (
                  <div key={`orphan-${answer.id}`}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#52525b",
                        fontWeight: 600,
                      }}
                    >
                      {answer.questionPrompt || "Additional answer"}
                    </p>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#3f3f46",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {answer.answerText.trim() || "—"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div>
              <button
                type="submit"
                disabled={savePending}
                style={{
                  ...secondaryButtonStyle,
                  cursor: savePending ? "wait" : "pointer",
                  opacity: savePending ? 0.75 : 1,
                }}
              >
                {savePending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </details>
  );
}

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: "#18181b",
  fontFamily: "inherit",
  resize: "vertical",
  background: "#fff",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  background: "#fff",
  color: "#18181b",
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

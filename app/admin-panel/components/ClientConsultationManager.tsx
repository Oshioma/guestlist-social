"use client";

import { useActionState } from "react";
import {
  type CreateConsultationFormState,
  addConsultationQuestionAction,
  createConsultationFormAction,
  deleteConsultationFormAction,
  deleteConsultationQuestionAction,
  updateConsultationFormAction,
  updateConsultationQuestionAction,
} from "../lib/consultation-actions";

type ConsultationQuestion = {
  id: number;
  prompt: string;
  sortOrder: number;
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
  forms: ConsultationForm[];
};

const INITIAL_CREATE_STATE: CreateConsultationFormState = {
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

export default function ClientConsultationManager({ clientId, forms }: Props) {
  const createForm = createConsultationFormAction.bind(null, clientId);
  const [createState, createAction, createPending] = useActionState(
    createForm,
    INITIAL_CREATE_STATE
  );

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
        maxWidth: 900,
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
          Consultation form
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
          Build the client briefing questionnaire, then review submitted responses
          here. Questions can be added, edited, or removed at any time.
        </p>
      </div>

      <form
        action={createAction}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) auto auto",
          gap: 10,
          alignItems: "center",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #e4e4e7",
          background: "#fafafa",
          marginBottom: 14,
        }}
      >
        <input
          name="title"
          defaultValue="Consultation"
          placeholder="Form title"
          style={inputStyle}
          aria-label="Form title"
        />
        <label
          style={{
            fontSize: 12,
            color: "#52525b",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <input type="checkbox" name="seedDefaults" defaultChecked />
          Add default questions
        </label>
        <button
          type="submit"
          disabled={createPending}
          style={{ ...primaryButtonStyle, opacity: createPending ? 0.75 : 1 }}
        >
          {createPending ? "Creating..." : "New form"}
        </button>
      </form>
      {createState.error ? (
        <div
          style={{
            marginTop: -4,
            marginBottom: 12,
            border: "1px solid #fecaca",
            borderRadius: 10,
            background: "#fff5f5",
            color: "#991b1b",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {createState.error}
        </div>
      ) : null}
      {createState.success ? (
        <div
          style={{
            marginTop: -4,
            marginBottom: 12,
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            background: "#f0fdf4",
            color: "#166534",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {createState.success}
        </div>
      ) : null}

      {forms.length === 0 ? (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            border: "1px solid #e4e4e7",
            fontSize: 13,
            color: "#71717a",
            background: "#fafafa",
          }}
        >
          No consultation form yet. Create one to start collecting answers from
          the client portal.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {forms.map((form) => {
            const updateForm = updateConsultationFormAction.bind(
              null,
              clientId,
              form.id
            );
            const deleteForm = deleteConsultationFormAction.bind(
              null,
              clientId,
              form.id
            );
            const addQuestion = addConsultationQuestionAction.bind(
              null,
              clientId,
              form.id
            );

            return (
              <details
                key={form.id}
                open={form.isActive}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    listStyle: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
                      {form.title}
                    </span>
                    {form.isActive ? (
                      <span style={activeBadgeStyle}>Active</span>
                    ) : (
                      <span style={inactiveBadgeStyle}>Inactive</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "#71717a" }}>
                    {form.questions.length} questions · {form.submissions.length} submissions
                  </span>
                </summary>

                <div
                  style={{
                    borderTop: "1px solid #f4f4f5",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "start",
                    }}
                  >
                    <form
                      action={updateForm}
                      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
                    >
                      <input
                        name="title"
                        defaultValue={form.title}
                        style={{ ...inputStyle, minWidth: 220 }}
                        aria-label="Form title"
                      />
                      <label
                        style={{
                          fontSize: 12,
                          color: "#52525b",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <input type="checkbox" name="isActive" defaultChecked={form.isActive} />
                        Active form
                      </label>
                      <button type="submit" style={secondaryButtonStyle}>
                        Save form
                      </button>
                    </form>
                    <form action={deleteForm}>
                      <button
                        type="submit"
                        style={{
                          ...dangerButtonStyle,
                          minWidth: 100,
                        }}
                      >
                        Delete form
                      </button>
                    </form>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#3f3f46" }}>
                      Questions
                    </h3>
                    {form.questions.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
                        No questions yet.
                      </p>
                    ) : (
                      form.questions.map((question) => {
                        const updateQuestion = updateConsultationQuestionAction.bind(
                          null,
                          clientId,
                          form.id,
                          question.id
                        );
                        const deleteQuestion = deleteConsultationQuestionAction.bind(
                          null,
                          clientId,
                          form.id,
                          question.id
                        );

                        return (
                          <div
                            key={question.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: 8,
                              alignItems: "center",
                              border: "1px solid #f4f4f5",
                              borderRadius: 10,
                              padding: 10,
                              background: "#fafafa",
                            }}
                          >
                            <form
                              action={updateQuestion}
                              style={{ display: "flex", gap: 8, alignItems: "center" }}
                            >
                              <input
                                name="prompt"
                                defaultValue={question.prompt}
                                style={inputStyle}
                                aria-label={`Question ${question.sortOrder}`}
                              />
                              <button type="submit" style={secondaryButtonStyle}>
                                Save
                              </button>
                            </form>
                            <form action={deleteQuestion}>
                              <button type="submit" style={dangerButtonStyle}>
                                Delete
                              </button>
                            </form>
                          </div>
                        );
                      })
                    )}
                    <form
                      action={addQuestion}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      <input
                        name="prompt"
                        placeholder="Add a new question"
                        style={inputStyle}
                        required
                      />
                      <button type="submit" style={primaryButtonStyle}>
                        Add question
                      </button>
                    </form>
                  </div>

                  <details>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#3f3f46",
                      }}
                    >
                      Submissions ({form.submissions.length})
                    </summary>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {form.submissions.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
                          No submissions yet.
                        </p>
                      ) : (
                        form.submissions.map((submission, index) => (
                          <details
                            key={submission.id}
                            style={{
                              border: "1px solid #e4e4e7",
                              borderRadius: 10,
                              background: "#fafafa",
                            }}
                          >
                            <summary
                              style={{
                                cursor: "pointer",
                                padding: "10px 12px",
                                fontSize: 12,
                                color: "#3f3f46",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span>
                                Submission {form.submissions.length - index} ·{" "}
                                {formatSubmittedAt(submission.submittedAt)}
                              </span>
                              <span style={{ color: "#71717a" }}>
                                {submission.answers.filter((answer) => answer.answerText.trim()).length}/
                                {submission.answers.length} answered
                              </span>
                            </summary>
                            <div
                              style={{
                                borderTop: "1px solid #e4e4e7",
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                              {submission.answers.map((answer) => (
                                <div key={answer.id}>
                                  <p style={{ margin: 0, fontSize: 11, color: "#71717a" }}>
                                    {answer.questionPrompt}
                                  </p>
                                  <p
                                    style={{
                                      margin: "3px 0 0",
                                      fontSize: 13,
                                      color: "#18181b",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {answer.answerText.trim() || "—"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))
                      )}
                    </div>
                  </details>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: "#18181b",
  background: "#fff",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#18181b",
  color: "#fff",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
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

const dangerButtonStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 8,
  background: "#fff5f5",
  color: "#b91c1c",
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const activeBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#166534",
  background: "#dcfce7",
  borderRadius: 999,
  padding: "2px 8px",
};

const inactiveBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#52525b",
  background: "#f4f4f5",
  borderRadius: 999,
  padding: "2px 8px",
};

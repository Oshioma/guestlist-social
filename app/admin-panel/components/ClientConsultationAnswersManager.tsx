"use client";

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
  void clientId;
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
            ? `${submissions.length} entries · ${buildSubmissionPreview(submissions[0])}`
            : "No entries yet"}
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
        {submissions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>
            No consultation entries yet.
          </p>
        ) : (
          submissions.map((submission, index) => {
            const answersByQuestionId = new Map<number, ConsultationAnswer>();
            for (const answer of submission.answers) {
              if (answer.questionId != null) {
                answersByQuestionId.set(Number(answer.questionId), answer);
              }
            }

            const knownQuestionIds = new Set(
              selectedForm.questions.map((question) => Number(question.id))
            );
            const orphanAnswers = submission.answers
              .filter(
                (answer) =>
                  answer.questionId == null ||
                  !knownQuestionIds.has(Number(answer.questionId))
              )
              .map((answer) => ({
                key: `orphan-${answer.id}`,
                prompt: answer.questionPrompt || "Additional answer",
                answerText: answer.answerText,
              }));

            const orderedAnswers = selectedForm.questions.map((question) => ({
              key: `question-${submission.id}-${question.id}`,
              prompt: question.prompt,
              answerText: answersByQuestionId.get(question.id)?.answerText ?? "",
            }));

            const displayAnswers = [...orderedAnswers, ...orphanAnswers];

            return (
              <details
                key={submission.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  background: "#fff",
                  overflow: "hidden",
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
                      Entry {submissions.length - index}
                    </span>
                    <span style={{ fontSize: 11, color: "#71717a" }}>
                      {formatSubmittedAt(submission.submittedAt)}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#52525b",
                      maxWidth: 520,
                      whiteSpace: "normal",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {buildSubmissionPreview(submission)}
                  </span>
                </summary>

                <div
                  style={{
                    borderTop: "1px solid #f4f4f5",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {displayAnswers.map((answer) => (
                    <div key={answer.key}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: "#3f3f46",
                          fontWeight: 600,
                        }}
                      >
                        {answer.prompt}
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0",
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
            );
          })
        )}
      </div>
    </details>
  );
}

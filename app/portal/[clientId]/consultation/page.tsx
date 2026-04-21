import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "@/app/admin-panel/lib/viewer";
import ConsultationForm from "./ConsultationForm";

export const dynamic = "force-dynamic";

type FormRow = {
  id: number;
  title: string;
  is_active: boolean;
  updated_at: string | null;
};

export default async function PortalConsultationPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);

  if (!Number.isFinite(clientId)) {
    notFound();
  }

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) {
    notFound();
  }

  const supabase = await createClient();

  const formsRes = await supabase
    .from("consultation_forms")
    .select("id, title, is_active, updated_at")
    .eq("client_id", clientId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });

  const formsMissing = formsRes.error?.code === "42P01";
  if (formsMissing) {
    return (
      <div
        style={{
          maxWidth: 860,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
          Consultation
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
          Consultation setup is in progress. Please check back shortly.
        </p>
      </div>
    );
  }

  const allForms = (formsRes.data ?? []) as FormRow[];
  const selectedForm =
    allForms.find((row) => Boolean(row.is_active)) ?? allForms[0] ?? null;

  if (!selectedForm) {
    return (
      <div
        style={{
          maxWidth: 860,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
          Consultation
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
          Your consultation form is being prepared by your account manager.
        </p>
      </div>
    );
  }

  const [questionsRes, latestSubmissionRes] = await Promise.all([
    supabase
      .from("consultation_questions")
      .select("id, prompt, sort_order")
      .eq("form_id", selectedForm.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("consultation_submissions")
      .select("id, submitted_at")
      .eq("client_id", clientId)
      .eq("form_id", selectedForm.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const questionsMissing = questionsRes.error?.code === "42P01";
  const submissionsMissing = latestSubmissionRes.error?.code === "42P01";
  const questions = questionsMissing
    ? []
    : ((questionsRes.data ?? []) as Array<{
        id: number;
        prompt: string | null;
        sort_order: number | null;
      }>).map((row) => ({
        id: row.id,
        prompt: row.prompt ?? "",
        sortOrder: Number(row.sort_order ?? 0),
      }));
  const latestSubmission =
    submissionsMissing
      ? null
      : ((latestSubmissionRes.data as { id: number; submitted_at: string } | null) ??
          null);

  const answerRes =
    latestSubmission === null
      ? {
          data: [] as Array<{
            question_id: number | null;
            answer_text: string | null;
          }>,
          error: null,
        }
      : await supabase
          .from("consultation_answers")
          .select("question_id, answer_text")
          .eq("submission_id", latestSubmission.id);

  const answersMissing = answerRes.error?.code === "42P01";
  const initialAnswersByQuestionId = answersMissing
    ? {}
    : ((answerRes.data ?? []) as Array<{
        question_id: number | null;
        answer_text: string | null;
      }>).reduce<Record<string, string>>((acc, row) => {
        if (row.question_id == null) return acc;
        acc[String(row.question_id)] = row.answer_text ?? "";
        return acc;
      }, {});

  const latestSubmissionLabel = latestSubmission?.submitted_at
    ? new Date(latestSubmission.submitted_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#64748b",
          }}
        >
          Client portal
        </div>
        <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
          {selectedForm.title || "Consultation"}
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 14,
            color: "#475569",
            lineHeight: 1.6,
            maxWidth: 740,
          }}
        >
          Fill this in when you can. Your responses help us align copy, timing,
          campaigns, and creative decisions with your real business priorities.
        </p>
      </div>

      <ConsultationForm
        clientId={clientId}
        formId={selectedForm.id}
        questions={questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
        }))}
        initialAnswersByQuestionId={initialAnswersByQuestionId}
        latestSubmissionLabel={latestSubmissionLabel}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "../../../../../lib/supabase/server";
import ClientForm from "../../../components/ClientForm";
import ClientAiInstructions from "../../../components/ClientAiInstructions";
import ClientBrandContext from "../../../components/ClientBrandContext";
import ClientConsultationAnswersManager from "../../../components/ClientConsultationAnswersManager";
import ClientPhotoLibrary from "../../../components/ClientPhotoLibrary";
import { ensureDefaultConsultationFormForClient } from "../../../lib/consultation-actions";
import { updateClientAction } from "../../../lib/client-actions";
import { mapClientStatus } from "../../../lib/mappers";
import type { BrandContext } from "../../../lib/types";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function EditClientPage({ params }: Props) {
  const { clientId } = await params;
  const supabase = await createClient();

  await ensureDefaultConsultationFormForClient(clientId);

  const [clientRes, formsRes, questionsRes, submissionsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase
      .from("consultation_forms")
      .select("id, title, is_active")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("consultation_questions")
      .select("id, form_id, prompt, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("consultation_submissions")
      .select("id, form_id, submitted_at, submitted_by")
      .eq("client_id", clientId)
      .order("submitted_at", { ascending: false })
      .limit(100),
  ]);

  const client = clientRes.data;
  const error = clientRes.error;

  if (error || !client) {
    notFound();
  }

  const formRows =
    formsRes.error?.code === "42P01" ? [] : (formsRes.data ?? []);
  const questionRows =
    questionsRes.error?.code === "42P01" ? [] : (questionsRes.data ?? []);
  const submissionRows =
    submissionsRes.error?.code === "42P01" ? [] : (submissionsRes.data ?? []);

  const formIds = new Set(formRows.map((row) => Number((row as { id: number }).id)));
  const filteredSubmissions = submissionRows.filter((row) =>
    formIds.has(Number((row as { form_id: number }).form_id))
  );
  const filteredQuestions = questionRows.filter((row) =>
    formIds.has(Number((row as { form_id: number }).form_id))
  );

  const submissionIds = filteredSubmissions.map((row) =>
    Number((row as { id: number }).id)
  );

  const answersRes =
    submissionIds.length === 0
      ? { data: [] as Array<{ id: number; submission_id: number; question_id: number | null; question_prompt: string; answer_text: string }>, error: null }
      : await supabase
          .from("consultation_answers")
          .select("id, submission_id, question_id, question_prompt, answer_text")
          .in("submission_id", submissionIds)
          .order("id", { ascending: true });

  const answerRows =
    answersRes.error?.code === "42P01" ? [] : (answersRes.data ?? []);

  const answersBySubmission = new Map<
    number,
    Array<{
      id: number;
      questionId: number | null;
      questionPrompt: string;
      answerText: string;
    }>
  >();
  for (const row of answerRows as Array<{
    id: number;
    submission_id: number;
    question_id: number | null;
    question_prompt: string;
    answer_text: string;
  }>) {
    const submissionAnswers = answersBySubmission.get(row.submission_id) ?? [];
    submissionAnswers.push({
      id: row.id,
      questionId: row.question_id,
      questionPrompt: row.question_prompt ?? "",
      answerText: row.answer_text ?? "",
    });
    answersBySubmission.set(row.submission_id, submissionAnswers);
  }

  const questionsByForm = new Map<
    number,
    Array<{
      id: number;
      prompt: string;
    }>
  >();
  for (const row of filteredQuestions as Array<{
    id: number;
    form_id: number;
    prompt: string;
    sort_order: number;
  }>) {
    const existing = questionsByForm.get(row.form_id) ?? [];
    existing.push({
      id: row.id,
      prompt: row.prompt ?? "",
    });
    questionsByForm.set(row.form_id, existing);
  }

  const submissionsByForm = new Map<
    number,
    Array<{
      id: number;
      submittedAt: string;
      submittedBy: string | null;
      answers: Array<{
        id: number;
        questionId: number | null;
        questionPrompt: string;
        answerText: string;
      }>;
    }>
  >();
  for (const row of filteredSubmissions as Array<{
    id: number;
    form_id: number;
    submitted_at: string;
    submitted_by: string | null;
  }>) {
    const formSubmissions = submissionsByForm.get(row.form_id) ?? [];
    formSubmissions.push({
      id: row.id,
      submittedAt: row.submitted_at,
      submittedBy: row.submitted_by,
      answers: answersBySubmission.get(row.id) ?? [],
    });
    submissionsByForm.set(row.form_id, formSubmissions);
  }

  const consultationForms = (formRows as Array<{
    id: number;
    title: string;
    is_active: boolean;
  }>).map((row) => ({
    id: row.id,
    title: row.title ?? "Consultation",
    isActive: Boolean(row.is_active),
    questions: questionsByForm.get(row.id) ?? [],
    submissions: submissionsByForm.get(row.id) ?? [],
  }));
  const activeForm =
    consultationForms.find((form) => form.isActive) ?? consultationForms[0] ?? null;

  async function action(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";

    try {
      await updateClientAction(clientId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not update client.",
      };
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href={`/app/clients/${clientId}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#71717a", textDecoration: "none" }}
          >
            &larr; {client.name}
          </Link>
          <span style={{ color: "#d4d4d8" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>Edit</span>
        </div>
        <Link
          href={`/app/clients/${clientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 14px",
            borderRadius: 10,
            background: "#18181b",
            color: "#fff",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          View client
        </Link>
      </div>

      <ClientForm
        title={`Edit ${client.name}`}
        submitLabel="Save changes"
        action={action}
        initialValues={{
          name: client.name ?? "",
          platform: client.platform ?? "Meta",
          monthlyBudget: Number(client.monthly_budget ?? 0),
          status: mapClientStatus(client.status ?? "testing"),
          websiteUrl: client.website_url ?? "",
          notes: client.notes ?? "",
          industry: client.industry ?? "",
          metaAdAccountId: client.meta_ad_account_id ?? "",
        }}
      />

      <ClientAiInstructions
        clientId={clientId}
        initialInstructions={client.ai_instructions ?? ""}
      />

      <ClientPhotoLibrary clientId={clientId} />

      <ClientBrandContext
        clientId={clientId}
        initialContext={{
          toneOfVoice: (client.brand_context as BrandContext | null)?.toneOfVoice ?? "",
          targetAudience: (client.brand_context as BrandContext | null)?.targetAudience ?? "",
          offers: (client.brand_context as BrandContext | null)?.offers ?? "",
          bannedWords: (client.brand_context as BrandContext | null)?.bannedWords ?? "",
          ctaStyle: (client.brand_context as BrandContext | null)?.ctaStyle ?? "",
          visualStyle: (client.brand_context as BrandContext | null)?.visualStyle ?? "",
          hashtagsPolicy: (client.brand_context as BrandContext | null)?.hashtagsPolicy ?? "",
          platformRules: (client.brand_context as BrandContext | null)?.platformRules ?? "",
        }}
      />

      <ClientConsultationAnswersManager
        clientId={clientId}
        activeForm={activeForm}
      />
    </div>
  );
}

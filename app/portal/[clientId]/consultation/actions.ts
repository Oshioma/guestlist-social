"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "@/app/admin-panel/lib/viewer";

export type SubmitConsultationState = {
  error: string | null;
  success: string | null;
};

export async function submitConsultationAction(
  clientIdValue: string,
  formId: number,
  _prevState: SubmitConsultationState,
  formData: FormData
): Promise<SubmitConsultationState> {
  const clientId = Number(clientIdValue);
  if (!Number.isFinite(clientId)) {
    return { error: "Invalid client.", success: null };
  }

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: form, error: formError } = await supabase
    .from("consultation_forms")
    .select("id, client_id, is_active")
    .eq("id", formId)
    .eq("client_id", clientId)
    .single();

  if (formError || !form) {
    return { error: "Consultation form not found.", success: null };
  }

  if (!form.is_active) {
    return { error: "This consultation form is not active.", success: null };
  }

  const { data: questions, error: questionsError } = await supabase
    .from("consultation_questions")
    .select("id, prompt")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });

  if (questionsError) {
    console.error("submitConsultationAction questions error:", questionsError);
    return { error: "Could not read consultation questions.", success: null };
  }

  if (!questions || questions.length === 0) {
    return { error: "This consultation form has no questions yet.", success: null };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("consultation_submissions")
    .insert({
      form_id: formId,
      client_id: clientId,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    console.error("submitConsultationAction submission error:", submissionError);
    return { error: "Could not save your consultation response.", success: null };
  }

  const answers = questions.map((question) => {
    const raw = formData.get(`question-${question.id}`);
    return {
      submission_id: submission.id,
      question_id: question.id,
      question_prompt: question.prompt ?? "",
      answer_text: String(raw ?? "").trim(),
    };
  });

  const { error: answersError } = await supabase
    .from("consultation_answers")
    .insert(answers);

  if (answersError) {
    console.error("submitConsultationAction answers error:", answersError);
    return { error: "Could not save every answer. Please try again.", success: null };
  }

  revalidatePath(`/portal/${clientId}/consultation`);
  revalidatePath(`/admin-panel/clients/${clientId}/edit`);
  revalidatePath(`/app/clients/${clientId}/edit`);

  return {
    error: null,
    success: "Thanks. Your consultation response was submitted.",
  };
}

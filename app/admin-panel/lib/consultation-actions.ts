"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { DEFAULT_CONSULTATION_QUESTIONS } from "./consultation-default-questions";

export type CreateConsultationFormState = {
  error: string | null;
  success: string | null;
};

/**
 * Ensure every client has at least one consultation form available.
 * This keeps the admin edit experience usable for older clients that were
 * created before consultation forms existed.
 */
export async function ensureDefaultConsultationFormForClient(clientId: string) {
  try {
    const safeClientId = sanitizeClientId(clientId);
    const supabase = await createClient();

    const { data: existingForms, error: existingFormsError } = await supabase
      .from("consultation_forms")
      .select("id")
      .eq("client_id", safeClientId)
      .limit(1);

    if (existingFormsError) {
      if (existingFormsError.code === "42P01") {
        return;
      }
      console.error(
        "ensureDefaultConsultationFormForClient lookup error:",
        existingFormsError
      );
      return;
    }

    if ((existingForms?.length ?? 0) > 0) {
      return;
    }

    const { data: createdForm, error: createFormError } = await supabase
      .from("consultation_forms")
      .insert({
        client_id: safeClientId,
        title: "Consultation",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createFormError || !createdForm) {
      if (createFormError?.code !== "42P01") {
        console.error(
          "ensureDefaultConsultationFormForClient create form error:",
          createFormError
        );
      }
      return;
    }

    const questions = DEFAULT_CONSULTATION_QUESTIONS.map((prompt, index) => ({
      form_id: createdForm.id,
      prompt,
      sort_order: index + 1,
      updated_at: new Date().toISOString(),
    }));

    const { error: createQuestionsError } = await supabase
      .from("consultation_questions")
      .insert(questions);

    if (createQuestionsError && createQuestionsError.code !== "42P01") {
      console.error(
        "ensureDefaultConsultationFormForClient create questions error:",
        createQuestionsError
      );
    }
  } catch (error) {
    console.error("ensureDefaultConsultationFormForClient unexpected error:", error);
  }
}

function sanitizeClientId(clientId: string) {
  const normalized = String(clientId ?? "").trim();
  const numericValue = Number(normalized);
  if (!normalized || !Number.isFinite(numericValue)) {
    throw new Error("Missing client id.");
  }
  return String(numericValue);
}

function sanitizeTitle(rawValue: FormDataEntryValue | null) {
  const title = String(rawValue ?? "").trim();
  return title || "Consultation";
}

function sanitizePrompt(rawValue: FormDataEntryValue | null) {
  const prompt = String(rawValue ?? "").trim();
  if (!prompt) throw new Error("Question prompt is required.");
  return prompt;
}

function revalidateConsultationPaths(clientId: string) {
  revalidatePath(`/admin-panel/clients/${clientId}/edit`);
  revalidatePath(`/app/clients/${clientId}/edit`);
  revalidatePath(`/portal/${clientId}`);
  revalidatePath(`/portal/${clientId}/consultation`);
}

async function assertFormBelongsToClient(
  formId: number,
  clientId: string
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consultation_forms")
    .select("id")
    .eq("id", formId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Consultation form not found.");
  }
}

export async function createConsultationFormAction(
  clientId: string,
  _prevState: CreateConsultationFormState,
  formData: FormData
) : Promise<CreateConsultationFormState> {
  try {
    const safeClientId = sanitizeClientId(clientId);
    const title = sanitizeTitle(formData.get("title"));
    const seedDefaults = String(formData.get("seedDefaults") ?? "") === "on";

    const supabase = await createClient();
    const { data: form, error: formError } = await supabase
      .from("consultation_forms")
      .insert({
        client_id: safeClientId,
        title,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (formError || !form) {
      console.error("createConsultationFormAction form error:", formError);
      if (formError?.code === "42P01") {
        return {
          error:
            "Consultation tables are not available yet. Please run the latest database migration first.",
          success: null,
        };
      }
      return { error: "Could not create consultation form.", success: null };
    }

    await supabase
      .from("consultation_forms")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("client_id", safeClientId)
      .neq("id", form.id);

    if (seedDefaults) {
      const questions = DEFAULT_CONSULTATION_QUESTIONS.map((prompt, index) => ({
        form_id: form.id,
        prompt,
        sort_order: index + 1,
        updated_at: new Date().toISOString(),
      }));

      const { error: questionError } = await supabase
        .from("consultation_questions")
        .insert(questions);

      if (questionError) {
        console.error(
          "createConsultationFormAction default question error:",
          questionError
        );
        return {
          error: "Form was created, but default questions could not be added.",
          success: null,
        };
      }
    }

    revalidateConsultationPaths(safeClientId);
    return { error: null, success: "Consultation form created." };
  } catch (error) {
    console.error("createConsultationFormAction unexpected error:", error);
    return { error: "Could not create consultation form.", success: null };
  }
}

export async function updateConsultationFormAction(
  clientId: string,
  formId: number,
  formData: FormData
) {
  const safeClientId = sanitizeClientId(clientId);
  const title = sanitizeTitle(formData.get("title"));
  const isActive = String(formData.get("isActive") ?? "") === "on";

  await assertFormBelongsToClient(formId, safeClientId);

  const supabase = await createClient();
  if (isActive) {
    const { error: disableError } = await supabase
      .from("consultation_forms")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("client_id", safeClientId)
      .neq("id", formId);

    if (disableError) {
      console.error(
        "updateConsultationFormAction disable others error:",
        disableError
      );
      throw new Error("Could not update active consultation form.");
    }
  }

  const { error } = await supabase
    .from("consultation_forms")
    .update({
      title,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId)
    .eq("client_id", safeClientId);

  if (error) {
    console.error("updateConsultationFormAction error:", error);
    throw new Error("Could not update consultation form.");
  }

  revalidateConsultationPaths(safeClientId);
}

export async function deleteConsultationFormAction(
  clientId: string,
  formId: number
) {
  const safeClientId = sanitizeClientId(clientId);
  await assertFormBelongsToClient(formId, safeClientId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("consultation_forms")
    .delete()
    .eq("id", formId)
    .eq("client_id", safeClientId);

  if (error) {
    console.error("deleteConsultationFormAction error:", error);
    throw new Error("Could not delete consultation form.");
  }

  revalidateConsultationPaths(safeClientId);
}

export async function addConsultationQuestionAction(
  clientId: string,
  formId: number,
  formData: FormData
) {
  const safeClientId = sanitizeClientId(clientId);
  const prompt = sanitizePrompt(formData.get("prompt"));

  await assertFormBelongsToClient(formId, safeClientId);

  const supabase = await createClient();
  const { data: lastQuestion, error: orderError } = await supabase
    .from("consultation_questions")
    .select("sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) {
    console.error("addConsultationQuestionAction order error:", orderError);
    throw new Error("Could not determine question order.");
  }

  const nextSortOrder = Number(lastQuestion?.sort_order ?? 0) + 1;
  const { error } = await supabase.from("consultation_questions").insert({
    form_id: formId,
    prompt,
    sort_order: nextSortOrder,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("addConsultationQuestionAction error:", error);
    throw new Error("Could not add consultation question.");
  }

  revalidateConsultationPaths(safeClientId);
}

export async function updateConsultationQuestionAction(
  clientId: string,
  formId: number,
  questionId: number,
  formData: FormData
) {
  const safeClientId = sanitizeClientId(clientId);
  const prompt = sanitizePrompt(formData.get("prompt"));

  await assertFormBelongsToClient(formId, safeClientId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("consultation_questions")
    .update({
      prompt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", questionId)
    .eq("form_id", formId);

  if (error) {
    console.error("updateConsultationQuestionAction error:", error);
    throw new Error("Could not update consultation question.");
  }

  revalidateConsultationPaths(safeClientId);
}

export async function deleteConsultationQuestionAction(
  clientId: string,
  formId: number,
  questionId: number
) {
  const safeClientId = sanitizeClientId(clientId);
  await assertFormBelongsToClient(formId, safeClientId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("consultation_questions")
    .delete()
    .eq("id", questionId)
    .eq("form_id", formId);

  if (error) {
    console.error("deleteConsultationQuestionAction error:", error);
    throw new Error("Could not delete consultation question.");
  }

  revalidateConsultationPaths(safeClientId);
}

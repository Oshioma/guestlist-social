"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export const DEFAULT_CONSULTATION_QUESTIONS = [
  "Company name / handles",
  "Mission statement",
  "How would you describe the personality of your business?",
  "How would you describe your MAIN service or product?",
  "Are there particular services or products you would like to push?",
  "What kind of content do you have that would be good to push out?",
  "List any special events happening over the next 2 months?",
  "List any platforms we should promote",
  "What would you say are your main marketing messages?",
  "Who are your main competitors?",
  "Competitions / Offers",
  "Locations of target market",
  "What are common denominators of your target market?",
  "List friends of your company - we can tag them in messages",
  "Any other information that might assist us in preparing some wonderful messages for you",
  "Music Genre",
  "What are your opening times? What time / day do most purchases happen (If applicable)",
  "What are the most important objectives of your social media campaign and presence?",
  "What else would your audience be interested in?",
  "Number of followers and fans",
  "What is your brand story?",
  "Email address for customer querries",
  "What causes would you like to or do you support? Is there a cause that would like to become a champion of?",
  "What is your quietest time / busiest time?",
  "Regular or weekly occurrences that you would like us to include?",
  "Based on this personality, what kind of tone/persona would you like to come across?",
  "Inspiration",
  "What specific goals do you have for the next quarter?",
  "What other marketing do you do?",
  "What 'behind the scenes' content do you have we can use?",
  "Are there particular people, accounts or influencers you would like to try and engage with or target?",
  "Are there any key brand phrases or brand language you would like us to use?",
  "Have you got password?",
  "Are there any common questions you get asked by customers? What are the responses",
  "It's recommending that we respond with a name",
];

function sanitizeClientId(clientId: string) {
  const normalized = String(clientId ?? "").trim();
  if (!normalized) throw new Error("Missing client id.");
  return normalized;
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
  formData: FormData
) {
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
    throw new Error("Could not create consultation form.");
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
      throw new Error("Form created, but default questions could not be added.");
    }
  }

  revalidateConsultationPaths(safeClientId);
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

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import {
  getConsultationDefaultQuestions,
  setConsultationDefaultQuestions,
} from "./consultation-default-questions";

export type CreateConsultationFormState = {
  error: string | null;
  success: string | null;
};

export type ImportConsultationState = {
  error: string | null;
  success: string | null;
};

export type ReorderConsultationDefaultsState = {
  error: string | null;
  success: string | null;
};

export type SaveSingleConsultationAnswersState = {
  error: string | null;
  success: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ParsedConsultationImport = {
  submittedAtIso: string;
  answers: string[];
  headerPrompts: string[] | null;
};

async function syncFormQuestionsToDefaults(
  supabase: SupabaseServerClient,
  formId: number
) {
  const { data: questionRows, error: questionLookupError } = await supabase
    .from("consultation_questions")
    .select("prompt, sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });

  if (questionLookupError) {
    console.error(
      "syncFormQuestionsToDefaults lookup error:",
      questionLookupError
    );
    return;
  }

  const prompts = (questionRows ?? [])
    .map((row) => String(row.prompt ?? "").trim())
    .filter((prompt) => prompt.length > 0);

  if (prompts.length === 0) {
    return;
  }

  try {
    await setConsultationDefaultQuestions(supabase, prompts);
  } catch (error) {
    console.error("syncFormQuestionsToDefaults update error:", error);
  }
}

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
      .select("id, is_active, updated_at")
      .eq("client_id", safeClientId)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
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

    const defaultQuestions = await getConsultationDefaultQuestions(supabase);
    if (defaultQuestions.length === 0) {
      return;
    }

    let targetFormId = Number(existingForms?.[0]?.id ?? 0);
    if (targetFormId <= 0) {
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

      targetFormId = Number(createdForm.id);
      const questions = defaultQuestions.map((prompt, index) => ({
        form_id: targetFormId,
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
      return;
    }

    const { data: existingQuestions, error: existingQuestionsError } = await supabase
      .from("consultation_questions")
      .select("prompt, sort_order")
      .eq("form_id", targetFormId)
      .order("sort_order", { ascending: true });

    if (existingQuestionsError) {
      if (existingQuestionsError.code !== "42P01") {
        console.error(
          "ensureDefaultConsultationFormForClient load questions error:",
          existingQuestionsError
        );
      }
      return;
    }

    const normalizedExistingPrompts = new Set(
      (existingQuestions ?? [])
        .map((row) => String(row.prompt ?? "").trim().toLowerCase())
        .filter((prompt) => prompt.length > 0)
    );
    const missingPrompts = defaultQuestions.filter(
      (prompt) => !normalizedExistingPrompts.has(String(prompt).trim().toLowerCase())
    );

    if (missingPrompts.length === 0) {
      return;
    }

    const maxSortOrder = Math.max(
      0,
      ...(existingQuestions ?? []).map((row) => Number(row.sort_order ?? 0))
    );
    const nowIso = new Date().toISOString();
    const missingRows = missingPrompts.map((prompt, index) => ({
      form_id: targetFormId,
      prompt,
      sort_order: maxSortOrder + index + 1,
      updated_at: nowIso,
    }));

    const { error: addMissingError } = await supabase
      .from("consultation_questions")
      .insert(missingRows);

    if (addMissingError && addMissingError.code !== "42P01") {
      console.error(
        "ensureDefaultConsultationFormForClient add missing questions error:",
        addMissingError
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

function isMarkdownDividerRow(line: string) {
  const withoutPipes = line.replaceAll("|", "").trim();
  return withoutPipes.length > 0 && /^[-:\s]+$/.test(withoutPipes);
}

function normalizeConsultationCell(cell: string) {
  return String(cell ?? "")
    .replaceAll("**", "")
    .replaceAll("&#10;", "\n")
    .replaceAll("&#13;", "\r")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function parsePipeCells(line: string) {
  let cells = line.split("|").map(normalizeConsultationCell);
  if (cells[0] === "") cells = cells.slice(1);
  if (cells[cells.length - 1] === "") cells = cells.slice(0, -1);
  return cells;
}

function parsePlainTextCells(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => normalizeConsultationCell(line))
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const cells: string[] = [];
  let firstLineRemainder = lines[0];

  const timestampMatch = firstLineRemainder.match(
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/
  );
  if (timestampMatch) {
    cells.push(timestampMatch[1].trim());
    firstLineRemainder = firstLineRemainder.slice(timestampMatch[1].length).trim();
  }

  const urlMatch = firstLineRemainder.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    const urlIndex = urlMatch.index ?? 0;
    const beforeUrl = firstLineRemainder.slice(0, urlIndex).trim();
    const afterUrl = firstLineRemainder.slice(urlIndex + url.length).trim();
    if (beforeUrl) cells.push(beforeUrl);
    cells.push(url);
    if (afterUrl) cells.push(afterUrl);
  } else if (firstLineRemainder) {
    cells.push(firstLineRemainder);
  }

  cells.push(...lines.slice(1));
  return cells;
}

function parseConsultationCells(raw: string) {
  if (raw.includes("|")) {
    return parsePipeCells(raw);
  }
  if (raw.includes("\t")) {
    return raw.split("\t").map(normalizeConsultationCell);
  }
  return parsePlainTextCells(raw);
}

function looksLikeTimestamp(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  return (
    /^\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(
      normalized
    ) || /^\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?$/i.test(normalized)
  );
}

function parseConsultationImport(rawValue: string): ParsedConsultationImport {
  const normalizedInput = rawValue.trim();
  if (!normalizedInput) {
    throw new Error("Consultation import text is empty.");
  }

  const lines = normalizedInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let selectedLine = normalizedInput;
  let headerPrompts: string[] | null = null;
  const tableRows = lines.filter(
    (line) => line.includes("|") && !isMarkdownDividerRow(line)
  );

  if (tableRows.length > 0) {
    selectedLine = tableRows[0];
    const firstRowCells = parsePipeCells(tableRows[0]);
    const firstCell = String(firstRowCells[0] ?? "").toLowerCase();
    const secondRow = tableRows[1];
    const secondRowFirstCell = String(secondRow ?? "")
      .split("|")
      .map(normalizeConsultationCell)
      .filter(Boolean)[0];
    const firstLooksLikeHeader =
      firstCell.includes("timestamp") &&
      (firstRowCells[1] ?? "").toLowerCase().includes("company");

    if (firstLooksLikeHeader) {
      headerPrompts = firstRowCells.slice(1);
      if (tableRows.length > 1 && looksLikeTimestamp(secondRowFirstCell ?? "")) {
        selectedLine = tableRows[1];
      }
    }
  }

  let cells = parseConsultationCells(selectedLine);
  while (cells.length > 0 && cells[cells.length - 1] === "") {
    cells.pop();
  }

  if (cells.length < 2) {
    throw new Error(
      "Consultation row could not be parsed. Paste a single full row from your sheet."
    );
  }

  let submittedAtIso = new Date().toISOString();
  if (looksLikeTimestamp(cells[0])) {
    const parsedDate = new Date(cells[0]);
    if (!Number.isNaN(parsedDate.getTime())) {
      submittedAtIso = parsedDate.toISOString();
    }
    cells = cells.slice(1);
  }

  if (cells.length === 0) {
    throw new Error("Consultation row has no answer columns to import.");
  }

  return {
    submittedAtIso,
    answers: cells,
    headerPrompts,
  };
}

function revalidateConsultationPaths(clientId: string) {
  revalidatePath(`/admin-panel/clients/${clientId}/edit`);
  revalidatePath(`/app/clients/${clientId}/edit`);
  revalidatePath(`/portal/${clientId}`);
  revalidatePath(`/portal/${clientId}/consultation`);
}

function revalidateConsultationTemplatePaths() {
  revalidatePath("/admin-panel/settings/consultation");
  revalidatePath("/app/settings/consultation");
  revalidatePath("/admin-panel/clients/new");
  revalidatePath("/app/clients/new");
}

function sanitizePositiveInteger(value: number, label: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid ${label}.`);
  }
  return Math.trunc(numeric);
}

async function getOrCreateConsultationFormIdForClient(
  supabase: SupabaseServerClient,
  clientId: string
) {
  const { data: existingForms, error: lookupError } = await supabase
    .from("consultation_forms")
    .select("id")
    .eq("client_id", clientId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (lookupError) {
    console.error("getOrCreateConsultationFormIdForClient lookup error:", lookupError);
    throw new Error("Could not load consultation form.");
  }

  const existingFormId = Number(existingForms?.[0]?.id ?? 0);
  if (existingFormId > 0) {
    return existingFormId;
  }

  const { data: createdForm, error: createError } = await supabase
    .from("consultation_forms")
    .insert({
      client_id: clientId,
      title: "Consultation",
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError || !createdForm) {
    console.error("getOrCreateConsultationFormIdForClient create error:", createError);
    throw new Error("Could not create consultation form.");
  }

  return Number(createdForm.id);
}

async function getOrSeedQuestionsForForm(
  supabase: SupabaseServerClient,
  formId: number
) {
  const { data: existingQuestions, error: lookupError } = await supabase
    .from("consultation_questions")
    .select("id, prompt, sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });

  if (lookupError) {
    console.error("getOrSeedQuestionsForForm lookup error:", lookupError);
    throw new Error("Could not load consultation questions.");
  }

  const questions =
    (existingQuestions ?? []).filter(
      (row) => String(row.prompt ?? "").trim().length > 0
    ) ?? [];
  if (questions.length > 0) {
    return questions as Array<{ id: number; prompt: string; sort_order: number }>;
  }

  const defaults = await getConsultationDefaultQuestions(supabase);
  const rows = defaults.map((prompt, index) => ({
    form_id: formId,
    prompt,
    sort_order: index + 1,
    updated_at: new Date().toISOString(),
  }));

  const { error: seedError } = await supabase
    .from("consultation_questions")
    .insert(rows);
  if (seedError) {
    console.error("getOrSeedQuestionsForForm seed error:", seedError);
    throw new Error("Could not create consultation questions.");
  }

  const { data: seededQuestions, error: seededLookupError } = await supabase
    .from("consultation_questions")
    .select("id, prompt, sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });

  if (seededLookupError || !seededQuestions) {
    console.error(
      "getOrSeedQuestionsForForm seeded lookup error:",
      seededLookupError
    );
    throw new Error("Could not load consultation questions.");
  }

  return seededQuestions as Array<{ id: number; prompt: string; sort_order: number }>;
}

async function importConsultationSubmissionForClient(
  supabase: SupabaseServerClient,
  clientId: string,
  parsedImport: ParsedConsultationImport
) {
  const formId = await getOrCreateConsultationFormIdForClient(supabase, clientId);
  const questions = await getOrSeedQuestionsForForm(supabase, formId);

  const { data: submission, error: submissionError } = await supabase
    .from("consultation_submissions")
    .insert({
      form_id: formId,
      client_id: clientId,
      submitted_at: parsedImport.submittedAtIso,
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    console.error(
      "importConsultationSubmissionForClient submission error:",
      submissionError
    );
    throw new Error("Could not create consultation submission.");
  }

  const answers = parsedImport.answers.map((answerValue, index) => {
    const question = questions[index];
    const fallbackPrompt = String(
      parsedImport.headerPrompts?.[index] ?? `Imported question ${index + 1}`
    ).trim();
    const questionPrompt =
      String(question?.prompt ?? "").trim() ||
      fallbackPrompt ||
      `Imported question ${index + 1}`;
    return {
      submission_id: submission.id,
      question_id: question?.id ?? null,
      question_prompt: questionPrompt,
      answer_text: String(answerValue ?? "").trim(),
    };
  });

  const { error: answersError } = await supabase
    .from("consultation_answers")
    .insert(answers);
  if (answersError) {
    console.error(
      "importConsultationSubmissionForClient answers error:",
      answersError
    );
    throw new Error("Could not save consultation answers.");
  }
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

async function assertSubmissionBelongsToClient(
  submissionId: number,
  clientId: string
): Promise<{ id: number; form_id: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consultation_submissions")
    .select("id, form_id")
    .eq("id", submissionId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Consultation submission not found.");
  }

  return data as { id: number; form_id: number };
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
      const defaultQuestions = await getConsultationDefaultQuestions(supabase);
      const questions = defaultQuestions.map((prompt, index) => ({
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

  await syncFormQuestionsToDefaults(supabase, formId);
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

  await syncFormQuestionsToDefaults(supabase, formId);
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

  await syncFormQuestionsToDefaults(supabase, formId);
  revalidateConsultationPaths(safeClientId);
}

export async function createConsultationDefaultQuestionAction(formData: FormData) {
  const prompt = sanitizePrompt(formData.get("prompt"));
  const supabase = await createClient();

  const defaults = await getConsultationDefaultQuestions(supabase);
  await setConsultationDefaultQuestions(supabase, [...defaults, prompt]);
  revalidateConsultationTemplatePaths();
}

export async function updateConsultationDefaultQuestionAction(
  sortOrder: number,
  formData: FormData
) {
  const safeSortOrder = sanitizePositiveInteger(sortOrder, "sort order");
  const prompt = sanitizePrompt(formData.get("prompt"));
  const supabase = await createClient();

  const defaults = await getConsultationDefaultQuestions(supabase);
  const nextDefaults = [...defaults];
  if (safeSortOrder > nextDefaults.length) {
    throw new Error("Question not found.");
  }
  nextDefaults[safeSortOrder - 1] = prompt;
  await setConsultationDefaultQuestions(supabase, nextDefaults);
  revalidateConsultationTemplatePaths();
}

export async function deleteConsultationDefaultQuestionAction(sortOrder: number) {
  const safeSortOrder = sanitizePositiveInteger(sortOrder, "sort order");
  const supabase = await createClient();

  const defaults = await getConsultationDefaultQuestions(supabase);
  const nextDefaults = defaults.filter((_, index) => index !== safeSortOrder - 1);
  if (nextDefaults.length === 0) {
    throw new Error("At least one default question is required.");
  }

  await setConsultationDefaultQuestions(supabase, nextDefaults);
  revalidateConsultationTemplatePaths();
}

export async function reorderConsultationDefaultQuestionsAction(
  _prevState: ReorderConsultationDefaultsState,
  formData: FormData
): Promise<ReorderConsultationDefaultsState> {
  try {
    const rawOrder = String(formData.get("orderedPrompts") ?? "").trim();
    if (!rawOrder) {
      return { error: "Question order is required.", success: null };
    }

    const parsed = JSON.parse(rawOrder) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: "Invalid question order payload.", success: null };
    }

    const prompts = parsed
      .map((value) => String(value ?? "").trim())
      .filter((prompt) => prompt.length > 0);

    if (prompts.length === 0) {
      return { error: "At least one question is required.", success: null };
    }

    const supabase = await createClient();
    await setConsultationDefaultQuestions(supabase, prompts);
    revalidateConsultationTemplatePaths();
    return { error: null, success: "Question order updated." };
  } catch (error) {
    console.error("reorderConsultationDefaultQuestionsAction error:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not reorder consultation questions.",
      success: null,
    };
  }
}

export async function createConsultationSubmissionAction(
  clientId: string,
  formId: number,
  formData: FormData
) {
  const safeClientId = sanitizeClientId(clientId);
  const safeFormId = sanitizePositiveInteger(formId, "form id");
  await assertFormBelongsToClient(safeFormId, safeClientId);
  const supabase = await createClient();

  const { data: questions, error: questionsError } = await supabase
    .from("consultation_questions")
    .select("id, prompt")
    .eq("form_id", safeFormId)
    .order("sort_order", { ascending: true });

  if (questionsError) {
    console.error("createConsultationSubmissionAction questions error:", questionsError);
    throw new Error("Could not load consultation questions.");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("consultation_submissions")
    .insert({
      form_id: safeFormId,
      client_id: safeClientId,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    console.error(
      "createConsultationSubmissionAction submission error:",
      submissionError
    );
    throw new Error("Could not create consultation submission.");
  }

  const answers = (questions ?? []).map((question) => ({
    submission_id: submission.id,
    question_id: question.id,
    question_prompt: String(question.prompt ?? "").trim(),
    answer_text: String(formData.get(`question-${question.id}`) ?? "").trim(),
  }));

  const { error: answersError } = await supabase
    .from("consultation_answers")
    .insert(answers);

  if (answersError) {
    console.error("createConsultationSubmissionAction answers error:", answersError);
    throw new Error("Could not save consultation answers.");
  }

  revalidateConsultationPaths(safeClientId);
}

export async function saveSingleConsultationSubmissionAnswersAction(
  clientId: string,
  formId: number,
  _prevState: SaveSingleConsultationAnswersState,
  formData: FormData
) : Promise<SaveSingleConsultationAnswersState> {
  try {
    const safeClientId = sanitizeClientId(clientId);
    const safeFormId = sanitizePositiveInteger(formId, "form id");
    await assertFormBelongsToClient(safeFormId, safeClientId);
    const supabase = await createClient();

    const { data: latestSubmission, error: latestSubmissionError } = await supabase
      .from("consultation_submissions")
      .select("id")
      .eq("client_id", safeClientId)
      .eq("form_id", safeFormId)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSubmissionError) {
      console.error(
        "saveSingleConsultationSubmissionAnswersAction submission lookup error:",
        latestSubmissionError
      );
      throw new Error("Could not load consultation submission.");
    }

    let submissionId = Number(latestSubmission?.id ?? 0);
    if (submissionId <= 0) {
      const { data: createdSubmission, error: createSubmissionError } = await supabase
        .from("consultation_submissions")
        .insert({
          form_id: safeFormId,
          client_id: safeClientId,
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createSubmissionError || !createdSubmission) {
        console.error(
          "saveSingleConsultationSubmissionAnswersAction create submission error:",
          createSubmissionError
        );
        throw new Error("Could not create consultation submission.");
      }

      submissionId = sanitizePositiveInteger(
        Number(createdSubmission.id),
        "submission id"
      );
    }

    const [questionsRes, existingAnswersRes] = await Promise.all([
      supabase
        .from("consultation_questions")
        .select("id, prompt")
        .eq("form_id", safeFormId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("consultation_answers")
        .select("id, question_id")
        .eq("submission_id", submissionId),
    ]);

    if (questionsRes.error) {
      console.error(
        "saveSingleConsultationSubmissionAnswersAction questions error:",
        questionsRes.error
      );
      throw new Error("Could not load consultation questions.");
    }
    if (existingAnswersRes.error) {
      console.error(
        "saveSingleConsultationSubmissionAnswersAction answer lookup error:",
        existingAnswersRes.error
      );
      throw new Error("Could not load existing consultation answers.");
    }

    const existingAnswersByQuestionId = new Map<
      number,
      { id: number; question_id: number | null }
    >();
    for (const answer of existingAnswersRes.data ?? []) {
      const questionId = Number(answer.question_id ?? 0);
      if (questionId > 0) {
        existingAnswersByQuestionId.set(questionId, answer);
      }
    }

    for (const question of questionsRes.data ?? []) {
      const answerText = String(formData.get(`question-${question.id}`) ?? "").trim();
      const existingAnswer = existingAnswersByQuestionId.get(Number(question.id));
      if (existingAnswer) {
        const { error: updateError } = await supabase
          .from("consultation_answers")
          .update({
            answer_text: answerText,
            question_prompt: String(question.prompt ?? "").trim(),
          })
          .eq("id", existingAnswer.id)
          .eq("submission_id", submissionId);

        if (updateError) {
          console.error(
            "saveSingleConsultationSubmissionAnswersAction update error:",
            updateError
          );
          throw new Error("Could not update consultation answer.");
        }
      } else {
        const { error: insertError } = await supabase
          .from("consultation_answers")
          .insert({
            submission_id: submissionId,
            question_id: question.id,
            question_prompt: String(question.prompt ?? "").trim(),
            answer_text: answerText,
          });

        if (insertError) {
          console.error(
            "saveSingleConsultationSubmissionAnswersAction insert error:",
            insertError
          );
          throw new Error("Could not add consultation answer.");
        }
      }
    }

    const { error: touchSubmissionError } = await supabase
      .from("consultation_submissions")
      .update({ submitted_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("client_id", safeClientId);

    if (touchSubmissionError) {
      console.error(
        "saveSingleConsultationSubmissionAnswersAction touch submission error:",
        touchSubmissionError
      );
    }

    revalidateConsultationPaths(safeClientId);
    return { error: null, success: "Consultation answers saved." };
  } catch (error) {
    console.error("saveSingleConsultationSubmissionAnswersAction error:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not save consultation answers.",
      success: null,
    };
  }
}

export async function updateConsultationSubmissionAnswersAction(
  clientId: string,
  submissionId: number,
  formData: FormData
) {
  const safeClientId = sanitizeClientId(clientId);
  const safeSubmissionId = sanitizePositiveInteger(submissionId, "submission id");
  const submission = await assertSubmissionBelongsToClient(
    safeSubmissionId,
    safeClientId
  );
  const supabase = await createClient();

  const [questionsRes, existingAnswersRes] = await Promise.all([
    supabase
      .from("consultation_questions")
      .select("id, prompt")
      .eq("form_id", submission.form_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("consultation_answers")
      .select("id, question_id")
      .eq("submission_id", submission.id),
  ]);

  if (questionsRes.error) {
    console.error(
      "updateConsultationSubmissionAnswersAction questions error:",
      questionsRes.error
    );
    throw new Error("Could not load consultation questions.");
  }
  if (existingAnswersRes.error) {
    console.error(
      "updateConsultationSubmissionAnswersAction answer lookup error:",
      existingAnswersRes.error
    );
    throw new Error("Could not load existing consultation answers.");
  }

  const existingAnswersByQuestionId = new Map<
    number,
    { id: number; question_id: number | null }
  >();
  for (const answer of existingAnswersRes.data ?? []) {
    const questionId = Number(answer.question_id ?? 0);
    if (questionId > 0) {
      existingAnswersByQuestionId.set(questionId, answer);
    }
  }

  for (const question of questionsRes.data ?? []) {
    const answerText = String(formData.get(`question-${question.id}`) ?? "").trim();
    const existingAnswer = existingAnswersByQuestionId.get(Number(question.id));
    if (existingAnswer) {
      const { error: updateError } = await supabase
        .from("consultation_answers")
        .update({
          answer_text: answerText,
          question_prompt: String(question.prompt ?? "").trim(),
        })
        .eq("id", existingAnswer.id)
        .eq("submission_id", submission.id);

      if (updateError) {
        console.error(
          "updateConsultationSubmissionAnswersAction update error:",
          updateError
        );
        throw new Error("Could not update consultation answer.");
      }
    } else {
      const { error: createError } = await supabase
        .from("consultation_answers")
        .insert({
          submission_id: submission.id,
          question_id: question.id,
          question_prompt: String(question.prompt ?? "").trim(),
          answer_text: answerText,
        });
      if (createError) {
        console.error(
          "updateConsultationSubmissionAnswersAction insert error:",
          createError
        );
        throw new Error("Could not add consultation answer.");
      }
    }
  }

  revalidateConsultationPaths(safeClientId);
}

export async function deleteConsultationSubmissionAction(
  clientId: string,
  submissionId: number
) {
  const safeClientId = sanitizeClientId(clientId);
  const safeSubmissionId = sanitizePositiveInteger(submissionId, "submission id");
  await assertSubmissionBelongsToClient(safeSubmissionId, safeClientId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("consultation_submissions")
    .delete()
    .eq("id", safeSubmissionId)
    .eq("client_id", safeClientId);

  if (error) {
    console.error("deleteConsultationSubmissionAction error:", error);
    throw new Error("Could not delete consultation submission.");
  }

  revalidateConsultationPaths(safeClientId);
}

export async function importConsultationForClientAction(
  _prevState: ImportConsultationState,
  formData: FormData
): Promise<ImportConsultationState> {
  try {
    const safeClientId = sanitizeClientId(
      String(formData.get("clientId") ?? "").trim()
    );
    const rawImport = String(formData.get("consultationRow") ?? "").trim();
    if (!rawImport) {
      return { error: "Consultation row is required.", success: null };
    }

    const parsed = parseConsultationImport(rawImport);
    await ensureDefaultConsultationFormForClient(safeClientId);
    const supabase = await createClient();

    const { data: forms, error: formsError } = await supabase
      .from("consultation_forms")
      .select("id, title, is_active")
      .eq("client_id", safeClientId)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1);

    if (formsError || !forms || forms.length === 0) {
      console.error("importConsultationForClientAction forms error:", formsError);
      return {
        error: "Could not find a consultation form for this client.",
        success: null,
      };
    }

    const formId = sanitizePositiveInteger(Number(forms[0].id), "form id");
    const { data: questions, error: questionsError } = await supabase
      .from("consultation_questions")
      .select("id, prompt")
      .eq("form_id", formId)
      .order("sort_order", { ascending: true });

    if (questionsError) {
      console.error(
        "importConsultationForClientAction questions lookup error:",
        questionsError
      );
      return { error: "Could not load consultation questions.", success: null };
    }

    const { data: submission, error: submissionError } = await supabase
      .from("consultation_submissions")
      .insert({
        form_id: formId,
        client_id: safeClientId,
        submitted_at: parsed.submittedAtIso,
      })
      .select("id")
      .single();

    if (submissionError || !submission) {
      console.error(
        "importConsultationForClientAction submission error:",
        submissionError
      );
      return { error: "Could not create consultation submission.", success: null };
    }

    const answers = parsed.answers.map((answerValue, index) => {
      const question = questions?.[index];
      const fallbackPrompt = String(
        parsed.headerPrompts?.[index] ?? `Imported question ${index + 1}`
      ).trim();
      const questionPrompt =
        String(question?.prompt ?? "").trim() ||
        fallbackPrompt ||
        `Imported question ${index + 1}`;
      return {
        submission_id: submission.id,
        question_id: question?.id ?? null,
        question_prompt: questionPrompt,
        answer_text: String(answerValue ?? "").trim(),
      };
    });

    const { error: answersError } = await supabase
      .from("consultation_answers")
      .insert(answers);

    if (answersError) {
      console.error("importConsultationForClientAction answers error:", answersError);
      return { error: "Could not save imported answers.", success: null };
    }

    revalidateConsultationPaths(safeClientId);
    revalidateConsultationTemplatePaths();
    return { error: null, success: "Consultation row imported." };
  } catch (error) {
    console.error("importConsultationForClientAction unexpected error:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not import consultation row.",
      success: null,
    };
  }
}

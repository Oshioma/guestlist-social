"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { isAdmin } from "@/lib/auth/permissions";
import { getConsultationDefaultQuestions } from "./consultation-default-questions";

function normalizeStatus(status: string) {
  if (status === "active" || status === "paused" || status === "onboarding") {
    return status;
  }
  return "onboarding";
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ParsedConsultationImport = {
  submittedAtIso: string;
  answers: string[];
  headerPrompts: string[] | null;
};

type ConsultationQuestionRow = {
  id: number;
  prompt: string;
  sort_order: number;
};

function isMarkdownDividerRow(line: string) {
  const withoutPipes = line.replaceAll("|", "").trim();
  return withoutPipes.length > 0 && /^[-:\s]+$/.test(withoutPipes);
}

function normalizeConsultationCell(cell: string) {
  return cell
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
    firstLineRemainder = firstLineRemainder
      .slice(timestampMatch[1].length)
      .trim();
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

async function getOrCreateConsultationFormId(
  supabase: SupabaseServerClient,
  clientId: number
) {
  const { data: existingForms, error: formsLookupError } = await supabase
    .from("consultation_forms")
    .select("id")
    .eq("client_id", clientId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (formsLookupError) {
    if (formsLookupError.code === "42P01") {
      throw new Error(
        "Consultation tables are not available yet. Please run the latest migration first."
      );
    }
    console.error("getOrCreateConsultationFormId lookup error:", formsLookupError);
    throw new Error("Could not load consultation forms for this client.");
  }

  const existingFormId = Number(existingForms?.[0]?.id ?? 0);
  if (Number.isFinite(existingFormId) && existingFormId > 0) {
    return existingFormId;
  }

  const { data: createdForm, error: createFormError } = await supabase
    .from("consultation_forms")
    .insert({
      client_id: clientId,
      title: "Consultation",
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createFormError || !createdForm) {
    if (createFormError?.code === "42P01") {
      throw new Error(
        "Consultation tables are not available yet. Please run the latest migration first."
      );
    }
    console.error("getOrCreateConsultationFormId create error:", createFormError);
    throw new Error("Could not create consultation form for the new client.");
  }

  return Number(createdForm.id);
}

async function getOrSeedConsultationQuestions(
  supabase: SupabaseServerClient,
  formId: number
) {
  const { data: existingQuestions, error: lookupError } = await supabase
    .from("consultation_questions")
    .select("id, prompt, sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });

  if (lookupError) {
    if (lookupError.code === "42P01") {
      throw new Error(
        "Consultation tables are not available yet. Please run the latest migration first."
      );
    }
    console.error("getOrSeedConsultationQuestions lookup error:", lookupError);
    throw new Error("Could not load consultation questions for the new client.");
  }

  const questions =
    (existingQuestions as ConsultationQuestionRow[] | null)?.filter(
      (question) => String(question.prompt ?? "").trim().length > 0
    ) ?? [];
  if (questions.length > 0) {
    return questions;
  }

  const defaults = (await getConsultationDefaultQuestions(supabase)).map(
    (prompt, index) => ({
    form_id: formId,
    prompt,
    sort_order: index + 1,
      updated_at: new Date().toISOString(),
    })
  );

  const { error: seedError } = await supabase
    .from("consultation_questions")
    .insert(defaults);

  if (seedError) {
    if (seedError.code === "42P01") {
      throw new Error(
        "Consultation tables are not available yet. Please run the latest migration first."
      );
    }
    console.error("getOrSeedConsultationQuestions seed error:", seedError);
    throw new Error("Could not seed consultation questions for the new client.");
  }

  const { data: seededQuestions, error: seededLookupError } = await supabase
    .from("consultation_questions")
    .select("id, prompt, sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });

  if (seededLookupError || !seededQuestions || seededQuestions.length === 0) {
    console.error(
      "getOrSeedConsultationQuestions seeded lookup error:",
      seededLookupError
    );
    throw new Error("Could not load seeded consultation questions.");
  }

  return seededQuestions as ConsultationQuestionRow[];
}

async function importConsultationSubmissionForNewClient(
  supabase: SupabaseServerClient,
  clientId: number,
  parsedImport: ParsedConsultationImport
) {
  const formId = await getOrCreateConsultationFormId(supabase, clientId);
  const questions = await getOrSeedConsultationQuestions(supabase, formId);

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
      "importConsultationSubmissionForNewClient submission error:",
      submissionError
    );
    throw new Error("Client was created, but consultation submission could not be saved.");
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
      "importConsultationSubmissionForNewClient answers error:",
      answersError
    );
    throw new Error("Client was created, but consultation answers could not be saved.");
  }
}

export async function createClientAction(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "Meta").trim();
  const monthlyBudget = Number(formData.get("monthlyBudget") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "onboarding"));
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  const igHandle = String(formData.get("igHandle") ?? "").trim().replace(/^@/, "");
  const notes = String(formData.get("notes") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  let metaAdAccountId = String(formData.get("metaAdAccountId") ?? "").trim();
  if (metaAdAccountId && !metaAdAccountId.startsWith("act_")) {
    metaAdAccountId = `act_${metaAdAccountId}`;
  }
  const consultationImport = String(formData.get("consultationRow") ?? "").trim();

  if (!name) {
    throw new Error("Client name is required.");
  }

  const parsedConsultationImport = consultationImport
    ? parseConsultationImport(consultationImport)
    : null;

  const dbStatus =
    status === "active"
      ? "growing"
      : status === "paused"
      ? "needs_attention"
      : "testing";

  const insertPayload: Record<string, unknown> = {
    name,
    platform,
    monthly_budget: monthlyBudget,
    status: dbStatus,
    website_url: websiteUrl || null,
    ig_handle: igHandle || null,
    notes: notes || null,
  };

  if (industry) {
    insertPayload.industry = industry;
  }

  if (metaAdAccountId) {
    insertPayload.meta_ad_account_id = metaAdAccountId;
  }

  let insertResult = await supabase
    .from("clients")
    .insert(insertPayload)
    .select("id")
    .single();
  let { error } = insertResult;
  let createdClient = insertResult.data as { id: number } | null;

  // If industry column doesn't exist, retry without it
  if (error && insertPayload.industry !== undefined) {
    delete insertPayload.industry;
    const retry = await supabase
      .from("clients")
      .insert(insertPayload)
      .select("id")
      .single();
    error = retry.error;
    createdClient = (retry.data as { id: number } | null) ?? null;
  }

  if (error || !createdClient) {
    console.error("createClientAction error:", error);
    throw new Error("Could not create client.");
  }

  const createdClientId = Number(createdClient.id);
  if (
    parsedConsultationImport &&
    Number.isFinite(createdClientId) &&
    createdClientId > 0
  ) {
    try {
      await importConsultationSubmissionForNewClient(
        supabase,
        createdClientId,
        parsedConsultationImport
      );
    } catch (error) {
      const rollback = await supabase.from("clients").delete().eq("id", createdClientId);
      if (rollback.error) {
        console.error("createClientAction rollback error:", rollback.error);
      }
      throw error;
    }
  }

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
  redirect("/app/clients");
}

export async function updateClientAction(clientId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "Meta").trim();
  const monthlyBudget = Number(formData.get("monthlyBudget") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "onboarding"));
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  const igHandle = String(formData.get("igHandle") ?? "").trim().replace(/^@/, "");
  const notes = String(formData.get("notes") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  let metaAdAccountId = String(formData.get("metaAdAccountId") ?? "").trim();
  if (metaAdAccountId && !metaAdAccountId.startsWith("act_")) {
    metaAdAccountId = `act_${metaAdAccountId}`;
  }

  if (!clientId) {
    throw new Error("Missing client id.");
  }

  if (!name) {
    throw new Error("Client name is required.");
  }

  const dbStatus =
    status === "active"
      ? "growing"
      : status === "paused"
      ? "needs_attention"
      : "testing";

  const updatePayload: Record<string, unknown> = {
    name,
    platform,
    monthly_budget: monthlyBudget,
    status: dbStatus,
    website_url: websiteUrl || null,
    ig_handle: igHandle || null,
    notes: notes || null,
    meta_ad_account_id: metaAdAccountId || null,
  };

  if (industry) {
    updatePayload.industry = industry;
  }

  let { error } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", clientId);

  // If industry or meta_ad_account_id columns don't exist, retry without them
  if (error && updatePayload.industry !== undefined) {
    delete updatePayload.industry;
    delete updatePayload.meta_ad_account_id;
    const retry = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", clientId);
    error = retry.error;
  } else if (error && updatePayload.meta_ad_account_id !== undefined) {
    delete updatePayload.meta_ad_account_id;
    const retry = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", clientId);
    error = retry.error;
  }

  if (error) {
    console.error("updateClientAction error:", error);
    throw new Error("Could not update client.");
  }

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath(`/admin-panel/clients/${clientId}/edit`);
  redirect(`/app/clients/${clientId}`);
}

export async function archiveClientAction(clientId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({ archived: true })
    .eq("id", clientId);

  if (error) {
    console.error("archiveClientAction error:", error);
    throw new Error("Could not archive client.");
  }

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
  redirect("/app/clients");
}

export async function deleteClientAction(clientId: string, redirectTo?: string) {
  const admin = await isAdmin();
  if (!admin) {
    throw new Error("Only admins can delete clients.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId);

  if (error) {
    console.error("deleteClientAction error:", error);
    throw new Error("Could not delete client.");
  }

  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");
  redirect(
    typeof redirectTo === "string" && redirectTo.trim().length > 0
      ? redirectTo
      : "/app/clients"
  );
}


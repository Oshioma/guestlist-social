import type { SupabaseClient } from "@supabase/supabase-js";

type DefaultQuestionRow = {
  prompt: string | null;
  sort_order: number | null;
};

const FALLBACK_CONSULTATION_DEFAULT_QUESTIONS = [
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

function normalizePrompt(prompt: string) {
  return String(prompt ?? "").trim();
}

export async function getConsultationDefaultQuestions(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from("consultation_default_questions")
    .select("prompt, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code !== "42P01") {
      console.error("getConsultationDefaultQuestions error:", error);
    }
    return [...FALLBACK_CONSULTATION_DEFAULT_QUESTIONS];
  }

  const prompts = ((data ?? []) as DefaultQuestionRow[])
    .map((row) => normalizePrompt(row.prompt ?? ""))
    .filter((prompt) => prompt.length > 0);

  if (prompts.length === 0) {
    return [...FALLBACK_CONSULTATION_DEFAULT_QUESTIONS];
  }

  return prompts;
}

export async function setConsultationDefaultQuestions(
  supabase: SupabaseClient,
  prompts: string[]
) {
  const normalizedPrompts = prompts
    .map((prompt) => normalizePrompt(prompt))
    .filter((prompt) => prompt.length > 0);

  if (normalizedPrompts.length === 0) {
    return;
  }

  const nowIso = new Date().toISOString();
  const rows = normalizedPrompts.map((prompt, index) => ({
    sort_order: index + 1,
    prompt,
    updated_at: nowIso,
  }));

  const { error: upsertError } = await supabase
    .from("consultation_default_questions")
    .upsert(rows, { onConflict: "sort_order" });

  if (upsertError) {
    if (upsertError.code === "42P01") {
      return;
    }
    throw upsertError;
  }

  const { error: trimError } = await supabase
    .from("consultation_default_questions")
    .delete()
    .gt("sort_order", normalizedPrompts.length);

  if (trimError && trimError.code !== "42P01") {
    throw trimError;
  }
}

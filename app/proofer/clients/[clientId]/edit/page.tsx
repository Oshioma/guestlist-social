import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMemberAccess } from "@/lib/auth/permissions";
import ClientForm from "../../../../admin-panel/components/ClientForm";
import ClientBillingForm from "../../../../admin-panel/components/ClientBillingForm";
import ClientAiInstructions from "../../../../admin-panel/components/ClientAiInstructions";
import ClientConsultationAnswersManager from "../../../../admin-panel/components/ClientConsultationAnswersManager";
import ClientPhotoLibrary from "../../../../admin-panel/components/ClientPhotoLibrary";
import PortalVisibilityForm from "../../../../admin-panel/components/PortalVisibilityForm";
import { updateClientAction } from "../../../../admin-panel/lib/client-actions";
import { ensureDefaultConsultationFormForClient } from "../../../../admin-panel/lib/consultation-actions";
import { mapClientStatus } from "../../../../admin-panel/lib/mappers";
import EmptyState from "../../../../admin-panel/components/EmptyState";
import ProoferNav from "../../../ProoferNav";
import { resolveNavData } from "../../../navData";

export const dynamic = "force-dynamic";

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = { maxWidth: 1000, margin: "0 auto", width: "100%" };

export default async function ProoferEditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const nav = await resolveNavData(sp.client, sp.month);
  // Clients is an Agency-plan feature — no direct-URL access for free/pro.
  if (!nav.showClients) redirect(nav.base || "/");
  const clientsPath = `${nav.base}/clients`;

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  async function action(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";
    try {
      await updateClientAction(clientId, formData);
      return { error: null };
    } catch (error) {
      // updateClientAction redirects to the admin client page on success — the
      // save already happened, so send them back to the standalone list.
      if (isRedirectError(error)) redirect(clientsPath);
      return {
        error: error instanceof Error ? error.message : "Could not save client.",
      };
    }
  }

  // Client missing → bail early with the nav still in place.
  if (!client) {
    return (
      <>
        <ProoferNav
          clients={nav.clients}
          clientId={nav.clientId}
          month={nav.month}
          pillars={nav.pillars}
          posts={nav.posts}
          teams={nav.teams}
          occupiedDates={nav.occupiedDates}
          isSuperAdmin={nav.superAdmin}
          showClients={nav.showClients}
          base={nav.base}
          parentOrigin={nav.parentOrigin}
        />
        <main style={mainStyle}>
          <div style={centerStyle}>
            <Link
              href={clientsPath}
              style={{ fontSize: 13, fontWeight: 600, color: "#52525b", textDecoration: "none" }}
            >
              ← All clients
            </Link>
            <div style={{ height: 12 }} />
            <EmptyState title="Client not found" description="This client no longer exists." />
          </div>
        </main>
      </>
    );
  }

  // Billing is admin-only, exactly as in the main app — never surfaced to a
  // client user, and only rendered for an admin operator.
  const access = await getMemberAccess();
  const isAdmin = access?.role === "admin";
  const billing = isAdmin
    ? (
        await supabase
          .from("client_billing")
          .select("monthly_price, direct_debit")
          .eq("client_id", clientId)
          .maybeSingle<{ monthly_price: number | null; direct_debit: boolean }>()
      ).data
    : null;

  // Onboarding / consultation answers. Ensure a default form exists, then load
  // its questions, latest submission and answers (mirrors the admin edit page).
  await ensureDefaultConsultationFormForClient(clientId);

  const [formsRes, questionsRes, submissionsRes] = await Promise.all([
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
      .limit(1),
  ]);

  const formRows = formsRes.error?.code === "42P01" ? [] : (formsRes.data ?? []);
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
      ? {
          data: [] as Array<{
            id: number;
            submission_id: number;
            question_id: number | null;
            question_prompt: string;
            answer_text: string;
          }>,
          error: null,
        }
      : await supabase
          .from("consultation_answers")
          .select("id, submission_id, question_id, question_prompt, answer_text")
          .in("submission_id", submissionIds)
          .order("id", { ascending: true });

  const answerRows = answersRes.error?.code === "42P01" ? [] : (answersRes.data ?? []);

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

  const questionsByForm = new Map<number, Array<{ id: number; prompt: string }>>();
  for (const row of filteredQuestions as Array<{
    id: number;
    form_id: number;
    prompt: string;
    sort_order: number;
  }>) {
    const existing = questionsByForm.get(row.form_id) ?? [];
    existing.push({ id: row.id, prompt: row.prompt ?? "" });
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

  return (
    <>
      <ProoferNav
        clients={nav.clients}
        clientId={nav.clientId}
        month={nav.month}
        pillars={nav.pillars}
        posts={nav.posts}
        teams={nav.teams}
        occupiedDates={nav.occupiedDates}
        isSuperAdmin={nav.superAdmin}
        showClients={nav.showClients}
        base={nav.base}
        parentOrigin={nav.parentOrigin}
      />
      <main style={mainStyle}>
        <div style={centerStyle}>
          <Link
            href={clientsPath}
            style={{ fontSize: 13, fontWeight: 600, color: "#52525b", textDecoration: "none" }}
          >
            ← All clients
          </Link>
          <div style={{ height: 12 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
                igHandle: client.ig_handle ?? "",
                fbPage: client.fb_page ?? "",
                notes: client.notes ?? "",
                industry: client.industry ?? "",
                metaAdAccountId: client.meta_ad_account_id ?? "",
              }}
            />

            {isAdmin ? (
              <ClientBillingForm
                clientId={clientId}
                initialMonthlyPrice={
                  billing?.monthly_price != null ? Number(billing.monthly_price) : null
                }
                initialDirectDebit={billing?.direct_debit === true}
              />
            ) : null}

            <PortalVisibilityForm
              clientId={clientId}
              initial={{
                content: client.portal_show_content !== false,
                ads: client.portal_show_ads !== false,
                reviews: client.portal_show_reviews !== false,
                consultation: client.portal_show_consultation !== false,
              }}
            />

            <ClientAiInstructions
              clientId={clientId}
              initialInstructions={client.ai_instructions ?? ""}
            />

            <ClientPhotoLibrary clientId={clientId} />

            <ClientConsultationAnswersManager
              clientId={clientId}
              activeForm={activeForm}
            />
          </div>
        </div>
      </main>
    </>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "@/app/admin-panel/lib/viewer";
import ConsultationForm from "./ConsultationForm";

export const dynamic = "force-dynamic";

type FormRow = {
  id: number;
  title: string;
  is_active: boolean;
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

  const [formRes, questionsRes] = await Promise.all([
    supabase
      .from("consultation_forms")
      .select("id, title, is_active")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("consultation_questions")
      .select("id, prompt, sort_order, consultation_forms!inner(client_id, is_active)")
      .eq("consultation_forms.client_id", clientId)
      .eq("consultation_forms.is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const formMissing = formRes.error?.code === "42P01";
  const questionsMissing = questionsRes.error?.code === "42P01";

  const activeForm = formMissing ? null : ((formRes.data as FormRow | null) ?? null);
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

  if (!activeForm) {
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
          Your consultation form is not available yet. Please check back soon or
          message your account manager.
        </p>
      </div>
    );
  }

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
          {activeForm.title || "Consultation"}
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
        formId={activeForm.id}
        questions={questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
        }))}
      />
    </div>
  );
}

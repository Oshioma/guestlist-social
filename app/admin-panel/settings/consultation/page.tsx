import Link from "next/link";
import {
  importConsultationForClientAction,
} from "@/app/admin-panel/lib/consultation-actions";
import { createClient } from "@/lib/supabase/server";
import { getConsultationDefaultQuestions } from "@/app/admin-panel/lib/consultation-default-questions";
import ConsultationImportForm from "@/app/admin-panel/components/ConsultationImportForm";
import ConsultationDefaultQuestionsEditor from "@/app/admin-panel/components/ConsultationDefaultQuestionsEditor";

export const dynamic = "force-dynamic";

export default async function ConsultationSettingsPage() {
  const supabase = await createClient();
  const [defaultQuestions, clientsRes] = await Promise.all([
    getConsultationDefaultQuestions(supabase),
    supabase
      .from("clients")
      .select("id, name, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);
  const clients = (clientsRes.data ?? []) as Array<{
    id: number;
    name: string | null;
    archived: boolean | null;
  }>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link
          href="/app/settings"
          style={{
            display: "inline-block",
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            marginBottom: 8,
          }}
        >
          &larr; Settings
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Consultation Template
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Manage the default consultation questions for all newly created client
          forms.
        </p>
      </div>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 14,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Default Questions ({defaultQuestions.length})
        </h3>

        <ConsultationDefaultQuestionsEditor
          initialQuestions={defaultQuestions}
        />
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 14,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Consultation import
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>
          Paste one consultation row here to import it for an existing client.
        </p>
        <ConsultationImportForm
          clients={clients.map((client) => ({
            id: client.id,
            name: client.name ?? `Client ${client.id}`,
          }))}
        />
      </section>
    </div>
  );
}

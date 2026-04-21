import Link from "next/link";
import {
  createConsultationDefaultQuestionAction,
  deleteConsultationDefaultQuestionAction,
  importConsultationForClientAction,
  updateConsultationDefaultQuestionAction,
} from "@/app/admin-panel/lib/consultation-actions";
import { createClient } from "@/lib/supabase/server";
import { getConsultationDefaultQuestions } from "@/app/admin-panel/lib/consultation-default-questions";
import ConsultationImportForm from "@/app/admin-panel/components/ConsultationImportForm";

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

        {defaultQuestions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>
            No default questions configured yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {defaultQuestions.map((prompt, index) => {
              const sortOrder = index + 1;
              const updateAction = updateConsultationDefaultQuestionAction.bind(
                null,
                sortOrder
              );
              const deleteAction = deleteConsultationDefaultQuestionAction.bind(
                null,
                sortOrder
              );

              return (
                <div
                  key={sortOrder}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid #e4e4e7",
                    borderRadius: 10,
                    padding: 10,
                    background: "#fafafa",
                  }}
                >
                  <form
                    action={updateAction}
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <input
                      type="text"
                      name="prompt"
                      defaultValue={prompt}
                      required
                      style={{
                        width: "100%",
                        border: "1px solid #d4d4d8",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        background: "#fff",
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        border: "1px solid #d4d4d8",
                        borderRadius: 8,
                        background: "#fff",
                        color: "#18181b",
                        padding: "7px 11px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Save
                    </button>
                  </form>
                  <form action={deleteAction}>
                    <button
                      type="submit"
                      style={{
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        background: "#fff5f5",
                        color: "#b91c1c",
                        padding: "7px 11px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <form
          action={createConsultationDefaultQuestionAction}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            marginTop: 4,
          }}
        >
          <input
            type="text"
            name="prompt"
            required
            placeholder="Add default question"
            style={{
              width: "100%",
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
              background: "#fff",
            }}
          />
          <button
            type="submit"
            style={{
              border: "none",
              borderRadius: 8,
              background: "#18181b",
              color: "#fff",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add question
          </button>
        </form>
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

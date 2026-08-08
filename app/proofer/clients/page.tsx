import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "../../admin-panel/components/EmptyState";
import ProoferNav from "../ProoferNav";
import { resolveNavData } from "../navData";
import { mapClientStatus } from "../../admin-panel/lib/mappers";

export const dynamic = "force-dynamic";

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = { maxWidth: 1160, margin: "0 auto", width: "100%" };

type ClientRow = {
  id: string;
  name: string;
  status: string | null;
  platform: string | null;
  monthly_budget: number | string | null;
  ig_handle: string | null;
  archived: boolean | null;
};

type ClientView = "active" | "inactive" | "all";

export default async function ProoferClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; month?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const nav = await resolveNavData(sp.client, sp.month);

  // Active / inactive / all filter. "Active" means status === "active";
  // "inactive" is every other non-archived client (paused, onboarding, …);
  // "all" is both. Archived clients are never shown. Defaults to active.
  const view: ClientView =
    sp.view === "inactive" || sp.view === "all" ? sp.view : "active";

  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name, status, platform, monthly_budget, ig_handle, archived")
    .order("name", { ascending: true });
  // "growing" and "active" both normalise to active (see mapClientStatus).
  const isActive = (c: ClientRow) => mapClientStatus(c.status ?? "") === "active";
  const nonArchived = ((data ?? []) as ClientRow[]).filter((c) => !c.archived);
  const clients = nonArchived.filter((c) =>
    view === "all" ? true : view === "active" ? isActive(c) : !isActive(c)
  );

  const qs = `client=${encodeURIComponent(nav.clientId)}&month=${encodeURIComponent(nav.month)}`;
  const viewCounts = {
    active: nonArchived.filter((c) => isActive(c)).length,
    inactive: nonArchived.filter((c) => !isActive(c)).length,
    all: nonArchived.length,
  };
  const VIEWS: { key: ClientView; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
    { key: "all", label: "All" },
  ];

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
        base={nav.base}
        parentOrigin={nav.parentOrigin}
      />
      <main style={mainStyle}>
        <div style={centerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
              Clients
            </h1>

            {/* Active / inactive / all filter */}
            <div
              style={{
                display: "inline-flex",
                border: "1px solid #e4e4e7",
                borderRadius: 9,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {VIEWS.map((v) => {
                const selected = v.key === view;
                return (
                  <Link
                    key={v.key}
                    href={`${nav.base}/clients?${qs}&view=${v.key}`}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      padding: "7px 13px",
                      textDecoration: "none",
                      color: selected ? "#fff" : "#52525b",
                      background: selected ? "#18181b" : "transparent",
                    }}
                  >
                    {v.label}{" "}
                    <span style={{ opacity: 0.6, fontWeight: 600 }}>
                      {viewCounts[v.key]}
                    </span>
                  </Link>
                );
              })}
            </div>

            <Link
              href={`${nav.base}/clients/new?${qs}`}
              style={{
                marginLeft: "auto",
                border: "none",
                background: "#18181b",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 9,
                padding: "9px 15px",
                textDecoration: "none",
              }}
            >
              ＋ New client
            </Link>
          </div>

          {clients.length === 0 ? (
            nonArchived.length === 0 ? (
              <EmptyState title="No clients yet" description="Add your first client to get started." />
            ) : (
              <EmptyState
                title={`No ${view === "all" ? "" : view + " "}clients`}
                description="Try a different filter above."
              />
            )
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {clients.map((c) => (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 14,
                    background: "#fff",
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>
                      {c.name}
                    </span>
                    {c.status && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#3f3f46",
                          background: "#f4f4f5",
                          borderRadius: 999,
                          padding: "2px 9px",
                          textTransform: "capitalize",
                        }}
                      >
                        {c.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {c.platform && <span>{c.platform}</span>}
                    {c.ig_handle && <span>@{c.ig_handle.replace(/^@/, "")}</span>}
                    {c.monthly_budget != null && c.monthly_budget !== "" && (
                      <span>£{Number(c.monthly_budget).toLocaleString()}/mo</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Link
                      href={`${nav.base}/clients/${c.id}/edit?${qs}`}
                      style={{
                        border: "1px solid #e4e4e7",
                        background: "#fff",
                        color: "#18181b",
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: "7px 12px",
                        textDecoration: "none",
                      }}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`${nav.base || "/"}?client=${encodeURIComponent(c.id)}&month=${encodeURIComponent(nav.month)}`}
                      style={{
                        border: "1px solid #99e2d0",
                        background: "#effaf6",
                        color: "#1f6b5c",
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: "7px 12px",
                        textDecoration: "none",
                      }}
                    >
                      Open board →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

import Link from "next/link";
import { createClient } from "../../../../../lib/supabase/server";
import SectionCard from "../../../components/SectionCard";
import EmptyState from "../../../components/EmptyState";
import GenerateReviewButton from "../../../components/GenerateReviewButton";

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: number;
  period_label: string;
  period_type: string;
  period_start: string;
  period_end: string;
  status: string;
  headline: string | null;
  subhead: string | null;
  generated_at: string | null;
  sent_at: string | null;
  approved_at: string | null;
};

function statusColor(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case "approved":
      return { bg: "#dcfce7", fg: "#166534", label: "Approved" };
    case "sent":
      return { bg: "#dbeafe", fg: "#1e40af", label: "Sent" };
    case "draft":
    default:
      return { bg: "#f4f4f5", fg: "#52525b", label: "Draft" };
  }
}

export default async function ClientReviewsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [clientRes, reviewsRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("reviews")
      .select(
        "id, period_label, period_type, period_start, period_end, status, headline, subhead, generated_at, sent_at, approved_at"
      )
      .eq("client_id", clientId)
      .order("period_start", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return (
      <EmptyState
        title="Client not found"
        description="This client does not exist or has been removed."
      />
    );
  }

  const client = clientRes.data;
  const reviews = (reviewsRes.data ?? []) as ReviewRow[];

  const subNav = [
    { label: "Overview", href: `/app/clients/${clientId}` },
    { label: "Ads", href: `/app/clients/${clientId}/ads` },
    { label: "Creatives", href: `/app/clients/${clientId}/creatives` },
    { label: "Reports", href: `/app/clients/${clientId}/reports` },
    {
      label: "Reviews",
      href: `/app/clients/${clientId}/reviews`,
      active: true,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          {client.name}
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Weekly and monthly reviews — what happened, what improved, and what
          we&rsquo;re doing next.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          borderBottom: "1px solid #e4e4e7",
          paddingBottom: 12,
        }}
      >
        {subNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "9px 14px",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              color: item.active ? "#18181b" : "#52525b",
              background: item.active ? "#f4f4f5" : "transparent",
              border: item.active
                ? "1px solid #e4e4e7"
                : "1px solid transparent",
              borderRadius: 999,
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <SectionCard
        title={`Reviews (${reviews.length})`}
        action={<GenerateReviewButton clientId={clientId} />}
      >
        {reviews.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            description='Click "Build this week\u2019s review" to generate one from real numbers.'
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reviews.map((r) => {
              const sc = statusColor(r.status);
              return (
                <Link
                  key={r.id}
                  href={`/app/clients/${clientId}/reviews/${r.id}`}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 14,
                    padding: 16,
                    background: "#fff",
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#71717a",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {r.period_label}
                      </div>
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 600,
                          color: "#18181b",
                          marginTop: 4,
                        }}
                      >
                        {r.headline ?? "Untitled review"}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: sc.bg,
                        color: sc.fg,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {sc.label}
                    </span>
                  </div>
                  {r.subhead && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 14,
                        color: "#52525b",
                        lineHeight: 1.5,
                      }}
                    >
                      {r.subhead}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

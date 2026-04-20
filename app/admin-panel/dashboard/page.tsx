import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SectionCard from "../components/SectionCard";
import EmptyState from "../components/EmptyState";
import ClientCard from "../components/ClientCard";
import { mapDbClientToUiClient } from "../lib/mappers";
import TokenExpiryBanner from "../components/TokenExpiryBanner";

export const dynamic = "force-dynamic";

async function getActivityStats() {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    clientsRes,
    adsRes,
    actionsRes,
    completedActionsRes,
    postsProofedRes,
    postsPublishedRes,
    videoIdeasRes,
    carouselIdeasRes,
    storyIdeasRes,
    campaignsRes,
    decisionsRes,
    tasksRes,
    liveCampaignsRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("archived", false).order("created_at", { ascending: false }),
    supabase.from("ads").select("id, client_id, spend, clicks, impressions, ctr, status").order("created_at", { ascending: false }).limit(500),
    supabase.from("ad_actions").select("id, status, created_at").gte("created_at", thirtyDaysAgo),
    supabase.from("ad_actions").select("id").eq("status", "completed").gte("created_at", thirtyDaysAgo),
    supabase.from("proofer_posts").select("id, created_at").in("status", ["proofed", "approved"]).gte("created_at", thirtyDaysAgo),
    supabase.from("proofer_publish_queue").select("id").eq("status", "published").gte("created_at", thirtyDaysAgo),
    supabase.from("video_ideas").select("id").gte("created_at", thirtyDaysAgo),
    supabase.from("carousel_ideas").select("id").gte("created_at", thirtyDaysAgo),
    supabase.from("story_ideas").select("id").gte("created_at", thirtyDaysAgo),
    supabase.from("campaigns").select("id, status, created_at").gte("created_at", thirtyDaysAgo),
    supabase.from("ad_decisions").select("id, status, created_at").gte("created_at", thirtyDaysAgo),
    supabase.from("tasks").select("id, status").in("status", ["todo", "in_progress"]),
    supabase.from("campaigns").select("id").in("status", ["live", "testing"]),
  ]);

  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = (adsRes.data ?? []).filter((a) => String(a.client_id) === String(row.id)).length;
    return mapDbClientToUiClient(row, adCount);
  });

  const totalActions = actionsRes.data?.length ?? 0;
  const completedActions = completedActionsRes.data?.length ?? 0;
  const postsProofed = postsProofedRes.data?.length ?? 0;
  const postsPublished = postsPublishedRes.data?.length ?? 0;
  const ideasCreated = (videoIdeasRes.data?.length ?? 0)
    + (carouselIdeasRes.data?.length ?? 0)
    + (storyIdeasRes.data?.length ?? 0);
  const campaignsCreated = campaignsRes.data?.length ?? 0;
  const decisionsGenerated = decisionsRes.data?.length ?? 0;
  const tasksOutstanding = tasksRes.error ? 0 : (tasksRes.data?.length ?? 0);
  const liveCampaigns = liveCampaignsRes.error ? 0 : (liveCampaignsRes.data?.length ?? 0);

  return {
    clients,
    totalActions,
    completedActions,
    postsProofed,
    postsPublished,
    ideasCreated,
    campaignsCreated,
    decisionsGenerated,
    tasksOutstanding,
    liveCampaigns,
  };
}

export default async function DashboardPage() {
  try {
    const stats = await getActivityStats();
    const activeClients = stats.clients.filter((c) => c.status === "active");

    const cards = [
      { label: "Clients", value: String(activeClients.length), sub: `${stats.clients.length} total`, href: "/app/clients" },
      { label: "Posts Proofed", value: String(stats.postsProofed), sub: `${stats.postsPublished} published`, color: stats.postsPublished > 0 ? "#166534" : undefined, href: "/app/proofer/publish" },
      { label: "Ideas Created", value: String(stats.ideasCreated), sub: "video + carousel + story", href: "/app/ideas" },
      { label: "Campaigns Live", value: String(stats.liveCampaigns), sub: "active right now", color: stats.liveCampaigns > 0 ? "#166534" : undefined },
      { label: "Decisions", value: String(stats.decisionsGenerated), sub: "generated this month" },
      { label: "Tasks Outstanding", value: String(stats.tasksOutstanding), sub: "to do + in progress", color: stats.tasksOutstanding > 0 ? "#b45309" : undefined, href: "/app/tasks" },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <TokenExpiryBanner />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {cards.map((c) => {
            const inner = (
              <>
                <div style={{ fontSize: 12, color: c.href ? "#18181b" : "#71717a", fontWeight: c.href ? 600 : 400, marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color ?? "#18181b", letterSpacing: "-0.02em" }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{c.sub}</div>
              </>
            );
            const style = {
              padding: "16px 18px",
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #e4e4e7",
              textDecoration: "none" as const,
              color: "inherit" as const,
              display: "block" as const,
            };
            return c.href ? (
              <Link key={c.label} href={c.href} style={style}>{inner}</Link>
            ) : (
              <div key={c.label} style={style}>{inner}</div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Link
            href="/app/proofer"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#fdf2f8",
              border: "1px solid #f9a8d4",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Social Publisher</div>
          </Link>
          <Link
            href="/app/content"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Content Dashboard</div>
          </Link>
          <Link
            href="/app/engine"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "#eef2ff",
              border: "1px solid #c7d2fe",
              textDecoration: "none",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Engine Dashboard</div>
          </Link>
        </div>

        <div>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#18181b" }}>
            Active clients ({activeClients.length})
          </h2>
          {activeClients.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {activeClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active clients"
              description="Set a client to active to see them here."
            />
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error("Dashboard page error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <EmptyState
        title="Dashboard failed to load"
        description={message}
      />
    );
  }
}

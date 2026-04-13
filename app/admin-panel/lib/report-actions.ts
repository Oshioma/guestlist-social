"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export type ReportData = {
  clientName: string;
  period: string;
  generatedAt: string;
  summary: {
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    avgCtr: number;
    adCount: number;
    activeAds: number;
    pausedAds: number;
    endedAds: number;
  };
  topAds: { name: string; ctr: number; spend: number }[];
  bottomAds: { name: string; ctr: number; spend: number }[];
  actions: {
    opened: number;
    completed: number;
    inProgress: number;
  };
  learningsCount: number;
  campaignBreakdown: {
    name: string;
    adCount: number;
    spend: number;
    avgCtr: number;
  }[];
};

function getCurrentPeriod() {
  const now = new Date();
  return now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export async function generateClientReport(clientId: string) {
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: adsRows },
    { data: actionRows },
    { data: learningRows },
    { data: campaignRows },
  ] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase.from("ads").select("*").eq("client_id", clientId),
    supabase.from("actions").select("id, status, is_complete").eq("client_id", clientId),
    supabase.from("learnings").select("id").eq("client_id", clientId),
    supabase.from("campaigns").select("id, name").eq("client_id", clientId),
  ]);

  if (clientError || !client) {
    throw new Error("Client not found.");
  }

  const ads = adsRows ?? [];
  const actions = actionRows ?? [];
  const learnings = learningRows ?? [];
  const campaigns = campaignRows ?? [];

  // Summary stats
  const totalSpend = ads.reduce((s, a) => s + Number(a.spend ?? 0), 0);
  const totalImpressions = ads.reduce((s, a) => s + Number(a.impressions ?? 0), 0);
  const totalClicks = ads.reduce((s, a) => s + Number(a.clicks ?? 0), 0);
  const avgCtr =
    totalImpressions > 0
      ? Number(((totalClicks / totalImpressions) * 100).toFixed(2))
      : 0;

  const statusMap: Record<string, number> = { winner: 0, testing: 0, losing: 0, paused: 0 };
  for (const ad of ads) {
    const st = String(ad.status ?? "testing");
    statusMap[st] = (statusMap[st] ?? 0) + 1;
  }

  // Top and bottom ads (by CTR, with minimum spend)
  const adsWithCtr = ads
    .filter((a) => Number(a.impressions ?? 0) > 0 && Number(a.spend ?? 0) >= 1)
    .map((a) => {
      const imp = Number(a.impressions ?? 0);
      const clk = Number(a.clicks ?? 0);
      return {
        name: String(a.name ?? "Untitled"),
        ctr: Number(((clk / imp) * 100).toFixed(2)),
        spend: Number(a.spend ?? 0),
      };
    })
    .sort((a, b) => b.ctr - a.ctr);

  const topAds = adsWithCtr.slice(0, 5);
  const bottomAds = adsWithCtr.length > 1
    ? adsWithCtr.slice(-Math.min(5, Math.floor(adsWithCtr.length / 2))).reverse()
    : [];

  // Actions breakdown
  const actionsOpened = actions.filter((a) => a.status === "open").length;
  const actionsCompleted = actions.filter(
    (a) => a.status === "completed" || a.is_complete === true
  ).length;
  const actionsInProgress = actions.filter((a) => a.status === "in_progress").length;

  // Campaign breakdown
  const campaignBreakdown = campaigns.map((c) => {
    const campaignAds = ads.filter((a) => String(a.campaign_id) === String(c.id));
    const cSpend = campaignAds.reduce((s, a) => s + Number(a.spend ?? 0), 0);
    const cImpressions = campaignAds.reduce((s, a) => s + Number(a.impressions ?? 0), 0);
    const cClicks = campaignAds.reduce((s, a) => s + Number(a.clicks ?? 0), 0);
    const cCtr =
      cImpressions > 0
        ? Number(((cClicks / cImpressions) * 100).toFixed(2))
        : 0;
    return {
      name: String(c.name),
      adCount: campaignAds.length,
      spend: cSpend,
      avgCtr: cCtr,
    };
  });

  const period = getCurrentPeriod();

  const reportData: ReportData = {
    clientName: String(client.name),
    period,
    generatedAt: new Date().toISOString(),
    summary: {
      totalSpend,
      totalImpressions,
      totalClicks,
      avgCtr,
      adCount: ads.length,
      activeAds: statusMap["winner"] ?? 0,
      pausedAds: statusMap["paused"] ?? 0,
      endedAds: statusMap["losing"] ?? 0,
    },
    topAds,
    bottomAds,
    actions: {
      opened: actionsOpened,
      completed: actionsCompleted,
      inProgress: actionsInProgress,
    },
    learningsCount: learnings.length,
    campaignBreakdown,
  };

  // Save report to DB
  const { error: insertError } = await supabase.from("reports").insert({
    client_id: clientId,
    title: `${client.name} — ${period}`,
    period,
    data: reportData,
  });

  if (insertError) {
    console.error("generateClientReport insert error:", insertError);
    throw new Error("Could not save report.");
  }

  revalidatePath("/admin-panel/reports");
  revalidatePath(`/admin-panel/clients/${clientId}/reports`);

  return reportData;
}

export async function generateAllClientReports() {
  const supabase = await createClient();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id")
    .order("name", { ascending: true });

  if (error || !clients) {
    throw new Error("Could not load clients.");
  }

  for (const client of clients) {
    try {
      await generateClientReport(String(client.id));
    } catch (e) {
      console.error(`Report generation failed for client ${client.id}:`, e);
    }
  }

  revalidatePath("/admin-panel/reports");
}

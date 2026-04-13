import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionPhrase, type PatternCandidate } from "@/lib/pattern-phrases";
import SectionCard from "../components/SectionCard";
import MetaSyncButton from "../components/MetaSyncButton";
import ReaperThresholdsForm from "../components/ReaperThresholdsForm";
import { syncMetaData, importFromMeta, syncAllClients } from "../lib/meta-sync-action";
import {
  getReaperSettings,
  REAPER_BOUNDS,
  DEFAULT_REAPER_SETTINGS,
} from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("archived", false)
    .order("name", { ascending: true });

  const clientList = clients ?? [];

  // Read reaper settings via the service-role client so we always see what
  // was actually saved, regardless of whether RLS is on for app_settings.
  // The page is admin-only at the route level so this isn't a privilege leak.
  const adminClient = createAdminClient();
  const reaperSettings = await getReaperSettings(adminClient);
  const reaperPercent = Math.round(reaperSettings.negRatio * 100);
  const reaperIsDefault =
    reaperSettings.minDecisiveVerdicts ===
      DEFAULT_REAPER_SETTINGS.minDecisiveVerdicts &&
    reaperSettings.negRatio === DEFAULT_REAPER_SETTINGS.negRatio;

  // Pre-project each active slice into its English phrasing here so the
  // client-side preview doesn't need to re-ship global_learnings.
  const [{ data: feedbackRows }, { data: learningRows }] = await Promise.all([
    adminClient
      .from("pattern_feedback")
      .select("pattern_key, industry, positive_verdicts, negative_verdicts")
      .is("retired_at", null),
    adminClient.from("global_learnings").select("pattern_key, pattern_label"),
  ]);

  const labelByKey = new Map<string, string>();
  for (const r of (learningRows ?? []) as {
    pattern_key: string;
    pattern_label: string | null;
  }[]) {
    if (!labelByKey.has(r.pattern_key) && r.pattern_label) {
      labelByKey.set(r.pattern_key, r.pattern_label);
    }
  }

  const reaperPatterns: PatternCandidate[] = [];
  for (const f of (feedbackRows ?? []) as {
    pattern_key: string;
    industry: string | null;
    positive_verdicts: number | null;
    negative_verdicts: number | null;
  }[]) {
    const positive = Number(f.positive_verdicts ?? 0);
    const negative = Number(f.negative_verdicts ?? 0);
    const decisive = positive + negative;
    if (decisive === 0) continue;
    reaperPatterns.push({
      pattern_key: f.pattern_key,
      industry: f.industry,
      positive,
      negative,
      decisive,
      phrase: actionPhrase(f.pattern_key, labelByKey.get(f.pattern_key) ?? null),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Settings</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Admin configuration and preferences.
        </p>
      </div>

      <SectionCard title="Account">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: "#71717a", marginBottom: 4 }}>
              Agency Name
            </div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              Guestlist Social
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: "#71717a", marginBottom: 4 }}>
              Contact Email
            </div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              nelly@guestlistsocial.com
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Meta Ads Sync">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 14, color: "#52525b", margin: 0 }}>
            Pull campaigns, ads, performance data, and daily snapshots from your
            Meta ad account. Syncs the last 12 months of data and 30 days of
            daily trend snapshots.
          </p>

          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Import from Meta
            </div>
            <p style={{ fontSize: 13, color: "#71717a", margin: "0 0 12px" }}>
              Creates a client from your Meta ad account name and imports all
              campaigns, ads, and performance data into it. Safe to run multiple
              times — it won't create duplicates.
            </p>
            <MetaSyncButton
              action={async () => {
                "use server";
                return await importFromMeta();
              }}
              label="Import from Meta"
              pendingLabel="Importing from Meta..."
            />
          </div>

          {clientList.length > 1 && (
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: "1px solid #e4e4e7",
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                Sync All Clients
              </div>
              <p style={{ fontSize: 13, color: "#71717a", margin: "0 0 12px" }}>
                Runs a full Meta sync for all {clientList.length} clients in one
                go.
              </p>
              <MetaSyncButton
                action={async () => {
                  "use server";
                  return await syncAllClients();
                }}
                label="Sync All Clients"
                pendingLabel="Syncing all clients..."
              />
            </div>
          )}

          {clientList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {clientList.map((client) => (
                <div
                  key={client.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #e4e4e7",
                    background: "#fafafa",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {client.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
                      Client ID: {client.id}
                    </div>
                  </div>

                  <MetaSyncButton
                    action={async () => {
                      "use server";
                      return await syncMetaData(String(client.id));
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
              No clients found. Create a client first, then sync Meta data into
              it.
            </p>
          )}

          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              fontSize: 12,
              color: "#92400e",
            }}
          >
            <strong>Required env vars:</strong> META_ACCESS_TOKEN and
            META_AD_ACCOUNT_ID must be set in your environment. The sync pulls
            all campaigns and ads from the connected ad account into the selected
            client.
          </div>
        </div>
      </SectionCard>

      <SectionCard title="When to retire failing moves">
        <ReaperThresholdsForm
          initialMinDecisive={reaperSettings.minDecisiveVerdicts}
          initialNegRatioPercent={reaperPercent}
          bounds={{
            minDecisiveVerdicts: REAPER_BOUNDS.minDecisiveVerdicts,
            negRatioPercent: {
              min: Math.round(REAPER_BOUNDS.negRatio.min * 100),
              max: Math.round(REAPER_BOUNDS.negRatio.max * 100),
            },
          }}
          isDefault={reaperIsDefault}
          patterns={reaperPatterns}
        />
      </SectionCard>
    </div>
  );
}

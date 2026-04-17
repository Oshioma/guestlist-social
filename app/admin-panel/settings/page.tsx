import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type PatternCandidate } from "@/lib/pattern-phrases";
import { fetchAnnotatedPatternFeedback } from "@/lib/pattern-feedback";
import SectionCard from "../components/SectionCard";
import MetaSyncButton from "../components/MetaSyncButton";
import ReaperThresholdsForm from "../components/ReaperThresholdsForm";
import EngineThresholdsForm from "../components/EngineThresholdsForm";
import AutoApproveForm from "../components/AutoApproveForm";
import AiSourcesForm from "../components/AiSourcesForm";
import { syncMetaData, importFromMeta, syncAllClients } from "../lib/meta-sync-action";
import {
  getReaperSettings,
  REAPER_BOUNDS,
  DEFAULT_REAPER_SETTINGS,
  getEngineThresholds,
  setEngineThresholds,
  DEFAULT_ENGINE_THRESHOLDS,
  ENGINE_BOUNDS,
  type EngineThresholds,
  getAutoApproveSettings,
  setAutoApproveSettings,
  type AutoApproveSettings,
  getAiSourceSettings,
  setAiSourceSettings,
  type AiSourceSettings,
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

  const adminClient = createAdminClient();

  const [reaperSettings, engineSettings, autoApproveSettings, aiSources, { data: metaAccounts }] =
    await Promise.all([
      getReaperSettings(adminClient),
      getEngineThresholds(adminClient),
      getAutoApproveSettings(adminClient),
      getAiSourceSettings(adminClient),
      adminClient
        .from("connected_meta_accounts")
        .select("id, client_id, platform, account_name, token_expires_at, updated_at")
        .order("updated_at", { ascending: false }),
    ]);
  const reaperPercent = Math.round(reaperSettings.negRatio * 100);
  const reaperIsDefault =
    reaperSettings.minDecisiveVerdicts ===
      DEFAULT_REAPER_SETTINGS.minDecisiveVerdicts &&
    reaperSettings.negRatio === DEFAULT_REAPER_SETTINGS.negRatio;

  const engineIsDefault = (Object.keys(DEFAULT_ENGINE_THRESHOLDS) as (keyof EngineThresholds)[]).every(
    (k) => engineSettings[k] === DEFAULT_ENGINE_THRESHOLDS[k]
  );

  const accounts = (metaAccounts ?? []) as {
    id: string;
    client_id: number;
    platform: string;
    account_name: string | null;
    token_expires_at: string | null;
    updated_at: string | null;
  }[];

  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
  const hasMetaToken = !!process.env.META_ACCESS_TOKEN;
  const hasMetaAccount = !!process.env.META_AD_ACCOUNT_ID;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasSmtp = !!process.env.SMTP_HOST;
  const hasMetaSocialApp = !!process.env.META_SOCIAL_APP_ID;

  // Narrow the annotated feed to the active slice with at least one verdict —
  // the reaper only sweeps rows it's seen measured outcomes on.
  const { rows: annotated } = await fetchAnnotatedPatternFeedback(adminClient);
  const reaperPatterns: PatternCandidate[] = annotated
    .filter((r) => !r.retired_at && r.decisive > 0)
    .map((r) => ({
      pattern_key: r.pattern_key,
      industry: r.industry,
      positive: r.positive,
      negative: r.negative,
      decisive: r.decisive,
      phrase: r.phrase,
    }));

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

      <SectionCard title="API Keys">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Meta Access Token", ok: hasMetaToken, env: "META_ACCESS_TOKEN" },
            { label: "Meta Ad Account ID", ok: hasMetaAccount, env: "META_AD_ACCOUNT_ID" },
            { label: "Meta Social App ID", ok: hasMetaSocialApp, env: "META_SOCIAL_APP_ID" },
            { label: "Anthropic API Key", ok: hasAnthropicKey, env: "ANTHROPIC_API_KEY" },
            { label: "SMTP (email)", ok: hasSmtp, env: "SMTP_HOST" },
            { label: "OpenAI (image gen)", ok: hasOpenAiKey, env: "OPENAI_API_KEY" },
          ].map((item) => (
            <div
              key={item.env}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: item.ok ? "#ecfdf5" : "#fef2f2",
                border: `1px solid ${item.ok ? "#bbf7d0" : "#fecaca"}`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: item.ok ? "#22c55e" : "#ef4444",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: "#18181b" }}>
                {item.label}
              </span>
              <span style={{ fontSize: 11, color: "#71717a", marginLeft: "auto" }}>
                {item.ok ? "Configured" : `Missing ${item.env}`}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {accounts.length > 0 && (
        <SectionCard title={`Connected Meta Accounts (${accounts.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accounts.map((acc) => {
              const clientName = clientList.find((c) => String(c.id) === String(acc.client_id))?.name ?? `Client ${acc.client_id}`;
              const expires = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
              const isExpired = expires ? expires.getTime() < Date.now() : false;
              const expiresSoon = expires ? expires.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000 : false;

              return (
                <div
                  key={acc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e4e4e7",
                    background: isExpired ? "#fef2f2" : expiresSoon ? "#fffbeb" : "#fff",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {acc.account_name ?? acc.platform}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
                      {clientName} · {acc.platform}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: isExpired ? "#991b1b" : expiresSoon ? "#92400e" : "#71717a" }}>
                    {isExpired
                      ? "Token expired"
                      : expires
                      ? `Expires ${expires.toLocaleDateString()}`
                      : "No expiry set"}
                  </div>
                  {acc.updated_at && (
                    <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                      Updated {new Date(acc.updated_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Engine Scoring Thresholds">
        <EngineThresholdsForm
          initial={engineSettings}
          bounds={ENGINE_BOUNDS}
          isDefault={engineIsDefault}
          onSave={async (values) => {
            "use server";
            const admin = createAdminClient();
            await setEngineThresholds(admin, values);
          }}
        />
      </SectionCard>

      <SectionCard title="AI Suggestion Sources">
        <AiSourcesForm
          initial={aiSources}
          hasOpenAiKey={hasOpenAiKey}
          onSave={async (values) => {
            "use server";
            const admin = createAdminClient();
            await setAiSourceSettings(admin, values as AiSourceSettings);
          }}
        />
      </SectionCard>

      <SectionCard title="Auto-Approve Decisions">
        <AutoApproveForm
          initial={autoApproveSettings}
          onSave={async (values) => {
            "use server";
            const admin = createAdminClient();
            await setAutoApproveSettings(admin, values as AutoApproveSettings);
          }}
        />
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

          {!hasMetaToken && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                fontSize: 12,
                color: "#991b1b",
              }}
            >
              <strong>META_ACCESS_TOKEN</strong> and{" "}
              <strong>META_AD_ACCOUNT_ID</strong> are not set. Add them in
              Vercel → Settings → Environment Variables to enable Meta sync.
            </div>
          )}
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

import { createClient } from "@/lib/supabase/server";
import SectionCard from "../components/SectionCard";
import MetaSyncButton from "../components/MetaSyncButton";
import { syncMetaData } from "../lib/meta-sync-action";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("archived", false)
    .order("name", { ascending: true });

  const clientList = clients ?? [];

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

      <SectionCard title="Preferences">
        <div style={{ fontSize: 14, color: "#71717a" }}>
          Settings and preferences will be configurable here.
        </div>
      </SectionCard>
    </div>
  );
}

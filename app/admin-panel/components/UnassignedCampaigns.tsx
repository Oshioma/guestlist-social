"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AssignCampaignButton from "./AssignCampaignButton";

type Campaign = {
  id: string | number;
  name: string;
  objective?: string | null;
  status?: string | null;
  meta_status?: string | null;
  meta_id?: string | null;
  meta_ad_account_name?: string | null;
  budget?: number | string | null;
  created_at?: string | null;
};

type AssignableClient = {
  id: string | number;
  name: string;
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function UnassignedCampaigns({
  campaigns,
  currentClientId,
  currentClientName,
  assignableClients,
}: {
  campaigns: Campaign[];
  currentClientId: string;
  currentClientName: string;
  assignableClients: AssignableClient[];
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const router = useRouter();

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.objective ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.meta_id ?? "").includes(search)
  );

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  function toggleOne(id: string | number) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  async function bulkAssign() {
    if (selected.size === 0) return;
    setBulkAssigning(true);
    try {
      for (const campaignId of selected) {
        const res = await fetch("/api/assign-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: String(campaignId),
            clientId: currentClientId,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          console.error("Bulk assign failed for", campaignId, data);
        }
      }
      setBulkDone(true);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      console.error("Bulk assign error:", err);
    } finally {
      setBulkAssigning(false);
    }
  }

  if (campaigns.length === 0) {
    return (
      <div style={{ fontSize: 14, color: "#a1a1aa", padding: "12px 0" }}>
        No unassigned Meta campaigns. Everything imported is already assigned.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Search + Select All bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search campaigns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 13,
            outline: "none",
          }}
        />

        <button
          type="button"
          onClick={toggleAll}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            background: allSelected ? "#f4f4f5" : "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            color: "#18181b",
          }}
        >
          {allSelected ? "Deselect all" : `Select all (${filtered.length})`}
        </button>

        {selected.size > 0 && (
          <button
            type="button"
            onClick={bulkAssign}
            disabled={bulkAssigning}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "#18181b",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: bulkAssigning ? "wait" : "pointer",
              opacity: bulkAssigning ? 0.6 : 1,
            }}
          >
            {bulkAssigning
              ? "Assigning..."
              : `Assign ${selected.size} to ${currentClientName}`}
          </button>
        )}

        {bulkDone && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#166534",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            Assigned
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#71717a" }}>
        Showing {filtered.length} of {campaigns.length} unassigned campaigns
        {selected.size > 0 && ` · ${selected.size} selected`}
      </div>

      {/* Campaign list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((campaign) => (
          <div
            key={campaign.id}
            style={{
              border: selected.has(campaign.id)
                ? "2px solid #18181b"
                : "1px solid #e4e4e7",
              borderRadius: 16,
              padding: selected.has(campaign.id) ? 15 : 16,
              background: selected.has(campaign.id) ? "#fafafa" : "#fff",
              cursor: "pointer",
            }}
            onClick={() => toggleOne(campaign.id)}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={selected.has(campaign.id)}
                  onChange={() => toggleOne(campaign.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 3, accentColor: "#18181b" }}
                />
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#18181b",
                    }}
                  >
                    {campaign.name}
                  </p>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      color: "#71717a",
                    }}
                  >
                    {campaign.objective ?? "No objective"} ·{" "}
                    {campaign.meta_ad_account_name ?? "Unknown Meta account"}
                  </p>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 12,
                      color: "#a1a1aa",
                    }}
                  >
                    Meta ID: {campaign.meta_id ?? "—"}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#f4f4f5",
                    color: "#52525b",
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {campaign.meta_status ?? campaign.status ?? "unknown"}
                </span>

                <AssignCampaignButton
                  campaignId={campaign.id}
                  clientId={currentClientId}
                  label={`Assign to ${currentClientName}`}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  border: "1px solid #f4f4f5",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 12, color: "#71717a" }}>Budget</div>
                <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                  {formatCurrency(Number(campaign.budget ?? 0))}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #f4f4f5",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 12, color: "#71717a" }}>Meta account</div>
                <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                  {campaign.meta_ad_account_name ?? "—"}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #f4f4f5",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 12, color: "#71717a" }}>Created</div>
                <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                  {campaign.created_at
                    ? new Date(campaign.created_at).toLocaleDateString()
                    : "—"}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {assignableClients
                .filter((c) => String(c.id) !== currentClientId)
                .map((targetClient) => (
                  <AssignCampaignButton
                    key={targetClient.id}
                    campaignId={campaign.id}
                    clientId={targetClient.id}
                    label={`Assign to ${targetClient.name}`}
                    variant="secondary"
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

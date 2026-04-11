"use client";

import { useState, useTransition } from "react";
import SectionCard from "./SectionCard";

type ClientOption = { id: string; name: string };

const audiences = ["Broad", "Lookalike", "Retarget", "Interest-based"];
const budgetOptions = [
  { label: "£10/day", value: 10 },
  { label: "£25/day", value: 25 },
  { label: "£50/day", value: 50 },
  { label: "£100/day", value: 100 },
];

export default function LaunchForm({
  clients,
  onLaunch,
}: {
  clients: ClientOption[];
  onLaunch: (formData: FormData) => Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [selectedAudience, setSelectedAudience] = useState("");
  const [selectedBudget, setSelectedBudget] = useState<number | null>(null);
  const [launched, setLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedClient = clients.find((c) => c.id === clientId);

  function handleLaunch() {
    setError(null);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("name", campaignName);
    fd.set("audience", selectedAudience);
    fd.set("budget", String(selectedBudget ?? 0));
    fd.set("status", "live");
    fd.set("objective", "engagement");

    startTransition(async () => {
      try {
        await onLaunch(fd);
        setLaunched(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not launch campaign."
        );
      }
    });
  }

  const ready =
    clientId && campaignName && selectedAudience && selectedBudget !== null;

  if (launched) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionCard title="Campaign Launched">
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div
              style={{ fontSize: 40, marginBottom: 12 }}
              role="img"
              aria-label="rocket"
            >
              &#x1F680;
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              Campaign is live
            </div>
            <p style={{ color: "#71717a", fontSize: 14, margin: "0 0 20px" }}>
              &quot;{campaignName}&quot; for {selectedClient?.name ?? "client"}{" "}
              has been saved and is now running.
            </p>
            <button
              onClick={() => {
                setLaunched(false);
                setClientId("");
                setCampaignName("");
                setSelectedAudience("");
                setSelectedBudget(null);
                setError(null);
              }}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                background: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Launch another
            </button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Launch Centre
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Set up and launch a new campaign. This saves directly to your
          database.
        </p>
      </div>

      <SectionCard title="New Campaign">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 520,
          }}
        >
          {/* Client select */}
          <div>
            <label
              style={{
                fontSize: 13,
                color: "#71717a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 14,
                background: "#fff",
              }}
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign name */}
          <div>
            <label
              style={{
                fontSize: 13,
                color: "#71717a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Campaign Name
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Summer Push — Reels"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Audience */}
          <div>
            <label
              style={{
                fontSize: 13,
                color: "#71717a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Audience
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {audiences.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setSelectedAudience(a)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 999,
                    border:
                      selectedAudience === a ? "none" : "1px solid #e4e4e7",
                    background: selectedAudience === a ? "#18181b" : "#fff",
                    color: selectedAudience === a ? "#fff" : "#52525b",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label
              style={{
                fontSize: 13,
                color: "#71717a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Daily Budget
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {budgetOptions.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setSelectedBudget(b.value)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 999,
                    border:
                      selectedBudget === b.value
                        ? "none"
                        : "1px solid #e4e4e7",
                    background:
                      selectedBudget === b.value ? "#18181b" : "#fff",
                    color: selectedBudget === b.value ? "#fff" : "#52525b",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>
              {error}
            </p>
          )}

          {/* Launch button */}
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!ready || isPending}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: ready && !isPending ? "#18181b" : "#d4d4d8",
              color: ready && !isPending ? "#fff" : "#a1a1aa",
              fontSize: 15,
              fontWeight: 600,
              cursor:
                ready && !isPending ? "pointer" : "not-allowed",
              alignSelf: "flex-start",
              marginTop: 4,
            }}
          >
            {isPending ? "Launching..." : "Launch Campaign"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

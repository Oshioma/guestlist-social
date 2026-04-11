"use client";

import { useState } from "react";
import { clients } from "../lib/data";
import SectionCard from "../components/SectionCard";

const audiences = ["Broad", "Lookalike", "Retarget", "Interest-based"];
const budgetOptions = ["£10/day", "£25/day", "£50/day", "£100/day"];

export default function LaunchPage() {
  const [clientId, setClientId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [selectedAudience, setSelectedAudience] = useState("");
  const [selectedBudget, setSelectedBudget] = useState("");
  const [fileName, setFileName] = useState("");
  const [launched, setLaunched] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : "");
  }

  function handleLaunch() {
    console.log("launch campaign", {
      clientId,
      campaignName,
      audience: selectedAudience,
      budget: selectedBudget,
      creative: fileName,
    });
    setLaunched(true);
  }

  const ready =
    clientId && campaignName && selectedAudience && selectedBudget;

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
              &quot;{campaignName}&quot; for{" "}
              {clients.find((c) => c.id === clientId)?.name} is now running.
            </p>
            <button
              onClick={() => {
                setLaunched(false);
                setClientId("");
                setCampaignName("");
                setSelectedAudience("");
                setSelectedBudget("");
                setFileName("");
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
          Set up and launch a new campaign.
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

          {/* Upload creative */}
          <div>
            <label
              style={{
                fontSize: 13,
                color: "#71717a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Creative
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 14,
                cursor: "pointer",
                background: "#fafafa",
              }}
            >
              <span>{fileName || "Upload file"}</span>
              <input
                type="file"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
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
                  onClick={() => setSelectedAudience(a)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 999,
                    border:
                      selectedAudience === a
                        ? "none"
                        : "1px solid #e4e4e7",
                    background:
                      selectedAudience === a ? "#18181b" : "#fff",
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
                  key={b}
                  onClick={() => setSelectedBudget(b)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 999,
                    border:
                      selectedBudget === b
                        ? "none"
                        : "1px solid #e4e4e7",
                    background:
                      selectedBudget === b ? "#18181b" : "#fff",
                    color: selectedBudget === b ? "#fff" : "#52525b",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Launch button */}
          <button
            onClick={handleLaunch}
            disabled={!ready}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: ready ? "#18181b" : "#d4d4d8",
              color: ready ? "#fff" : "#a1a1aa",
              fontSize: 15,
              fontWeight: 600,
              cursor: ready ? "pointer" : "not-allowed",
              alignSelf: "flex-start",
              marginTop: 4,
            }}
          >
            Launch Campaign
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

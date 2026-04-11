import { clients } from "../lib/data";
import SectionCard from "../components/SectionCard";
import EmptyState from "../components/EmptyState";

export default function LaunchPage() {
  const onboardingClients = clients.filter(
    (c) => c.status === "onboarding"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Launch Centre
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Prepare and launch campaigns for clients.
        </p>
      </div>

      <SectionCard title="Clients Ready to Launch">
        {onboardingClients.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {onboardingClients.map((client) => (
              <div
                key={client.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {client.name}
                  </div>
                  <div style={{ fontSize: 13, color: "#71717a" }}>
                    {client.platform}
                  </div>
                </div>
                <span
                  style={{
                    padding: "6px 16px",
                    borderRadius: 8,
                    background: "#18181b",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Prepare Launch
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No clients onboarding"
            description="When a new client starts onboarding, they'll appear here."
          />
        )}
      </SectionCard>
    </div>
  );
}

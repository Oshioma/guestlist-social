import SectionCard from "../components/SectionCard";

export default function SettingsPage() {
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

      <SectionCard title="Preferences">
        <div style={{ fontSize: 14, color: "#71717a" }}>
          Settings and preferences will be configurable here.
        </div>
      </SectionCard>
    </div>
  );
}

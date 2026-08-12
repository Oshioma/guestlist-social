// The Guestlist Social mission, shown large at the top of the dashboard.
// Presentational only (no interactivity), so it stays a server component.
export default function MissionBanner() {
  return (
    <section style={bannerStyle} aria-label="Our mission">
      <div style={eyebrowStyle}>Our mission</div>
      <p style={missionStyle}>
        Creating great, positive content, shaping a beautiful
        world&nbsp;—&nbsp;together.
      </p>
    </section>
  );
}

const bannerStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(120deg,#0f172a 0%,#155e63 55%,#0f766e 100%)",
  color: "#fff",
  borderRadius: 18,
  padding: "26px 30px",
  boxShadow: "0 10px 30px rgba(15,23,42,.18)",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,.72)",
  marginBottom: 10,
};

const missionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(22px, 3.2vw, 34px)",
  fontWeight: 800,
  lineHeight: 1.18,
  letterSpacing: "-0.01em",
  maxWidth: 820,
  textWrap: "balance",
};

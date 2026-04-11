export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 24px",
        color: "#a1a1aa",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>
        {title}
      </div>
      {description && (
        <p style={{ fontSize: 14, margin: 0 }}>{description}</p>
      )}
    </div>
  );
}

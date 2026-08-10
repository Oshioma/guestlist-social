import Link from "next/link";
import { notFound } from "next/navigation";
import { getLegalPage } from "@/lib/legal/pages";

// Shared renderer for the public legal pages (/privacy, /data-deletion). Plain,
// self-contained, and reachable logged-out — Meta App Review must be able to
// open these URLs. The body is trusted HTML authored by the platform owner in
// Super admin → Legal (or the code default), so it's rendered directly.
export default async function LegalPage({ pageKey }: { pageKey: string }) {
  const page = await getLegalPage(pageKey);
  if (!page) notFound();

  return (
    <main style={wrap}>
      <div style={inner}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/" style={homeLink}>
            &larr; Home
          </Link>
        </div>
        <h1 style={h1}>{page.title}</h1>
        <article style={body} dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
        <footer style={footer}>
          <Link href="/privacy" style={footLink}>
            Privacy Policy
          </Link>
          <span style={{ color: "#d4d4d8" }}>·</span>
          <Link href="/data-deletion" style={footLink}>
            Data Deletion
          </Link>
        </footer>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#fafaf9",
  padding: "48px 20px",
  color: "#27272a",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

const inner: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 16,
  padding: "40px 44px",
};

const h1: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: "0 0 20px",
};

const body: React.CSSProperties = {
  fontSize: 15.5,
  lineHeight: 1.65,
  color: "#3f3f46",
};

const homeLink: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#71717a",
  textDecoration: "none",
};

const footer: React.CSSProperties = {
  marginTop: 36,
  paddingTop: 18,
  borderTop: "1px solid #f1f5f9",
  display: "flex",
  gap: 12,
  fontSize: 13,
};

const footLink: React.CSSProperties = {
  color: "#52525b",
  fontWeight: 600,
  textDecoration: "none",
};

import Link from "next/link";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getProoferBase } from "../base";
import { InviteOwnerForm } from "./InviteOwnerForm";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  // Only the platform owner. notFound() rather than a redirect so the page's
  // existence isn't revealed to anyone else.
  if (!(await isSuperAdmin())) notFound();

  const { base } = await getProoferBase();

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Link href={base || "/"} style={backLinkStyle}>
            &larr; Board
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Super admin</h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0", maxWidth: 640 }}>
            Owner-only tools. Only you can see this page.
          </p>
        </div>

        <section style={cardStyle}>
          <h3 style={sectionTitleStyle}>Invite someone to their own team</h3>
          <p style={sectionSubStyle}>
            Onboard an independent user: they get their own workspace as owner
            (not added to any of your teams) and can add and connect their own
            accounts after signing in.
          </p>
          <InviteOwnerForm />
        </section>
      </div>
    </main>
  );
}

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 13,
  color: "#71717a",
  textDecoration: "none",
  marginBottom: 8,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  padding: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 15,
  fontWeight: 600,
};

const sectionSubStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 13,
  color: "#71717a",
  maxWidth: 620,
};

import Link from "next/link";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getProoferBase } from "../base";
import { InviteOwnerForm } from "./InviteOwnerForm";
import EmailTemplatesEditor from "./EmailTemplatesEditor";
import { loadEmailTemplatesForEditor } from "@/lib/email/template-actions";
import UsersOverview from "./UsersOverview";
import { loadUsersOverview } from "@/lib/admin/users-overview";

export const dynamic = "force-dynamic";

type Tab = "tools" | "emails" | "users";

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Only the platform owner. notFound() rather than a redirect so the page's
  // existence isn't revealed to anyone else.
  if (!(await isSuperAdmin())) notFound();

  const { base } = await getProoferBase();
  const sp = await searchParams;
  const tab: Tab =
    sp.tab === "emails" ? "emails" : sp.tab === "users" ? "users" : "tools";

  const templates = tab === "emails" ? await loadEmailTemplatesForEditor() : [];
  const users = tab === "users" ? await loadUsersOverview() : [];

  const maxWidth = tab === "emails" ? 1080 : tab === "users" ? 1000 : 760;

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
      <div style={{ maxWidth, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <Link href={base || "/"} style={backLinkStyle}>
            &larr; Board
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Super admin</h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0", maxWidth: 640 }}>
            Owner-only tools. Only you can see this page.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e4e4e7" }}>
          <Link href={`${base}/super-admin`} style={tabStyle(tab === "tools")}>
            Tools
          </Link>
          <Link href={`${base}/super-admin?tab=emails`} style={tabStyle(tab === "emails")}>
            Emails
          </Link>
          <Link href={`${base}/super-admin?tab=users`} style={tabStyle(tab === "users")}>
            Users
          </Link>
        </div>

        {tab === "tools" && (
          <section style={cardStyle}>
            <h3 style={sectionTitleStyle}>Invite someone to their own team</h3>
            <p style={sectionSubStyle}>
              Onboard an independent user: they get their own workspace as owner
              (not added to any of your teams) and can add and connect their own
              accounts after signing in.
            </p>
            <InviteOwnerForm />
          </section>
        )}

        {tab === "emails" && (
          <section style={cardStyle}>
            <h3 style={sectionTitleStyle}>Email designs</h3>
            <p style={sectionSubStyle}>
              Edit the subject and wording of the emails the site sends. Use the
              toolbar for bold, italics, underline and fonts. Changes take effect
              on the next email sent.
            </p>
            <EmailTemplatesEditor templates={templates} />
          </section>
        )}

        {tab === "users" && (
          <section style={cardStyle}>
            <h3 style={sectionTitleStyle}>All users</h3>
            <p style={sectionSubStyle}>
              Everyone using the product, with their teams, accounts and
              onboarding progress. Your board only shows your own teams — this is
              where you keep an eye on everyone. Click a row to expand.
            </p>
            <UsersOverview users={users} />
          </section>
        )}
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

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    color: active ? "#1e293b" : "#71717a",
    borderBottom: active ? "2px solid #1e293b" : "2px solid transparent",
    marginBottom: -1,
  };
}

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

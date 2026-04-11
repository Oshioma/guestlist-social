import type { Metadata } from "next";
import "./admin.css";
import AppShell from "./components/AppShell";

export const metadata: Metadata = {
  title: "Admin — Guestlist Social",
  description: "Guestlist Social ad ops admin dashboard",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-root">
      <AppShell>{children}</AppShell>
    </div>
  );
}

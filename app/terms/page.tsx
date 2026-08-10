import type { Metadata } from "next";
import LegalPage from "../_legal/LegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms & Conditions — Post Proofer" };

export default function TermsPage() {
  return <LegalPage pageKey="terms" />;
}

import type { Metadata } from "next";
import LegalPage from "../_legal/LegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy Policy — Post Proofer" };

export default function PrivacyPage() {
  return <LegalPage pageKey="privacy" />;
}

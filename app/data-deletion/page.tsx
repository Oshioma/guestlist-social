import type { Metadata } from "next";
import LegalPage from "../_legal/LegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data Deletion — Post Proofer" };

export default function DataDeletionPage() {
  return <LegalPage pageKey="data_deletion" />;
}

import { WizardProvider } from "./WizardContext";

export default function NewCampaignLayout({ children }: { children: React.ReactNode }) {
  return <WizardProvider>{children}</WizardProvider>;
}

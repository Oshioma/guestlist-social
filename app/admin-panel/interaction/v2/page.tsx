import InteractionEngineUI from "../InteractionEngineClient";
import { getInteractionDecisions } from "../actions";
import { getInstagramAccounts } from "../page";

export const dynamic = "force-dynamic";

// /app/interaction/v2 — experimental Discovery surfaces (keyword,
// location, hashtag, RapidAPI integration panel). Exactly the same
// Feed as the main page; only the Discovery tab changes via the
// experimentalDiscovery flag.

export default async function InteractionV2Page() {
  const { accounts, setupIssue } = await getInstagramAccounts();
  const firstId = accounts[0]?.id ?? "";
  const initialDecisions = firstId
    ? await getInteractionDecisions(firstId)
    : [];

  return (
    <InteractionEngineUI
      initialClients={accounts}
      initialDecisions={initialDecisions}
      setupIssue={setupIssue}
      experimentalDiscovery
    />
  );
}

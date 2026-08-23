"use client";

import { useEffect } from "react";

/**
 * Drops the locally-stored new-campaign draft for a client.
 *
 * The create form keeps a draft in localStorage so a refresh, a back
 * navigation or a submit that never confirms can't lose what was typed.
 * Nothing on the form itself can tell "the campaign was created" apart from
 * "the submit is taking forever and the operator navigated away", so the
 * draft is cleared from the other side instead: the campaign page renders
 * this when it was reached straight from a successful create.
 */
export default function ClearCampaignDraft({ clientId }: { clientId: string }) {
  useEffect(() => {
    try {
      window.localStorage.removeItem(`campaign-draft:${clientId}`);
    } catch {
      /* storage blocked — nothing to clean up */
    }
  }, [clientId]);

  return null;
}

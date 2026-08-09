"use server";

import { createClient } from "@/lib/supabase/server";
import { getProoferAccess } from "@/lib/auth/permissions";

// Remember the account (client) the user is viewing on the Proofer board so the
// next sign-in resumes on it — durably and across devices/domains, unlike the
// browser cookie. Best-effort: any failure (e.g. the prefs table not yet
// migrated) is swallowed so board navigation is never blocked.
export async function setLastProoferClientAction(clientId: string) {
  const trimmed = (clientId ?? "").trim();
  if (!trimmed) return;

  try {
    const access = await getProoferAccess();
    if (!access) return;

    const clientId = Number(trimmed);
    if (!Number.isFinite(clientId)) return;

    const supabase = await createClient();
    const { error } = await supabase.from("user_proofer_prefs").upsert(
      {
        user_id: access.userId,
        last_client_id: clientId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) console.error("setLastProoferClientAction upsert:", error.message);
  } catch (err) {
    console.error("setLastProoferClientAction error:", err);
  }
}

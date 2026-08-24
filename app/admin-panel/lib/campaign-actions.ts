"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { createMetaCampaign } from "../../../lib/meta-campaign-create";

export type CreateCampaignResult = {
  campaignId: string;
  /** Set when the campaign saved but its first ad did not. */
  adError: string | null;
};

/**
 * Creates the campaign (and its first ad, in the one-click flow) and returns
 * what it made. It deliberately does NOT redirect: while the server action
 * held the redirect, `pending` on the submit button covered the navigation AND
 * the render of the page being navigated to, so a slow next page was
 * indistinguishable from a create that never finished. The caller navigates,
 * so the button can stop saying "Creating…" the moment the campaign exists.
 */
export async function createCampaignAction(
  clientId: string,
  formData: FormData
): Promise<CreateCampaignResult> {
  // Step timings end up in the server logs. A create that feels stuck is
  // otherwise indistinguishable from one that never started.
  const startedAt = Date.now();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const objective = String(formData.get("objective") ?? "engagement").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const budget = Number(formData.get("budget") ?? 0);
  const status = String(formData.get("status") ?? "testing").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const placement = String(formData.get("placement") ?? "automatic").trim();

  if (!name) {
    throw new Error("Campaign name is required.");
  }

  // Try to create in Meta first. If Meta creds aren't configured we still
  // save locally — the campaign can be pushed to Meta later or picked up
  // on the next sync. If Meta returns an error we surface it to the
  // operator but don't block the local save.
  let metaCampaignId: string | null = null;
  let metaAdSetId: string | null = null;
  let metaError: string | null = null;

  const hasMetaCreds =
    !!process.env.META_ACCESS_TOKEN && !!process.env.META_AD_ACCOUNT_ID;

  // Save locally FIRST, redirect immediately.
  let insertedId: string;
  try {
    const { data: inserted, error } = await supabase
      .from("campaigns")
      .insert({
        client_id: clientId,
        name,
        objective,
        audience: audience || null,
        budget,
        status,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("createCampaignAction error:", error);
      // Surface what actually went wrong (RLS denial, missing column, expired
      // session, …). A bare "Could not create campaign." leaves the operator
      // with no way to tell a permissions problem from a typo.
      const detail = [error?.message, error?.code ? `(${error.code})` : null]
        .filter(Boolean)
        .join(" ");
      throw new Error(
        detail ? `Could not create campaign — ${detail}` : "Could not create campaign."
      );
    }
    insertedId = String(inserted.id);
  } catch (err) {
    if ((err as any)?.digest) throw err; // re-throw Next.js internal errors
    throw new Error(err instanceof Error ? err.message : "Could not create campaign.");
  }

  // Fire-and-forget: push to Meta in the background.
  if (hasMetaCreds && budget > 0) {
    // after() is the supported way to do work once the response is out. A
    // bare floating promise can hold the invocation open or be dropped
    // outright, depending on the runtime.
    after(() =>
      createMetaCampaign({
      name,
      objective,
      budgetPounds: budget,
      audience,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      placement: placement || undefined,
    })
      .then(async (result) => {
        if (result.ok) {
          // Service role: the request's session no longer exists out here.
          await createAdminClient()
            .from("campaigns")
            .update({
              meta_id: result.metaCampaignId,
              meta_adset_id: result.metaAdSetId,
              meta_status: status === "testing" || status === "paused" ? "PAUSED" : "ACTIVE",
              meta_ad_account_name: process.env.META_AD_ACCOUNT_ID,
            })
            .eq("id", insertedId);
        } else {
          console.error("Background Meta creation failed:", result.error);
        }
      })
        .catch((err) => {
          console.error("Background Meta creation exception:", err);
        })
    );
  }

  const afterInsertMs = Date.now() - startedAt;

  revalidatePath(`/admin-panel/clients/${clientId}`);

  // If ad fields were included, create the ad too (one-click flow)
  const adImageUrl = String(formData.get("adImageUrl") ?? "").trim();
  const adHeadline = String(formData.get("adHeadline") ?? "").trim();
  const adBody = String(formData.get("adBody") ?? "").trim();
  const adCtaType = String(formData.get("adCtaType") ?? "").trim();
  const adDestinationUrl = String(formData.get("adDestinationUrl") ?? "").trim();

  // The one-click flow creates the campaign AND its first ad. If the ad half
  // fails, the redirect used to carry on as if everything had worked: the
  // operator lands on a campaign that says "Add your first ad" with no idea
  // their copy went nowhere. Carry the reason to the page instead.
  let adFailure: string | null = null;

  if (adImageUrl || adHeadline || adBody) {
    try {
      // Save the ad with the image URL exactly as given. Copying the creative
      // into our own storage used to happen HERE, in front of the redirect:
      // fetch the source image (up to 10s) and then upload it to Supabase with
      // no deadline at all. That upload was the only unbounded wait between
      // clicking "Create campaign" and landing on the campaign — which is what
      // left the button sitting on "Creating…". The copy still happens, just
      // after the operator has been sent on their way.
      const { data: insertedAd, error: adError } = await supabase
        .from("ads")
        .insert({
          client_id: clientId,
          campaign_id: insertedId,
          name: `${name} — ad 1`,
          status: "testing",
          creative_image_url: adImageUrl || null,
          creative_headline: adHeadline || null,
          creative_body: adBody || null,
          creative_cta: adCtaType || "learn_more",
          creative_destination_url: adDestinationUrl || null,
        })
        .select("id")
        .single();

      if (adError) {
        console.error("Ad creation in one-click flow failed:", adError);
        adFailure = `${adError.message}${adError.code ? ` (${adError.code})` : ""}`;
      } else if (insertedAd && adImageUrl) {
        const adId = String(insertedAd.id);
        after(async () => {
          try {
            const { persistImageToStorage } = await import("@/lib/persist-image");
            const persisted = await persistImageToStorage(
              adImageUrl,
              `ad-creatives/${clientId}`
            );
            if (persisted && persisted !== adImageUrl) {
              // Service role: this runs after the response, where the request's
              // session is gone. Scoped to the single row just created.
              await createAdminClient()
                .from("ads")
                .update({ creative_image_url: persisted })
                .eq("id", adId);
            }
          } catch (err) {
            console.error("Background creative persistence failed:", err);
          }
        });
      }
    } catch (adErr) {
      console.error("Ad creation in one-click flow failed:", adErr);
      adFailure = adErr instanceof Error ? adErr.message : "Could not save the ad.";
    }
  }

  console.log(
    `createCampaignAction: campaign ${insertedId} — insert ${afterInsertMs}ms, total ${
      Date.now() - startedAt
    }ms, ad ${adFailure ? `FAILED: ${adFailure}` : "ok"}`
  );

  return { campaignId: insertedId, adError: adFailure };
}

export async function assignCampaignToClient(campaignId: string, clientId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("campaigns")
    .update({ client_id: clientId })
    .eq("id", campaignId);

  if (error) {
    console.error("assignCampaignToClient error:", error);
    throw new Error("Could not assign campaign.");
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath("/admin-panel/dashboard");
  revalidatePath("/admin-panel/settings");
}

export async function updateCampaignAction(
  clientId: string,
  campaignId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const objective = String(formData.get("objective") ?? "engagement").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const budget = Number(formData.get("budget") ?? 0);
  const status = String(formData.get("status") ?? "testing").trim();

  if (!name) {
    throw new Error("Campaign name is required.");
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      name,
      objective,
      audience: audience || null,
      budget,
      status,
    })
    .eq("id", campaignId)
    .eq("client_id", clientId);

  if (error) {
    console.error("updateCampaignAction error:", error);
    throw new Error("Could not update campaign.");
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath("/admin-panel/dashboard");
  redirect(`/app/clients/${clientId}`);
}

export async function deleteCampaignAction(campaignId: string, clientId: string) {
  await deleteCampaignCore(campaignId, clientId);
  redirect(`/app/clients/${clientId}`);
}

export async function deleteCampaignNoRedirect(campaignId: string, clientId: string) {
  await deleteCampaignCore(campaignId, clientId);
}

async function deleteCampaignCore(campaignId: string, clientId: string) {
  const supabase = await createClient();

  // Delete from Meta if campaign has a meta_id
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("meta_id")
    .eq("id", campaignId)
    .single();

  if (campaign?.meta_id) {
    try {
      const token = process.env.META_ACCESS_TOKEN;
      if (token) {
        await fetch(`https://graph.facebook.com/v25.0/${campaign.meta_id}`, {
          signal: AbortSignal.timeout(15_000),
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ access_token: token, status: "DELETED" }),
        });
      }
    } catch (metaDeleteErr) {
      console.error("deleteCampaign: Meta delete failed:", metaDeleteErr); /* Meta deletion is best-effort */ }
  }

  // Delete ads in this campaign first
  await supabase
    .from("ads")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("client_id", clientId);

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("client_id", clientId);

  if (error) {
    console.error("deleteCampaignAction error:", error);
    throw new Error("Could not delete campaign.");
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
}

// lib/meta-payload.ts
// Change these variables for your Meta account/app
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_GRAPH_API = "https://graph.facebook.com/v19.0";

// Helpers to convert frontend layman terms to Meta API fields
function genderCode(str: string) {
  switch ((str || "").toLowerCase()) {
    case "male": return [1];
    case "female": return [2];
    default: return [1, 2]; // "All"
  }
}
function ctaMeta(cta: string) {
  // Basic mapping, expand as needed
  switch ((cta || "").toUpperCase()) {
    case "LEARN MORE": return "LEARN_MORE";
    case "SIGN UP": return "SIGN_UP";
    case "SHOP NOW": return "SHOP_NOW";
    default: return "LEARN_MORE";
  }
}

export function resolvePayload(template: any, inputs: any) {
  // Campaign payload
  const campaignPayload = {
    name: inputs.campaign_name,
    objective: inputs.campaign_type || "LEAD_GENERATION",
    special_ad_categories: [],
    status: "PAUSED",
  };

  // Ad set payload (needs campaign_id after created)
  const adSetPayload = {
    name: `${inputs.campaign_name} Ad Set`,
    campaign_id: "", // filled after campaign creation
    daily_budget: Number(inputs.budget) * 100, // to cents
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    targeting: {
      geo_locations: {
        countries: [inputs.country || "NG"],
      },
      age_min: Number(inputs.age_min) || 18,
      age_max: Number(inputs.age_max) || 45,
      genders: genderCode(inputs.gender),
    },
    status: "PAUSED",
  };

  // Creative payload (needs Page ID, ad copy, url, etc)
  const creativePayload = {
    name: `${inputs.campaign_name} Creative`,
    object_story_spec: {
      page_id: inputs.page_id,
      link_data: {
        message: inputs.ad_copy,
        link: inputs.ad_url,
        name: inputs.headline,
        call_to_action: { type: ctaMeta(inputs.call2action) },
        // Uncomment if supporting images:
        // image_hash: inputs.image_hash,
      }
    }
  };

  // Ad payload
  const adPayload = {
    name: `${inputs.campaign_name} Ad`,
    adset_id: "",
    creative: { creative_id: "" },
    status: "PAUSED"
  };

  return { campaignPayload, adSetPayload, creativePayload, adPayload };
}

// --- Meta Graph API Calls ---
export async function createMetaCampaign(payload: any) {
  const url = `${META_GRAPH_API}/act_${META_AD_ACCOUNT_ID}/campaigns?access_token=${META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { data: await res.json(), ok: res.ok, status: res.status };
}
export async function createMetaAdSet(payload: any) {
  const url = `${META_GRAPH_API}/act_${META_AD_ACCOUNT_ID}/adsets?access_token=${META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { data: await res.json(), ok: res.ok, status: res.status };
}
export async function createMetaCreative(payload: any) {
  const url = `${META_GRAPH_API}/act_${META_AD_ACCOUNT_ID}/adcreatives?access_token=${META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { data: await res.json(), ok: res.ok, status: res.status };
}
export async function createMetaAd(payload: any) {
  const url = `${META_GRAPH_API}/act_${META_AD_ACCOUNT_ID}/ads?access_token=${META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { data: await res.json(), ok: res.ok, status: res.status };
}

// --- Orchestrator ---
export async function launchMetaFullChain(template: any, inputs: any) {
  const payloads = resolvePayload(template, inputs);

  // 1. Create Campaign
  const campaignRes = await createMetaCampaign(payloads.campaignPayload);
  if (!campaignRes.ok) throw new Error("Campaign creation failed: " + JSON.stringify(campaignRes.data));
  const campaign_id = campaignRes.data.id;

  // 2. Create Ad Set
  payloads.adSetPayload.campaign_id = campaign_id;
  const adSetRes = await createMetaAdSet(payloads.adSetPayload);
  if (!adSetRes.ok) throw new Error("Ad Set creation failed: " + JSON.stringify(adSetRes.data));
  const adset_id = adSetRes.data.id;

  // 3. Create Creative
  const creativeRes = await createMetaCreative(payloads.creativePayload);
  if (!creativeRes.ok) throw new Error("Creative creation failed: " + JSON.stringify(creativeRes.data));
  const creative_id = creativeRes.data.id;

  // 4. Create Ad
  payloads.adPayload.adset_id = adset_id;
  payloads.adPayload.creative.creative_id = creative_id;
  const adRes = await createMetaAd(payloads.adPayload);
  if (!adRes.ok) throw new Error("Ad creation failed: " + JSON.stringify(adRes.data));

  return {
    campaign_id,
    adset_id,
    creative_id,
    ad_id: adRes.data.id,
    meta_responses: {
      campaign: campaignRes.data,
      adset: adSetRes.data,
      creative: creativeRes.data,
      ad: adRes.data
    }
  };
}

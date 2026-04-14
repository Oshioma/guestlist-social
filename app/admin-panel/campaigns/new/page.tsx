"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Add or import your wizards below
// import FacebookAdWizard from ...;
// import SMSWizard from ...;
// import EmailWizard from ...;

export default function NewCampaignPage() {
  const router = useRouter();
  const params = useSearchParams();
  const type = params?.get("type");

  useEffect(() => {
    // Optionally, redirect immediately to wizard subpages
    if (type === "advertising") {
      // router.replace("/admin-panel/campaigns/new/advertising");
      // or render your Facebook Ad wizard directly here
    }
    // You can similarly handle "sms" and "email" if you have wizard pages ready
  }, [type]);

  if (!type) {
    return (
      <main className="max-w-xl mx-auto pt-8 px-4">
        <h1 className="text-2xl font-bold mb-4">Create Campaign</h1>
        <div>Select a campaign type from the dashboard first.</div>
      </main>
    );
  }

  // Render starters (placeholder for now)
  return (
    <main className="max-w-xl mx-auto pt-8 px-4">
      <h1 className="text-2xl font-bold mb-4">Create a {type.charAt(0).toUpperCase() + type.slice(1)} Campaign</h1>
      {type === "advertising" && (
        <div>
          {/* <FacebookAdWizard /> */}
          Facebook Ads Wizard will go here!
        </div>
      )}
      {type === "sms" && (
        <div>
          {/* <SMSWizard /> */}
          SMS Campaign Wizard will go here!
        </div>
      )}
      {type === "email" && (
        <div>
          {/* <EmailWizard /> */}
          Email Campaign Wizard will go here!
        </div>
      )}
    </main>
  );
}

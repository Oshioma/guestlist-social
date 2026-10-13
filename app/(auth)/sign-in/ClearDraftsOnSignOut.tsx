"use client";

import { useEffect } from "react";
import { clearAllDrafts } from "@/lib/draft-storage";

// Every sign-out path (the /sign-out route and the signOut action) redirects
// here, so wiping locally saved form drafts on this page means nothing typed
// by one person is restored for the next person on the same device.
export default function ClearDraftsOnSignOut() {
  useEffect(() => {
    clearAllDrafts();
  }, []);
  return null;
}

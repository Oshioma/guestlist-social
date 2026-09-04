import { NextResponse } from "next/server";
import { identifyMetaApps, runLiveProbes } from "@/lib/system-checks";
import { requireAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
// Probes several third-party APIs, each with its own 10s deadline.
export const maxDuration = 60;

export async function GET() {
  await requireAdmin();
  const [probes, metaApps] = await Promise.all([runLiveProbes(), identifyMetaApps()]);
  return NextResponse.json(
    { probes, metaApps, ranAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } }
  );
}

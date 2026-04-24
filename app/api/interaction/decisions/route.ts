import { NextRequest, NextResponse } from "next/server";
import { getInteractionDecisions } from "@/app/admin-panel/interaction/actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accountId = new URL(req.url).searchParams.get("accountId") ?? "";
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "accountId required" }, { status: 400 });
  }
  try {
    const decisions = await getInteractionDecisions(accountId);
    return NextResponse.json({ ok: true, decisions });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

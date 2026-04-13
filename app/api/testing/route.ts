import { NextRequest, NextResponse } from "next/server";

// This endpoint responds to GET requests at /api/testing
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true });
}

import { getAdAccount } from "@/lib/meta";

export async function GET() {
  try {
    const account = await getAdAccount();
    return Response.json(account);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

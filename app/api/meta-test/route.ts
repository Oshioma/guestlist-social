import { getAdAccount } from "@/lib/meta";

// Reaches an external service (Meta Graph read); the platform default is not a
// safe assumption for it.
export const maxDuration = 30;


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

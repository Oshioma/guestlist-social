import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
} from "../admin-panel/lib/queries";

const COOKIE_NAME = "proofer_last_client";

export function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Resolves everything the standalone top nav needs (client list, selected
// client/month, pillars and their posts) so every /proofer page can render the
// same nav consistently.
export async function resolveNavData(spClient?: string, spMonth?: string) {
  const month = spMonth ?? currentMonthValue();

  const cookieStore = await cookies();
  const lastClient = cookieStore.get(COOKIE_NAME)?.value ?? "";

  let clientId = spClient ?? "";
  if (!clientId && lastClient) clientId = lastClient;
  if (!clientId) {
    const { clients } = await getProoferData();
    clientId = clients[0]?.id ?? "";
  }

  const { clients, pillars } = await getProoferData(clientId, month);
  const posts = clientId ? await getProoferPillarPosts(clientId) : [];

  return { clientId, month, clients, pillars, posts };
}

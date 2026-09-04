import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The systems read-out now lives in one place: the super-admin System tab.
 * This route stays only so links and bookmarks to it land there rather than
 * on a 404.
 */
export default function SystemsMoved() {
  redirect("/proofer/super-admin?tab=system");
}

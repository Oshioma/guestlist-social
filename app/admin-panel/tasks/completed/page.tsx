import { getCompletedTasksReportData } from "../../lib/queries";
import CompletedReport from "./CompletedReport";
import EmptyState from "../../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function CompletedTasksPage() {
  try {
    const { completions, currentUserEmail } = await getCompletedTasksReportData();
    return (
      <CompletedReport
        completions={completions}
        currentUserEmail={currentUserEmail}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <EmptyState title="Unable to load completed tasks" description={message} />
    );
  }
}

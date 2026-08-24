import { getTasksOverviewData } from "../../lib/queries";
import TasksOverview from "./TasksOverview";
import EmptyState from "../../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function TasksOverviewPage() {
  try {
    const { tasks, currentUserEmail } = await getTasksOverviewData();
    return (
      <TasksOverview initialTasks={tasks} currentUserEmail={currentUserEmail} />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <EmptyState title="Unable to load tasks overview" description={message} />
    );
  }
}

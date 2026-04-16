import { getTasksData } from "../lib/queries";
import TasksBoard from "./TasksBoard";
import EmptyState from "../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  try {
    const {
      tasks,
      currentUserEmail,
      currentUserRole,
      knownUsers,
      notifications,
    } = await getTasksData({
      includeSubtasks: true,
      includeComments: true,
      includeActivity: true,
      includeNotifications: true,
    });

    return (
      <TasksBoard
        initialTasks={tasks}
        currentUserEmail={currentUserEmail}
        currentUserRole={currentUserRole}
        knownUsers={knownUsers}
        initialNotifications={notifications}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return <EmptyState title="Unable to load tasks" description={message} />;
  }
}

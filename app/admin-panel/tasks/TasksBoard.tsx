"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import SectionCard from "../components/SectionCard";
import type {
  Task,
  TaskCategory,
  TaskStatus,
  TaskRecurrence,
  SavedView,
  TaskFilters,
  ViewMode,
  LocalSubtask,
  LocalComment,
  ActivityEntry,
} from "../lib/tasks/types";
import {
  CATEGORIES,
  STATUS_COLUMNS,
  STATUS_OPTIONS,
  RECURRENCE_OPTIONS,
  KEYBOARD_SHORTCUTS,
} from "../lib/tasks/config";
import {
  addTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "../lib/tasks/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function normalizeDueDate(due: string): string {
  return due ? due.slice(0,10) : "";
}

function isOverdue(dueDate: string, status: TaskStatus) {
  if (!dueDate || status === "completed") return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  return d < today;
}

function formatDate(dueDate: string) {
  if (!dueDate) return "No due date";
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
}

function recurrenceSummary(recurrence: TaskRecurrence, dueDate: string) {
  if (recurrence === "none") return "";
  if (!dueDate) return recurrence === "weekly" ? "Repeats weekly" : "Repeats monthly";
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return recurrence === "weekly" ? "Repeats weekly" : "Repeats monthly";
  if (recurrence === "weekly") return `Every ${WEEKDAY_NAMES[d.getDay()]}`;
  return `Monthly on day ${d.getDate()}`;
}

function categoryMeta(value: string) {
  return (
    CATEGORIES.find((c) => c.value === value) ?? {
      value: "general" as TaskCategory,
      label: "General",
      color: "#71717a",
    }
  );
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const primaryButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#18181b",
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryButton: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#fff",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostButton: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 7,
  background: "transparent",
  color: "#71717a",
  border: "1px solid transparent",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const SAVED_VIEWS_KEY = "tasksboard_saved_views_v1";
const VIEW_MODE_KEY   = "tasksboard_view_mode_v1";

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TasksBoard({
  initialTasks,
  currentUserEmail,
  knownUsers,
}: {
  initialTasks: Task[];
  currentUserEmail: string;
  knownUsers: string[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isPending, startTransition] = useTransition();

  // Sync with server revalidation
  const prevRef = useRef(initialTasks);
  useEffect(() => {
    if (prevRef.current !== initialTasks) {
      prevRef.current = initialTasks;
      setTasks(initialTasks);
    }
  }, [initialTasks]);

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "kanban";
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? "kanban";
  });
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<TaskFilters>({
    category: "all", assignee: "all", search: "", showCompleted: true,
  });

  // ── Saved views (localStorage) ─────────────────────────────────────────────
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  function saveCurrentView() {
    const name = prompt("Name this view:");
    if (!name?.trim()) return;
    setSavedViews((prev) => [...prev, { id: uid(), name: name.trim(), filters, viewMode }]);
  }
  function loadView(v: SavedView) { setFilters(v.filters); setViewMode(v.viewMode); }
  function deleteSavedView(id: string) { setSavedViews((prev) => prev.filter((v) => v.id !== id)); }

  // ── Selected task (detail panel) ───────────────────────────────────────────
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview"|"subtasks"|"comments"|"activity">("overview");
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  // ── Bulk selection ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelected() { setSelectedIds(new Set()); }

  function bulkSetStatus(status: TaskStatus) {
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      try {
        await Promise.all(ids.map((id) => updateTaskStatusAction(id, status)));
        setTasks((prev) => prev.map((t) => selectedIds.has(t.id) ? { ...t, status } : t));
        clearSelected();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} task(s)?`)) return;
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      try {
        await Promise.all(ids.map((id) => deleteTaskAction(id)));
        setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
        clearSelected();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete tasks");
      }
    });
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(new Set());

  const notifications = useMemo(
    () =>
      tasks
        .filter((t) => isOverdue(t.dueDate, t.status))
        .map((t) => ({ id: `overdue-${t.id}`, taskId: t.id, taskTitle: t.title, message: `Overdue since ${formatDate(t.dueDate)}` })),
    [tasks]
  );
  const unreadCount = notifications.filter((n) => !readNotifIds.has(n.id)).length;
  function markAllRead() { setReadNotifIds(new Set(notifications.map((n) => n.id))); }

  // ── Local subtasks / comments / activity ───────────────────────────────────
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, LocalSubtask[]>>({});
  const [commentsByTask, setCommentsByTask] = useState<Record<string, LocalComment[]>>({});
  const [activityByTask, setActivityByTask] = useState<Record<string, ActivityEntry[]>>({});
  const [newSubtaskInput, setNewSubtaskInput] = useState("");
  const [newCommentInput, setNewCommentInput] = useState("");

  function addSubtask(taskId: string, title: string) {
    if (!title.trim()) return;
    setSubtasksByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId]??[]), { id: uid(), title: title.trim(), done: false }] }));
  }
  function toggleSubtask(taskId: string, subtaskId: string) {
    setSubtasksByTask((prev) => ({ ...prev, [taskId]: (prev[taskId]??[]).map((s) => s.id === subtaskId ? { ...s, done: !s.done } : s) }));
  }
  function deleteSubtask(taskId: string, subtaskId: string) {
    setSubtasksByTask((prev) => ({ ...prev, [taskId]: (prev[taskId]??[]).filter((s) => s.id !== subtaskId) }));
  }
  function logActivity(taskId: string, type: ActivityEntry["type"], description: string) {
    const entry: ActivityEntry = { id: uid(), type, description, at: new Date().toISOString() };
    setActivityByTask((prev) => ({ ...prev, [taskId]: [entry, ...(prev[taskId]??[])] }));
  }
  function addComment(taskId: string, text: string) {
    if (!text.trim()) return;
    const entry: LocalComment = { id: uid(), author: currentUserEmail||"You", text: text.trim(), createdAt: new Date().toISOString() };
    setCommentsByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId]??[]), entry] }));
    logActivity(taskId, "edit", "Comment added");
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const draggingIdRef = useRef<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  function onDragStart(taskId: string) { draggingIdRef.current = taskId; }
  function onDragOver(e: React.DragEvent<HTMLDivElement>, status: TaskStatus) { e.preventDefault(); setDragOverStatus(status); }
  function onDragLeave() { setDragOverStatus(null); }
  function onDrop(e: React.DragEvent<HTMLDivElement>, targetStatus: TaskStatus) {
    e.preventDefault();
    setDragOverStatus(null);
    const taskId = draggingIdRef.current;
    draggingIdRef.current = null;
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: targetStatus } : t));
    logActivity(taskId, "status_change", `Status: ${task.status} \u2192 ${targetStatus}`);
    startTransition(async () => {
      try {
        await updateTaskStatusAction(taskId, targetStatus);
      } catch (err) {
        setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: task.status } : t));
        alert(err instanceof Error ? err.message : "Could not update task status");
      }
    });
  }

  // ── Filtered tasks ─────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!filters.showCompleted && t.status === "completed") return false;
      if (filters.category !== "all" && t.category !== filters.category) return false;
      if (filters.assignee !== "all" && t.assignee !== filters.assignee) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filters]);

  // ── Week browser ───────────────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const weekDays = useMemo(() => {
    const baseMonday = getMonday(new Date());
    baseMonday.setDate(baseMonday.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      return { key: toDateKey(d), short: WEEKDAY_SHORT[i], dayNum: d.getDate(), monthShort: d.toLocaleDateString(undefined,{month:"short"}), date: d };
    });
  }, [weekOffset]);

  const weekRangeLabel = useMemo(() => {
    const first = weekDays[0].date;
    const last  = weekDays[6].date;
    const sameMonth = first.getMonth() === last.getMonth();
    const firstStr = first.toLocaleDateString(undefined,{month:"short",day:"numeric"});
    const lastStr  = last.toLocaleDateString(undefined,{month:sameMonth?undefined:"short",day:"numeric",year:"numeric"});
    return `${firstStr} \u2013 ${lastStr}`;
  }, [weekDays]);

  const dueCountByDate = useMemo(() => {
    const map = new Map<string,number>();
    tasks.forEach((t) => { const key=normalizeDueDate(t.dueDate); if(key) map.set(key,(map.get(key)??0)+1); });
    return map;
  }, [tasks]);

  function filterByDate(list: Task[]) {
    if (!selectedDate) return list;
    return list.filter((t) => normalizeDueDate(t.dueDate) === selectedDate);
  }

  const myTasks = useMemo(
    () => filteredTasks.filter((t) => t.assignee === currentUserEmail && t.status !== "completed"),
    [filteredTasks, currentUserEmail]
  );
  const teamTasksByAssignee = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status !== "completed" && t.assignee && t.assignee !== currentUserEmail);
    const groups = new Map<string,Task[]>();
    open.forEach((t) => { const list=groups.get(t.assignee)??[]; list.push(t); groups.set(t.assignee,list); });
    return Array.from(groups.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  }, [filteredTasks, currentUserEmail]);

  const myTasksByCategory = useMemo(() => {
    const g: Record<string,Task[]>={};
    CATEGORIES.forEach((c)=>{ g[c.value]=filterByDate(myTasks).filter((t)=>t.category===c.value); });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTasks, selectedDate]);

  const allTasksByCategory = useMemo(() => {
    const g: Record<string,Task[]>={};
    CATEGORIES.forEach((c)=>{ g[c.value]=filterByDate(filteredTasks).filter((t)=>t.category===c.value); });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, selectedDate]);

  // ── New task form ──────────────────────────────────────────────────────────
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTitle,      setNewTitle]      = useState("");
  const [newDesc,       setNewDesc]       = useState("");
  const [newCat,        setNewCat]        = useState<TaskCategory>("general");
  const [newAssignee,   setNewAssignee]   = useState(currentUserEmail||"");
  const [newDueDate,    setNewDueDate]    = useState("");
  const [newRecurrence, setNewRecurrence] = useState<TaskRecurrence>("none");

  useEffect(() => {
    if (selectedDate && showNewTaskForm) setNewDueDate(selectedDate);
  }, [selectedDate, showNewTaskForm]);

  function handleAdd() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      try {
        await addTaskAction(newTitle.trim(), newDesc.trim(), newCat, newAssignee.trim(), newDueDate, newRecurrence);
        setTasks((prev) => [
          { id: uid(), title: newTitle.trim(), description: newDesc.trim(), category: newCat, assignee: newAssignee.trim(), createdBy: currentUserEmail, dueDate: newDueDate, status: "open", recurrence: newRecurrence, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          ...prev,
        ]);
        setNewTitle(""); setNewDesc(""); setNewDueDate(""); setNewRecurrence("none");
        setShowNewTaskForm(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add task");
      }
    });
  }

  // ── Edit task ──────────────────────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState<{
    title: string; description: string; category: TaskCategory;
    assignee: string; dueDate: string; recurrence: TaskRecurrence;
  } | null>(null);

  function startEditSelected() {
    if (!selectedTask) return;
    setEditDraft({ title: selectedTask.title, description: selectedTask.description, category: selectedTask.category, assignee: selectedTask.assignee, dueDate: selectedTask.dueDate?selectedTask.dueDate.slice(0,10):"", recurrence: selectedTask.recurrence??"none" });
  }
  function cancelEdit() { setEditDraft(null); }
  function saveEdit() {
    if (!selectedTask || !editDraft) return;
    const d = editDraft;
    startTransition(async () => {
      try {
        await updateTaskAction(selectedTask.id, d.title, d.description, d.category, d.assignee, d.dueDate, d.recurrence);
        setTasks((prev) => prev.map((t) => t.id===selectedTask.id ? { ...t, ...d, updatedAt: new Date().toISOString() } : t));
        logActivity(selectedTask.id, "edit", "Task details updated");
        setEditDraft(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update task");
      }
    });
  }

  function handleStatusChange(task: Task, newStatus: TaskStatus) {
    const prev = task.status;
    setTasks((all) => all.map((t) => t.id===task.id ? { ...t, status: newStatus } : t));
    logActivity(task.id, "status_change", `Status \u2192 ${STATUS_OPTIONS.find((s)=>s.value===newStatus)?.label??newStatus}`);
    startTransition(async () => {
      try {
        await updateTaskStatusAction(task.id, newStatus);
      } catch (err) {
        setTasks((all) => all.map((t) => t.id===task.id ? { ...t, status: prev } : t));
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function handleDelete(task: Task) {
    if (!confirm(`Delete "${task.title}"?`)) return;
    startTransition(async () => {
      try {
        await deleteTaskAction(task.id);
        setTasks((prev) => prev.filter((t) => t.id!==task.id));
        if (selectedTaskId===task.id) setSelectedTaskId(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const editing = tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
      if (e.key === "Escape") {
        if (showShortcuts)     { setShowShortcuts(false); return; }
        if (showNewTaskForm)   { setShowNewTaskForm(false); return; }
        if (editDraft)         { setEditDraft(null); return; }
        if (selectedTaskId)    { setSelectedTaskId(null); return; }
        if (showNotifications) { setShowNotifications(false); return; }
      }
      if (editing) return;
      if (e.key === "?") setShowShortcuts((v) => !v);
      else if (e.key === "n") setShowNewTaskForm(true);
      else if (e.key === "k") setViewMode("kanban");
      else if (e.key === "l") setViewMode("list");
      else if (e.key==="Delete" && selectedIds.size>0) bulkDelete();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShortcuts, showNewTaskForm, editDraft, selectedTaskId, showNotifications, selectedIds]);

  const assigneeOptions = useMemo(
    () => Array.from(new Set([currentUserEmail,...knownUsers].filter(Boolean))),
    [currentUserEmail, knownUsers]
  );

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderKanbanCard(task: Task) {
    const meta    = categoryMeta(task.category);
    const overdue = isOverdue(task.dueDate, task.status);
    const checked = selectedIds.has(task.id);
    const isOpen  = selectedTaskId === task.id;
    return (
      <div
        key={task.id}
        draggable
        onDragStart={() => onDragStart(task.id)}
        style={{ border: isOpen?"1.5px solid #18181b":checked?"1.5px solid #3b82f6":"1px solid #e4e4e7", borderRadius:10, background:"#fff", padding:"10px 12px", cursor:"grab", display:"flex", flexDirection:"column", gap:6, opacity:isPending?0.7:1, boxShadow:isOpen?"0 0 0 3px rgba(24,24,27,0.06)":"none", userSelect:"none" }}
      >
        <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
          <input type="checkbox" checked={checked} onChange={() => toggleSelect(task.id)} onClick={(e) => e.stopPropagation()} style={{ marginTop:2, flexShrink:0, cursor:"pointer" }} aria-label={"Select " + task.title} />
          <button type="button" onClick={() => { setSelectedTaskId(isOpen?null:task.id); setDetailTab("overview"); setEditDraft(null); setNewSubtaskInput(""); setNewCommentInput(""); }} style={{ background:"transparent", border:"none", padding:0, cursor:"pointer", textAlign:"left", font:"inherit", color:"#18181b", fontSize:13, fontWeight:600, flex:1, lineHeight:1.35, textDecoration:task.status==="completed"?"line-through":"none", opacity:task.status==="completed"?0.6:1 }}>
            {task.title}
          </button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"1px 7px", borderRadius:999, background:`${meta.color}18`, color:meta.color, border:`1px solid ${meta.color}40`, fontSize:11, fontWeight:600 }}>
            <span style={{ width:6, height:6, borderRadius:999, background:meta.color, display:"inline-block" }} />{meta.label}
          </span>
          {overdue && <span style={{ padding:"1px 7px", borderRadius:999, background:"#fee2e2", color:"#991b1b", border:"1px solid #fecaca", fontSize:11, fontWeight:600 }}>Overdue</span>}
          {task.recurrence && task.recurrence!=="none" && <span style={{ padding:"1px 7px", borderRadius:999, background:"#ede9fe", color:"#5b21b6", border:"1px solid #ddd6fe", fontSize:11, fontWeight:600 }} title={recurrenceSummary(task.recurrence, task.dueDate)}>{"\u21bb"}</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginTop:2 }}>
          <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:20, height:20, borderRadius:999, background:"#18181b", color:"#fff", fontSize:9, fontWeight:700, textTransform:"uppercase", flexShrink:0 }} title={task.assignee||"Unassigned"}>
            {task.assignee ? task.assignee.slice(0,2) : "\u2014"}
          </span>
          <span style={{ fontSize:11, color:overdue?"#991b1b":"#71717a", fontWeight:overdue?600:400 }}>{formatDate(task.dueDate)}</span>
        </div>
      </div>
    );
  }

  function renderDetailPanel() {
    if (!selectedTask) return null;
    const meta     = categoryMeta(selectedTask.category);
    const overdue  = isOverdue(selectedTask.dueDate, selectedTask.status);
    const subtasks = subtasksByTask[selectedTask.id] ?? [];
    const comments = commentsByTask[selectedTask.id] ?? [];
    const activity = activityByTask[selectedTask.id] ?? [];
    return (
      <div style={{ position:"fixed", top:0, right:0, bottom:0, width:420, background:"#fff", borderLeft:"1px solid #e4e4e7", boxShadow:"-4px 0 20px rgba(0,0,0,0.08)", display:"flex", flexDirection:"column", zIndex:200 }}>
        {/* Panel header */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #e4e4e7", display:"flex", alignItems:"center", gap:10, background:"#fafafa", flexShrink:0 }}>
          <span style={{ display:"inline-block", width:8, height:8, borderRadius:999, background:meta.color, flexShrink:0 }} />
          <span style={{ fontSize:13, fontWeight:700, color:"#18181b", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedTask.title}</span>
          <button type="button" onClick={() => { setSelectedTaskId(null); setEditDraft(null); }} style={{ ...ghostButton, color:"#71717a", fontSize:18, lineHeight:1, padding:"2px 8px" }} aria-label="Close panel">{"\xd7"}</button>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #e4e4e7", padding:"0 20px", flexShrink:0 }}>
          {([
            { key:"overview"  as const, label:"Overview" },
            { key:"subtasks"  as const, label:subtasks.length?`Subtasks (${subtasks.length})`:"Subtasks" },
            { key:"comments"  as const, label:comments.length?`Comments (${comments.length})`:"Comments" },
            { key:"activity"  as const, label:"Activity" },
          ]).map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setDetailTab(key)} style={{ padding:"10px 14px", fontSize:12, fontWeight:600, cursor:"pointer", background:"transparent", border:"none", borderBottom:detailTab===key?"2px solid #18181b":"2px solid transparent", color:detailTab===key?"#18181b":"#71717a", fontFamily:"inherit", marginBottom:-1 }}>
              {label}
            </button>
          ))}
        </div>
        {/* Tab content */}
        <div style={{ flex:1, padding:"16px 20px", overflowY:"auto" }}>
          {detailTab === "overview" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {editDraft ? (
                <>
                  <input type="text" value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title:e.target.value })} style={inputStyle} placeholder="Title" />
                  <textarea value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description:e.target.value })} style={{ ...inputStyle, minHeight:70, resize:"vertical" }} placeholder="Description" />
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <select value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category:e.target.value as TaskCategory })} style={inputStyle}>{CATEGORIES.map((c)=><option key={c.value} value={c.value}>{c.label}</option>)}</select>
                    <select value={editDraft.assignee} onChange={(e) => setEditDraft({ ...editDraft, assignee:e.target.value })} style={inputStyle}><option value="">Unassigned</option>{assigneeOptions.map((u)=><option key={u} value={u}>{u}</option>)}</select>
                    <input type="date" value={editDraft.dueDate} onChange={(e) => setEditDraft({ ...editDraft, dueDate:e.target.value })} style={inputStyle} />
                    <select value={editDraft.recurrence} onChange={(e) => setEditDraft({ ...editDraft, recurrence:e.target.value as TaskRecurrence })} style={inputStyle}>{RECURRENCE_OPTIONS.map((r)=><option key={r.value} value={r.value}>{r.label}</option>)}</select>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button type="button" onClick={saveEdit} disabled={isPending} style={{ ...primaryButton, fontSize:12, padding:"7px 12px" }}>Save</button>
                    <button type="button" onClick={cancelEdit} style={{ ...secondaryButton, fontSize:12, padding:"7px 12px" }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:"#71717a", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Status</div>
                    <select value={selectedTask.status} onChange={(e) => handleStatusChange(selectedTask, e.target.value as TaskStatus)} disabled={isPending} style={{ ...inputStyle, width:"auto" }}>
                      {STATUS_OPTIONS.map((s)=><option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  {selectedTask.description && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:"#71717a", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Description</div>
                      <p style={{ margin:0, fontSize:13, color:"#3f3f46", whiteSpace:"pre-wrap", lineHeight:1.5 }}>{selectedTask.description}</p>
                    </div>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {[
                      { label:"Category",   value:meta.label,                                                                                                    color:meta.color },
                      { label:"Assignee",   value:selectedTask.assignee||"Unassigned",                                                                          color:null },
                      { label:"Due",        value:formatDate(selectedTask.dueDate),                                                                              color:overdue?"#991b1b":null },
                      { label:"Repeats",    value:selectedTask.recurrence==="none"?"One-off":recurrenceSummary(selectedTask.recurrence,selectedTask.dueDate),    color:null },
                      { label:"Created by", value:selectedTask.createdBy||"\u2014",                                                                              color:null },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ fontSize:10, fontWeight:600, color:"#a1a1aa", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{label}</div>
                        <div style={{ fontSize:12, color:color??"#18181b", fontWeight:500 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button type="button" onClick={startEditSelected} style={{ ...secondaryButton, fontSize:12, padding:"7px 12px" }}>Edit</button>
                    <button type="button" onClick={() => handleDelete(selectedTask)} disabled={isPending} style={{ ...secondaryButton, fontSize:12, padding:"7px 12px", color:"#b91c1c", borderColor:"#fecaca" }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          )}
          {detailTab === "subtasks" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#71717a", marginBottom:2 }}>
                {subtasks.length===0 ? "No subtasks yet" : `${subtasks.filter((s)=>s.done).length} / ${subtasks.length} done`}
              </div>
              {subtasks.map((s) => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <input type="checkbox" checked={s.done} onChange={() => toggleSubtask(selectedTask.id, s.id)} style={{ cursor:"pointer" }} />
                  <span style={{ fontSize:13, color:s.done?"#a1a1aa":"#18181b", textDecoration:s.done?"line-through":"none", flex:1 }}>{s.title}</span>
                  <button type="button" onClick={() => deleteSubtask(selectedTask.id, s.id)} style={{ ...ghostButton, color:"#a1a1aa", padding:"2px 6px", fontSize:14 }}>{"\xd7"}</button>
                </div>
              ))}
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <input type="text" value={newSubtaskInput} onChange={(e) => setNewSubtaskInput(e.target.value)} onKeyDown={(e) => { if(e.key==="Enter"){ addSubtask(selectedTask.id,newSubtaskInput); setNewSubtaskInput(""); } }} placeholder="Add a subtask..." style={{ ...inputStyle, flex:1 }} />
                <button type="button" onClick={() => { addSubtask(selectedTask.id,newSubtaskInput); setNewSubtaskInput(""); }} style={{ ...secondaryButton, padding:"7px 12px", flexShrink:0 }}>Add</button>
              </div>
            </div>
          )}
          {detailTab === "comments" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {comments.length===0 && <div style={{ fontSize:13, color:"#a1a1aa" }}>No comments yet. Start the conversation.</div>}
              {comments.map((c) => (
                <div key={c.id} style={{ borderRadius:8, border:"1px solid #e4e4e7", padding:"10px 12px", background:"#fafafa" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"#18181b" }}>{c.author}</span>
                    <span style={{ fontSize:11, color:"#a1a1aa" }}>{new Date(c.createdAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                  <p style={{ margin:0, fontSize:13, color:"#3f3f46", lineHeight:1.5 }}>{c.text}</p>
                </div>
              ))}
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <textarea value={newCommentInput} onChange={(e) => setNewCommentInput(e.target.value)} placeholder="Write a comment..." style={{ ...inputStyle, minHeight:70, resize:"vertical" }} />
                <button type="button" onClick={() => { addComment(selectedTask.id,newCommentInput); setNewCommentInput(""); }} disabled={!newCommentInput.trim()} style={{ ...primaryButton, fontSize:12, padding:"7px 12px", alignSelf:"flex-start", opacity:!newCommentInput.trim()?0.5:1 }}>
                  Post comment
                </button>
              </div>
            </div>
          )}
          {detailTab === "activity" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {activity.length===0
                ? <div style={{ fontSize:13, color:"#a1a1aa" }}>No activity recorded yet.</div>
                : activity.map((a) => (
                    <div key={a.id} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                      <span style={{ width:6, height:6, borderRadius:999, background:a.type==="status_change"?"#3b82f6":a.type==="edit"?"#eab308":"#22c55e", flexShrink:0, marginTop:5 }} />
                      <div>
                        <div style={{ fontSize:12, color:"#18181b" }}>{a.description}</div>
                        <div style={{ fontSize:11, color:"#a1a1aa" }}>{new Date(a.at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderKanbanView() {
    return (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, minmax(240px, 1fr))", gap:16, alignItems:"start" }}>
        {STATUS_COLUMNS.map((col) => {
          const colTasks     = filteredTasks.filter((t) => t.status===col.value);
          const isDragTarget = dragOverStatus===col.value;
          return (
            <div key={col.value} onDragOver={(e) => onDragOver(e,col.value)} onDragLeave={onDragLeave} onDrop={(e) => onDrop(e,col.value)} style={{ borderRadius:12, background:isDragTarget?"#f0f9ff":col.headerBg, border:isDragTarget?"2px dashed #3b82f6":"1px solid #e4e4e7", padding:12, minHeight:120 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ padding:"2px 10px", borderRadius:999, background:col.pillBg, color:col.pillColor, border:`1px solid ${col.pillBorder}`, fontSize:12, fontWeight:700 }}>{col.label}</span>
                <span style={{ fontSize:12, color:"#a1a1aa", fontWeight:500 }}>{colTasks.length}</span>
                <div style={{ flex:1 }} />
                {col.value==="open" && <button type="button" onClick={() => setShowNewTaskForm(true)} title="Add task (n)" style={{ ...ghostButton, fontSize:20, lineHeight:1, padding:"0 6px", color:"#a1a1aa" }}>+</button>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {colTasks.length===0
                  ? <div style={{ fontSize:12, color:"#a1a1aa", padding:"16px 0", textAlign:"center" }}>{isDragTarget?"Drop here":"No tasks"}</div>
                  : colTasks.map((t) => renderKanbanCard(t))
                }
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderListTaskRow(task: Task, allowReassign = true) {
    const meta    = categoryMeta(task.category);
    const overdue = isOverdue(task.dueDate, task.status);
    const checked = selectedIds.has(task.id);
    const isOpen  = selectedTaskId===task.id;
    const pillBg     = task.status==="completed"?"#dcfce7":task.status==="in_progress"?"#dbeafe":"#f4f4f5";
    const pillColor  = task.status==="completed"?"#166534":task.status==="in_progress"?"#1e40af":"#52525b";
    const pillBorder = task.status==="completed"?"#86efac":task.status==="in_progress"?"#93c5fd":"#e4e4e7";
    return (
      <div key={task.id} style={{ border:isOpen?"1.5px solid #18181b":"1px solid #e4e4e7", borderRadius:12, background:"#fff", display:"flex", flexDirection:"column" }}>
        <button type="button" onClick={() => { setSelectedTaskId(isOpen?null:task.id); setDetailTab("overview"); setEditDraft(null); setNewSubtaskInput(""); setNewCommentInput(""); }} style={{ appearance:"none", WebkitAppearance:"none", background:"transparent", border:"none", padding:"10px 12px", textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:10, width:"100%", font:"inherit", color:"inherit" }}>
          <input type="checkbox" checked={checked} onChange={() => toggleSelect(task.id)} onClick={(e) => e.stopPropagation()} style={{ cursor:"pointer", flexShrink:0 }} />
          <span style={{ display:"inline-block", width:8, height:8, borderRadius:999, background:meta.color, flexShrink:0 }} />
          <span style={{ fontSize:14, fontWeight:600, color:"#18181b", textDecoration:task.status==="completed"?"line-through":"none", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.title}</span>
          <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:999, background:pillBg, color:pillColor, border:`1px solid ${pillBorder}`, fontSize:11, fontWeight:600, flexShrink:0 }}>{STATUS_OPTIONS.find((s)=>s.value===task.status)?.label??task.status}</span>
          {overdue && <span style={{ padding:"2px 8px", borderRadius:999, background:"#fee2e2", color:"#991b1b", border:"1px solid #fecaca", fontSize:11, fontWeight:600, flexShrink:0 }}>Overdue</span>}
          <span style={{ fontSize:12, color:"#71717a", flexShrink:0 }}>{formatDate(task.dueDate)}</span>
        </button>
        {isOpen && (
          <div style={{ padding:"0 12px 12px 44px", display:"flex", flexDirection:"column", gap:8 }}>
            {task.description && <div style={{ fontSize:13, color:"#52525b", whiteSpace:"pre-wrap" }}>{task.description}</div>}
            <div style={{ fontSize:12, color:"#71717a", display:"flex", flexWrap:"wrap", gap:10 }}>
              <span>Assignee: {task.assignee||"Unassigned"}</span>
              {task.createdBy && <><span>{"\xb7"}</span><span>From: {task.createdBy}</span></>}
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)} disabled={isPending} style={{ ...inputStyle, width:"auto", padding:"6px 8px", fontSize:12 }}>
                {STATUS_OPTIONS.map((s)=><option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {allowReassign && <button type="button" onClick={(e)=>{e.stopPropagation();setSelectedTaskId(task.id);setDetailTab("overview");}} disabled={isPending} style={secondaryButton}>Open details</button>}
              <button type="button" onClick={(e)=>{e.stopPropagation();handleDelete(task);}} disabled={isPending} style={{ ...secondaryButton, color:"#b91c1c", borderColor:"#fecaca" }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderListView() {
    const wBtn: React.CSSProperties = { padding:"6px 10px", borderRadius:8, background:"#fff", color:"#52525b", border:"1px solid #e4e4e7", fontSize:12, fontWeight:600, cursor:"pointer", minWidth:32, fontFamily:"inherit" };
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
        <SectionCard title="Week" action={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button type="button" onClick={() => setWeekOffset((w)=>w-1)} style={wBtn} aria-label="Previous week">{"\u2190"}</button>
            <span style={{ fontSize:12, fontWeight:600, color:"#52525b", minWidth:140, textAlign:"center" }}>{weekRangeLabel}</span>
            <button type="button" onClick={() => setWeekOffset((w)=>w+1)} style={wBtn} aria-label="Next week">{"\u2192"}</button>
            <button type="button" onClick={() => { setWeekOffset(0); setSelectedDate(null); }} style={{ ...wBtn, color:"#18181b", borderColor:"#d4d4d8" }}>Today</button>
            {selectedDate && <button type="button" onClick={() => setSelectedDate(null)} style={{ ...wBtn, background:"#18181b", color:"#fff", borderColor:"#18181b" }}>Clear</button>}
          </div>
        }>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0, fontSize:14 }}>
              <thead><tr>{weekDays.map((d) => {
                const isSel = selectedDate===d.key;
                const isToday = d.key===todayKey;
                return <th key={d.key} style={{ textAlign:"left", padding:"12px 16px", fontWeight:600, fontSize:13, color:isSel?"#18181b":"#71717a", borderBottom:isSel?"2px solid #18181b":"2px solid #e4e4e7", whiteSpace:"nowrap", minWidth:120, background:isToday?"#fafafa":"#fff" }}>{d.short} {d.dayNum} {d.monthShort}</th>;
              })}</tr></thead>
              <tbody><tr>{weekDays.map((d) => {
                const count = dueCountByDate.get(d.key)??0;
                const isSel = selectedDate===d.key;
                const colors = count===0?{bg:"#f3f4f6",text:"#9ca3af"}:isSel?{bg:"#18181b",text:"#fff"}:{bg:"#dbeafe",text:"#1e40af"};
                return (
                  <td key={d.key} style={{ padding:"10px 16px", borderBottom:"1px solid #f4f4f5" }}>
                    <button type="button" onClick={() => setSelectedDate(isSel?null:d.key)} style={{ appearance:"none", WebkitAppearance:"none", width:"100%", padding:"10px 12px", fontSize:13, fontWeight:600, border:isSel?"1px solid #18181b":"1px solid #e4e4e7", borderRadius:8, cursor:"pointer", backgroundColor:colors.bg, color:colors.text, textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, fontFamily:"inherit" }}>
                      {count===0?"No tasks":`${count} task${count===1?"":"s"}`}
                    </button>
                  </td>
                );
              })}</tr></tbody>
            </table>
          </div>
          {selectedDate && <div style={{ marginTop:10, fontSize:12, color:"#52525b" }}>Showing tasks due on <strong>{new Date(selectedDate+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</strong>. Click <strong>Clear</strong> to see all.</div>}
        </SectionCard>

        <SectionCard title="My open tasks">
          {myTasks.length===0
            ? <div style={{ fontSize:13, color:"#71717a" }}>Nothing assigned to you. Nice.</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {CATEGORIES.map((c) => {
                  const list = myTasksByCategory[c.value]??[];
                  if(list.length===0) return null;
                  return (
                    <div key={c.value}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ width:8, height:8, borderRadius:999, background:c.color, display:"inline-block" }} />{c.label} ({list.length})
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{list.map((t)=>renderListTaskRow(t))}</div>
                    </div>
                  );
                })}
              </div>
          }
        </SectionCard>

        <SectionCard title={`Team tasks (${teamTasksByAssignee.reduce((s,[,l])=>s+l.length,0)})`}>
          {teamTasksByAssignee.length===0
            ? <div style={{ fontSize:13, color:"#71717a" }}>No open tasks assigned to anyone else.</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {teamTasksByAssignee.map(([ae,list]) => (
                  <div key={ae}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#52525b", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:22, height:22, borderRadius:999, background:"#18181b", color:"#fff", fontSize:10, fontWeight:700, textTransform:"uppercase" }}>{ae.slice(0,2)}</span>
                      <span>{ae}</span><span style={{ color:"#a1a1aa", fontWeight:500 }}>{"\xb7"} {list.length} open</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{list.map((t)=>renderListTaskRow(t))}</div>
                  </div>
                ))}
              </div>
          }
        </SectionCard>

        <SectionCard title={`All tasks (${filteredTasks.length})`}>
          {filteredTasks.length===0
            ? <div style={{ fontSize:13, color:"#71717a" }}>No tasks match your current filters.</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {CATEGORIES.map((c) => {
                  const list = allTasksByCategory[c.value]??[];
                  return (
                    <div key={c.value}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ width:8, height:8, borderRadius:999, background:c.color, display:"inline-block" }} />{c.label} ({list.length})
                      </div>
                      {list.length===0
                        ? <div style={{ fontSize:12, color:"#a1a1aa", padding:"8px 0" }}>No tasks in this category.</div>
                        : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{list.map((t)=>renderListTaskRow(t))}</div>
                      }
                    </div>
                  );
                })}
              </div>
          }
        </SectionCard>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      {/* ── Header ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:16, marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <div>
            <h1 style={{ margin:0, fontSize:30, lineHeight:1.05, fontWeight:700, color:"#18181b", letterSpacing:"-0.03em" }}>Tasks</h1>
            <p style={{ margin:"6px 0 0", fontSize:14, color:"#71717a", maxWidth:620 }}>Assign work to teammates, track progress, and keep every category moving.</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            {/* View toggles */}
            <div style={{ display:"flex", gap:2, background:"#f4f4f5", borderRadius:9, padding:3 }}>
              {([{ mode:"kanban" as const, label:"Kanban" }, { mode:"list" as const, label:"List" }]).map(({ mode, label }) => (
                <button key={mode} type="button" onClick={() => setViewMode(mode)} style={{ padding:"5px 12px", borderRadius:7, background:viewMode===mode?"#fff":"transparent", color:viewMode===mode?"#18181b":"#71717a", border:viewMode===mode?"1px solid #e4e4e7":"1px solid transparent", fontSize:12, fontWeight:600, cursor:"pointer", boxShadow:viewMode===mode?"0 1px 2px rgba(0,0,0,0.05)":"none", fontFamily:"inherit" }}>
                  {label}
                </button>
              ))}
            </div>
            {/* Notifications */}
            <div style={{ position:"relative" }}>
              <button type="button" onClick={() => { setShowNotifications((v)=>!v); if(!showNotifications) markAllRead(); }} style={{ ...secondaryButton, padding:"7px 11px", position:"relative" }} aria-label={"Notifications" + (unreadCount>0 ? " (" + String(unreadCount) + ")" : "")}>
                {"\ud83d\udd14"}
                {unreadCount>0 && <span style={{ position:"absolute", top:-4, right:-4, width:16, height:16, borderRadius:999, background:"#ef4444", color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{unreadCount>9?"9+":unreadCount}</span>}
              </button>
              {showNotifications && (
                <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:320, background:"#fff", border:"1px solid #e4e4e7", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:100, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"1px solid #e4e4e7", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"#18181b" }}>Notifications</span>
                    <button type="button" onClick={() => setShowNotifications(false)} style={{ ...ghostButton, fontSize:16, padding:"0 6px" }}>{"\xd7"}</button>
                  </div>
                  <div style={{ maxHeight:300, overflowY:"auto" }}>
                    {notifications.length===0
                      ? <div style={{ padding:"20px 16px", fontSize:13, color:"#a1a1aa", textAlign:"center" }}>No notifications {"\ud83c\udf89"}</div>
                      : notifications.map((n) => (
                          <button key={n.id} type="button" onClick={() => { setSelectedTaskId(n.taskId); setDetailTab("overview"); setShowNotifications(false); }} style={{ width:"100%", padding:"12px 16px", background:"transparent", border:"none", borderBottom:"1px solid #f4f4f5", textAlign:"left", cursor:"pointer", display:"flex", flexDirection:"column", gap:3, fontFamily:"inherit" }}>
                            <span style={{ fontSize:12, fontWeight:600, color:"#18181b" }}>{n.taskTitle}</span>
                            <span style={{ fontSize:11, color:"#991b1b" }}>{"\u26a0"} {n.message}</span>
                          </button>
                        ))
                    }
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setShowShortcuts((v)=>!v)} title="Keyboard shortcuts (?)" style={{ ...secondaryButton, padding:"7px 11px", fontWeight:700 }}>?</button>
            <button type="button" onClick={() => setShowNewTaskForm(true)} style={primaryButton} title="New task (n)">+ New task</button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <input type="search" value={filters.search} onChange={(e) => setFilters((f)=>({...f,search:e.target.value}))} placeholder="Search tasks..." style={{ ...inputStyle, width:180, padding:"6px 10px", fontSize:12 }} />
          <select value={filters.category} onChange={(e) => setFilters((f)=>({...f,category:e.target.value as TaskCategory|"all"}))} style={{ ...inputStyle, width:"auto", padding:"6px 10px", fontSize:12 }}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c)=><option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select value={filters.assignee} onChange={(e) => setFilters((f)=>({...f,assignee:e.target.value}))} style={{ ...inputStyle, width:"auto", padding:"6px 10px", fontSize:12 }}>
            <option value="all">All assignees</option>
            {assigneeOptions.map((u)=><option key={u} value={u}>{u}</option>)}
          </select>
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#52525b", cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={filters.showCompleted} onChange={(e) => setFilters((f)=>({...f,showCompleted:e.target.checked}))} style={{ cursor:"pointer" }} />
            Show completed
          </label>
          {(filters.category!=="all"||filters.assignee!=="all"||filters.search||!filters.showCompleted) && (
            <button type="button" onClick={() => setFilters({category:"all",assignee:"all",search:"",showCompleted:true})} style={{ ...ghostButton, color:"#ef4444", fontSize:12 }}>Clear filters</button>
          )}
        </div>

        {/* Saved views */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          {savedViews.length>0 && <span style={{ fontSize:11, color:"#a1a1aa", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>Saved:</span>}
          {savedViews.map((v) => (
            <div key={v.id} style={{ display:"flex", alignItems:"center" }}>
              <button type="button" onClick={() => loadView(v)} style={{ ...secondaryButton, fontSize:11, padding:"4px 10px", borderRadius:"7px 0 0 7px", borderRight:"none" }}>{v.name}</button>
              <button type="button" onClick={() => deleteSavedView(v.id)} style={{ ...secondaryButton, fontSize:12, padding:"4px 7px", borderRadius:"0 7px 7px 0", color:"#a1a1aa" }} aria-label={"Delete " + v.name}>{"\xd7"}</button>
            </div>
          ))}
          <button type="button" onClick={saveCurrentView} style={{ ...ghostButton, fontSize:11, color:"#3b82f6" }}>+ Save view</button>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size>0 && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#18181b", borderRadius:10, color:"#fff", flexWrap:"wrap" }}>
            <span style={{ fontSize:13, fontWeight:600 }}>{selectedIds.size} task{selectedIds.size>1?"s":""} selected</span>
            <div style={{ width:1, height:16, background:"#3f3f46", flexShrink:0 }} />
            {STATUS_OPTIONS.map((s) => (
              <button key={s.value} type="button" onClick={() => bulkSetStatus(s.value)} disabled={isPending} style={{ padding:"5px 10px", borderRadius:7, background:"#27272a", color:"#e4e4e7", border:"1px solid #3f3f46", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                {"\u2192"} {s.label}
              </button>
            ))}
            <button type="button" onClick={bulkDelete} disabled={isPending} style={{ padding:"5px 10px", borderRadius:7, background:"#991b1b", color:"#fff", border:"none", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Delete</button>
            <button type="button" onClick={clearSelected} style={{ ...ghostButton, color:"#a1a1aa", fontSize:12, marginLeft:"auto" }}>Deselect</button>
          </div>
        )}
      </div>

      {/* Main board */}
      <div style={{ marginRight:selectedTask?440:0, transition:"margin-right 0.2s ease" }}>
        {viewMode==="kanban" ? renderKanbanView() : renderListView()}
      </div>

      {/* Detail panel */}
      {renderDetailPanel()}

      {/* New task modal */}
      {showNewTaskForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }} onClick={(e) => { if(e.target===e.currentTarget) setShowNewTaskForm(false); }}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:520, display:"flex", flexDirection:"column", gap:14, boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#18181b" }}>New task</h2>
              <button type="button" onClick={() => setShowNewTaskForm(false)} style={{ ...ghostButton, fontSize:20, padding:"0 8px" }}>{"\xd7"}</button>
            </div>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if(e.key==="Enter"&&newTitle.trim()) handleAdd(); }} placeholder="Task title" style={inputStyle} autoFocus />
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, minHeight:70, resize:"vertical" }} />
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:10 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:11, color:"#71717a", fontWeight:600 }}>Category</span>
                <select value={newCat} onChange={(e) => setNewCat(e.target.value as TaskCategory)} style={inputStyle}>{CATEGORIES.map((c)=><option key={c.value} value={c.value}>{c.label}</option>)}</select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:11, color:"#71717a", fontWeight:600 }}>Assign to</span>
                <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} style={inputStyle}><option value="">Unassigned</option>{assigneeOptions.map((u)=><option key={u} value={u}>{u}</option>)}</select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:11, color:"#71717a", fontWeight:600 }}>Due date</span>
                <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:11, color:"#71717a", fontWeight:600 }}>Repeats</span>
                <select value={newRecurrence} onChange={(e) => setNewRecurrence(e.target.value as TaskRecurrence)} style={inputStyle}>{RECURRENCE_OPTIONS.map((r)=><option key={r.value} value={r.value}>{r.label}</option>)}</select>
              </label>
            </div>
            {newRecurrence!=="none" && <div style={{ fontSize:12, color:"#71717a" }}>Tip: pick a due date on the first target day and the task will roll forward when completed.</div>}
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={handleAdd} disabled={isPending||!newTitle.trim()} style={{ ...primaryButton, opacity:!newTitle.trim()||isPending?0.6:1 }}>{isPending?"Adding...":"Add task"}</button>
              <button type="button" onClick={() => setShowNewTaskForm(false)} style={secondaryButton}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }} onClick={(e) => { if(e.target===e.currentTarget) setShowShortcuts(false); }}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:380, display:"flex", flexDirection:"column", gap:16, boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#18181b" }}>Keyboard shortcuts</h2>
              <button type="button" onClick={() => setShowShortcuts(false)} style={{ ...ghostButton, fontSize:20, padding:"0 8px" }}>{"\xd7"}</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {KEYBOARD_SHORTCUTS.map(({ key, description }) => (
                <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"8px 0", borderBottom:"1px solid #f4f4f5" }}>
                  <span style={{ fontSize:13, color:"#52525b" }}>{description}</span>
                  <kbd style={{ padding:"3px 8px", borderRadius:6, background:"#f4f4f5", border:"1px solid #e4e4e7", fontSize:11, fontWeight:700, color:"#18181b", fontFamily:"monospace", whiteSpace:"nowrap" }}>{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading toast */}
      {isPending && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"#18181b", color:"#fff", padding:"8px 18px", borderRadius:999, fontSize:12, fontWeight:600, zIndex:400, pointerEvents:"none" }}>
          Saving...
        </div>
      )}
    </div>
  );
}
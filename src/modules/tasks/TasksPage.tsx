import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  Table2,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import type { TaskPriority, TaskStatus, TaskType } from '../../types/erp';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

const STATUS_COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'in_review', label: 'In Review' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_TONES: Record<TaskPriority, 'critical' | 'warning' | 'neutral' | 'nominal'> = {
  critical: 'critical',
  high: 'warning',
  medium: 'neutral',
  low: 'nominal',
};

const createTaskSchema = z.object({
  title: z.string().min(2, 'Task title is required.'),
  description: z.string().optional(),
  task_type: z.enum(['task', 'bug', 'improvement', 'research']),
  department_id: z.string().optional(),
  project_id: z.string().optional(),
  product_id: z.string().optional(),
  assigned_to: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled']),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  estimated_hours: z.string().optional(),
});

type CreateTaskForm = z.infer<typeof createTaskSchema>;

type ScopeFilter = 'my' | 'team' | 'overdue';
type ViewMode = 'kanban' | 'table' | 'calendar';

export function TasksPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialScope = (searchParams.get('scope') as ScopeFilter) || (hasPermission('tasks.view') ? 'team' : 'my');
  const [scope, setScope] = useState<ScopeFilter>(initialScope);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(searchParams.get('task'));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [depTargetId, setDepTargetId] = useState('');
  const [actualHoursDraft, setActualHoursDraft] = useState('');
  const [completionNotesDraft, setCompletionNotesDraft] = useState('');

  useEffect(() => {
    const paramTask = searchParams.get('task');
    if (paramTask) setSelectedTaskId(paramTask);
    const paramScope = searchParams.get('scope') as ScopeFilter | null;
    if (paramScope && ['my', 'team', 'overdue'].includes(paramScope)) setScope(paramScope);
  }, [searchParams]);

  const canManageTasks = hasPermission('tasks.manage');
  const todayIso = new Date().toISOString().slice(0, 10);

  const tasksQuery = useQuery({
    queryKey: ['tasks', companyId],
    queryFn: () => erpRepository.listTasks(companyId!),
    enabled: Boolean(companyId),
  });

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments', companyId],
    queryFn: () => erpRepository.listDepartments(companyId!),
    enabled: Boolean(companyId),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId),
  });

  const taskDetailsQuery = useQuery({
    queryKey: ['task_details', companyId, selectedTaskId],
    queryFn: () => erpRepository.getTaskDetails(companyId!, selectedTaskId!),
    enabled: Boolean(companyId && selectedTaskId),
  });

  const tasks = tasksQuery.data ?? [];
  const members = teamQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const products = productsQuery.data ?? [];

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  useEffect(() => {
    if (selectedTask) {
      setActualHoursDraft(selectedTask.actual_hours != null ? String(selectedTask.actual_hours) : '');
      setCompletionNotesDraft(selectedTask.completion_notes ?? '');
    }
  }, [selectedTask]);

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scope === 'my' && t.assigned_to !== currentUser?.id && t.created_by !== currentUser?.id) return false;
      if (
        scope === 'overdue' &&
        (!t.due_date || t.due_date >= todayIso || t.status === 'completed' || t.status === 'cancelled')
      ) {
        return false;
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (deptFilter !== 'all' && t.department_id !== deptFilter) return false;
      if (assigneeFilter !== 'all' && t.assigned_to !== assigneeFilter) return false;
      if (q) {
        const hay = `${t.id} ${t.title} ${t.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, scope, currentUser?.id, todayIso, priorityFilter, statusFilter, deptFilter, assigneeFilter, searchTerm]);

  const createForm = useForm<CreateTaskForm>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      task_type: 'task',
      department_id: '',
      project_id: '',
      product_id: '',
      assigned_to: currentUser?.id ?? '',
      priority: 'medium',
      status: 'todo',
      start_date: todayIso,
      due_date: '',
      estimated_hours: '',
    },
  });

  const invalidateTaskQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks_search'] }),
      queryClient.invalidateQueries({ queryKey: ['task_details'] }),
      queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  const createTaskMutation = useMutation({
    mutationFn: async (vals: CreateTaskForm) => {
      if (!currentUser || !companyId) throw new Error('No authenticated user.');
      const est = vals.estimated_hours ? Number(vals.estimated_hours) : null;
      return erpRepository.createTask(currentUser.id, companyId, {
        title: vals.title,
        description: vals.description || null,
        task_type: vals.task_type as TaskType,
        department_id: vals.department_id || null,
        project_id: vals.project_id || null,
        product_id: vals.product_id || null,
        assigned_to: vals.assigned_to || null,
        priority: vals.priority as TaskPriority,
        status: vals.status as TaskStatus,
        start_date: vals.start_date || null,
        due_date: vals.due_date || null,
        estimated_hours: est !== null && !Number.isNaN(est) ? est : null,
      });
    },
    onSuccess: async (created) => {
      await invalidateTaskQueries();
      setCreateOpen(false);
      createForm.reset();
      setSelectedTaskId(created.id);
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to create task.');
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof erpRepository.updateTask>[2]) => {
      if (!currentUser || !companyId) throw new Error('No authenticated user.');
      return erpRepository.updateTask(currentUser.id, companyId, payload);
    },
    onSuccess: async () => {
      await invalidateTaskQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update task.');
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedTaskId || !commentText.trim()) return;
      await erpRepository.addTaskComment(currentUser.id, companyId, selectedTaskId, commentText);
    },
    onSuccess: async () => {
      setCommentText('');
      await invalidateTaskQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to add comment.');
    },
  });

  const addDependencyMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedTaskId || !depTargetId) return;
      await erpRepository.addTaskDependency(currentUser.id, companyId, selectedTaskId, depTargetId, 'blocks');
    },
    onSuccess: async () => {
      setDepTargetId('');
      await invalidateTaskQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to add dependency.');
    },
  });

  const addAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentUser || !companyId || !selectedTaskId) return;
      await erpRepository.addTaskAttachmentMetadata(currentUser.id, companyId, selectedTaskId, file);
    },
    onSuccess: async () => {
      await invalidateTaskQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to attach file.');
    },
  });

  // Calendar grid generation
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ dateIso: string | null; dayNumber: number | null }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push({ dateIso: null, dayNumber: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateIso: iso, dayNumber: d });
    }
    return cells;
  }, [calendarMonth]);

  const openTaskDetails = (taskId: string) => {
    setSelectedTaskId(taskId);
    setSearchParams({ task: taskId });
  };

  const closeTaskDetails = () => {
    setSelectedTaskId(null);
    setSearchParams({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Execution & Delivery · {filteredTasks.length} task{filteredTasks.length === 1 ? '' : 's'} shown
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Task Management
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium ${
                viewMode === 'kanban'
                  ? 'bg-[#0B3B66] text-white dark:bg-sky-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium ${
                viewMode === 'table'
                  ? 'bg-[#0B3B66] text-white dark:bg-sky-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium ${
                viewMode === 'calendar'
                  ? 'bg-[#0B3B66] text-white dark:bg-sky-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Calendar
            </button>
          </div>

          {canManageTasks ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setCreateOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New Task
            </button>
          ) : null}
        </div>
      </div>

      {/* Scope Tabs: My Tasks / Team Tasks / Overdue Tasks */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-[#1E3252] dark:bg-[#091221]">
        <button
          type="button"
          onClick={() => setScope('my')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            scope === 'my'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          My Tasks
        </button>
        {hasPermission('tasks.view') ? (
          <button
            type="button"
            onClick={() => setScope('team')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              scope === 'team'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            Team Tasks
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setScope('overdue')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            scope === 'overdue'
              ? 'bg-white text-red-700 shadow-sm dark:bg-[#0C1729] dark:text-red-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          Overdue Tasks
        </button>
      </div>

      {actionError ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tasks..."
            aria-label="Search tasks"
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 focus:border-[#0B3B66] focus:bg-white focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Filter by priority"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
        >
          <option value="all">All Statuses</option>
          {STATUS_COLUMNS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          aria-label="Filter by department"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filter by assignee"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
        >
          <option value="all">All Assignees</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
      </div>

      {/* Empty State */}
      {tasksQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks match this view"
          description={
            tasks.length === 0
              ? 'No operational tasks have been created yet. Create the first task to populate the Kanban board, calendar, and CEO dashboard counters.'
              : 'No tasks match your active scope or filter selection.'
          }
          action={
            canManageTasks ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Create First Task
              </button>
            ) : undefined
          }
        />
      ) : null}

      {/* VIEW 1: KANBAN BOARD */}
      {!tasksQuery.isLoading && filteredTasks.length > 0 && viewMode === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const draggedId = e.dataTransfer.getData('text/plain');
                  if (draggedId) {
                    updateTaskMutation.mutate({ id: draggedId, status: col.id });
                  }
                }}
                className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-100/70 p-3 dark:border-[#1E3252] dark:bg-[#091221]"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {col.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {colTasks.map((task) => {
                    const isOverdue =
                      task.due_date !== null &&
                      task.due_date < todayIso &&
                      task.status !== 'completed' &&
                      task.status !== 'cancelled';
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                        className="rounded-md border border-slate-200 bg-white p-3.5 transition-colors hover:border-[#0B3B66] dark:border-[#1E3252] dark:bg-[#0C1729] dark:hover:border-sky-500"
                      >
                        <button
                          type="button"
                          onClick={() => openTaskDetails(task.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <StatusText
                              tone={PRIORITY_TONES[task.priority]}
                              label={task.priority.toUpperCase()}
                            />
                            <span className="font-mono text-slate-400">
                              {task.task_type}
                            </span>
                          </div>
                          <div className="mt-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                            {task.title}
                          </div>
                          {task.project_id || task.product_id ? (
                            <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {[
                                task.product_id ? productMap.get(task.product_id) : null,
                                task.project_id ? projectMap.get(task.project_id) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="truncate">
                              {task.assigned_to ? memberMap.get(task.assigned_to) ?? 'Assigned' : 'Unassigned'}
                            </span>
                            {task.due_date ? (
                              <span className={`font-mono ${isOverdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>
                                {task.due_date}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* VIEW 2: TABLE VIEW */}
      {!tasksQuery.isLoading && filteredTasks.length > 0 && viewMode === 'table' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Est / Actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {filteredTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openTaskDetails(t.id)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-[#102038]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{t.title}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {t.id.slice(0, 8)} · {t.task_type}
                        {t.product_id ? ` · ${productMap.get(t.product_id) ?? 'Product'}` : ''}
                        {t.project_id ? ` · ${projectMap.get(t.project_id) ?? 'Project'}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {t.department_id ? deptMap.get(t.department_id) ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {t.assigned_to ? memberMap.get(t.assigned_to) ?? '—' : 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText tone={PRIORITY_TONES[t.priority]} label={t.priority} />
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-300">
                      {t.status.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {t.due_date ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {t.estimated_hours ?? 0}h / {t.actual_hours ?? 0}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* VIEW 3: CALENDAR VIEW */}
      {!tasksQuery.isLoading && filteredTasks.length > 0 && viewMode === 'calendar' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 dark:border-[#1E3252]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 dark:border-[#1E3252]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 dark:border-[#1E3252] dark:bg-[#1E3252]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold text-slate-600 dark:bg-[#091221] dark:text-slate-400">
                {day}
              </div>
            ))}
            {calendarDays.map((cell, idx) => {
              const dayTasks = cell.dateIso ? filteredTasks.filter((t) => t.due_date === cell.dateIso) : [];
              return (
                <div
                  key={idx}
                  className="min-h-[92px] bg-white p-2 dark:bg-[#0C1729]"
                >
                  {cell.dayNumber ? (
                    <>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {cell.dayNumber}
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayTasks.map((dt) => (
                          <button
                            key={dt.id}
                            type="button"
                            onClick={() => openTaskDetails(dt.id)}
                            className="block w-full truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-left text-[11px] font-medium text-slate-800 hover:border-[#0B3B66] dark:border-[#1E3252] dark:bg-[#13233C] dark:text-slate-200"
                          >
                            {dt.title}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Create Task Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Create Task
              </h2>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={createForm.handleSubmit((vals) => createTaskMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Title *</label>
                <input
                  {...createForm.register('title')}
                  placeholder="Task title"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {createForm.formState.errors.title ? (
                  <p className="mt-1 text-[11px] text-red-600">{createForm.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={3}
                  {...createForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Type</label>
                <select
                  {...createForm.register('task_type')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                  <option value="improvement">Improvement</option>
                  <option value="research">Research</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Priority</label>
                <select
                  {...createForm.register('priority')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select
                  {...createForm.register('status')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  {STATUS_COLUMNS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Department</label>
                <select
                  {...createForm.register('department_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Project (Optional)</label>
                <select
                  {...createForm.register('project_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Product (Optional)</label>
                <select
                  {...createForm.register('product_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>{prod.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Assigned User</label>
                <select
                  {...createForm.register('assigned_to')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Estimated Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  {...createForm.register('estimated_hours')}
                  placeholder="4"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Start Date</label>
                <input
                  type="date"
                  {...createForm.register('start_date')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                <input
                  type="date"
                  {...createForm.register('due_date')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button type="button" onClick={() => setCreateOpen(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]">
                  Cancel
                </button>
                <button type="submit" disabled={createTaskMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Task Details Drawer */}
      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-[#1E3252]">
              <div>
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  TASK {selectedTask.id.slice(0, 8)} · Created {selectedTask.created_at.slice(0, 10)}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedTask.title}
                </h2>
              </div>
              <button type="button" onClick={closeTaskDetails} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedTask.description ? (
              <p className="mt-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {selectedTask.description}
              </p>
            ) : null}

            {/* Core Status, Priority, Assignee, Effort Controls */}
            <div className="mt-5 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 dark:border-[#1E3252] dark:bg-[#091221]">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Status</label>
                <select
                  value={selectedTask.status}
                  onChange={(e) =>
                    updateTaskMutation.mutate({ id: selectedTask.id, status: e.target.value as TaskStatus })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  {STATUS_COLUMNS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Priority</label>
                <select
                  value={selectedTask.priority}
                  disabled={!canManageTasks}
                  onChange={(e) =>
                    updateTaskMutation.mutate({ id: selectedTask.id, priority: e.target.value as TaskPriority })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Assignee</label>
                <select
                  value={selectedTask.assigned_to ?? ''}
                  disabled={!canManageTasks}
                  onChange={(e) =>
                    updateTaskMutation.mutate({ id: selectedTask.id, assigned_to: e.target.value || null })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Due Date</label>
                <input
                  type="date"
                  value={selectedTask.due_date ?? ''}
                  disabled={!canManageTasks}
                  onChange={(e) =>
                    updateTaskMutation.mutate({ id: selectedTask.id, due_date: e.target.value || null })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Linked Project</label>
                <select
                  value={selectedTask.project_id ?? ''}
                  disabled={!canManageTasks}
                  onChange={(e) =>
                    updateTaskMutation.mutate({ id: selectedTask.id, project_id: e.target.value || null })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Linked Product</label>
                <select
                  value={selectedTask.product_id ?? ''}
                  disabled={!canManageTasks}
                  onChange={(e) =>
                    updateTaskMutation.mutate({ id: selectedTask.id, product_id: e.target.value || null })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>{prod.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Actual Effort (hours) — Est: {selectedTask.estimated_hours ?? 0}h
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={actualHoursDraft}
                  onChange={(e) => setActualHoursDraft(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Completion Notes
                </label>
                <input
                  value={completionNotesDraft}
                  onChange={(e) => setCompletionNotesDraft(e.target.value)}
                  placeholder="Summary upon completion..."
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end sm:col-span-2">
                <button
                  type="button"
                  onClick={() =>
                    updateTaskMutation.mutate({
                      id: selectedTask.id,
                      actual_hours: actualHoursDraft ? Number(actualHoursDraft) : null,
                      completion_notes: completionNotesDraft || null,
                    })
                  }
                  className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
                >
                  Save Effort & Notes
                </button>
              </div>
            </div>

            {/* Dependencies & Attachments */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-[#1E3252]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <Link2 className="h-3.5 w-3.5 text-slate-400" />
                  Dependencies ({taskDetailsQuery.data?.dependencies.length ?? 0})
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {(taskDetailsQuery.data?.dependencies ?? []).map((dep) => {
                    const target = tasks.find((t) => t.id === dep.depends_on_task_id);
                    return (
                      <li key={dep.id} className="truncate text-slate-600 dark:text-slate-300">
                        Blocked by: <strong>{target?.title ?? dep.depends_on_task_id}</strong>
                      </li>
                    );
                  })}
                </ul>
                {canManageTasks ? (
                  <div className="mt-2 flex gap-1.5">
                    <select
                      value={depTargetId}
                      onChange={(e) => setDepTargetId(e.target.value)}
                      className="h-8 flex-1 rounded border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                    >
                      <option value="">Link prerequisite task...</option>
                      {tasks
                        .filter((t) => t.id !== selectedTask.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!depTargetId}
                      onClick={() => addDependencyMutation.mutate()}
                      className="h-8 rounded border border-slate-200 px-2.5 text-xs font-medium disabled:opacity-40 dark:border-[#1E3252]"
                    >
                      Link
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-[#1E3252]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                    Attachments ({taskDetailsQuery.data?.attachments.length ?? 0})
                  </span>
                  <label className="cursor-pointer text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                    Attach File
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) addAttachmentMutation.mutate(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {(taskDetailsQuery.data?.attachments ?? []).map((att) => (
                    <li key={att.id} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="truncate">{att.file_name}</span>
                      <span className="ml-2 font-mono text-[10px] text-slate-400">
                        {Math.max(1, Math.round(att.size_bytes / 1024))} KB
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Comments */}
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                Comments ({taskDetailsQuery.data?.comments.length ?? 0})
              </div>
              <ul className="mt-3 space-y-2.5">
                {(taskDetailsQuery.data?.comments ?? []).map((c) => (
                  <li key={c.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-[#1E3252] dark:bg-[#091221]">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <strong className="text-slate-800 dark:text-slate-200">{c.author_name ?? 'Member'}</strong>
                      <span className="font-mono">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{c.body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                />
                <button
                  type="button"
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                  onClick={() => addCommentMutation.mutate()}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white disabled:opacity-40 dark:bg-sky-600"
                >
                  Post
                </button>
              </div>
            </div>

            {/* Activity History */}
            <div className="mt-6 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Activity History</h3>
              <ul className="mt-2 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {(taskDetailsQuery.data?.activity ?? []).map((act) => (
                  <li key={act.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-b-0 dark:border-[#1E3252]">
                    <span>
                      <strong className="text-slate-700 dark:text-slate-300">{act.actor_name}</strong> ·{' '}
                      <code className="font-mono">{act.event_type}</code>
                    </span>
                    <span className="font-mono">{new Date(act.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

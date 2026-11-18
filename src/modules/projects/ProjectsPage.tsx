import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Edit3,
  FileText,
  FolderKanban,
  Milestone as MilestoneIcon,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatMinorCurrency } from '../../lib/currency';
import { getLocalTodayIso, isValidIsoDate, normalizeDateIso } from '../../lib/date';
import { erpRepository } from '../../services/erpRepository';
import type {
  MilestoneRecord,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  TaskPriority,
  TaskRecord,
} from '../../types/erp';
import { ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

const PROJECT_STATUS_TONES: Record<ProjectStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  planning: 'neutral',
  active: 'nominal',
  on_hold: 'warning',
  completed: 'nominal',
  cancelled: 'critical',
};

const MILESTONE_STATUS_TONES: Record<MilestoneRecord['status'], 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  planned: 'neutral',
  in_progress: 'nominal',
  completed: 'nominal',
  missed: 'critical',
};

const optionalDateField = z
  .string()
  .optional()
  .refine((val) => !val || isValidIsoDate(val), {
    message: 'Enter a valid date (YYYY-MM-DD).',
  });

const projectFormSchema = z
  .object({
    code: z.string().min(2, 'Project code is required (e.g. PRJ-001).'),
    name: z.string().min(2, 'Project name is required.'),
    description: z.string().optional(),
    project_type: z.enum(['internal', 'product_engineering', 'client_delivery', 'operations']),
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']),
    business_unit_id: z.string().optional(),
    product_id: z.string().optional(),
    owner_id: z.string().optional(),
    project_manager_id: z.string().optional(),
    start_date: optionalDateField,
    due_date: optionalDateField,
    budget_major: z.string().optional(),
    budget_currency: z.string().min(3).max(3),
    progress_pct: z.number().min(0).max(100),
  })
  .refine((vals) => !vals.start_date || !vals.due_date || vals.due_date >= vals.start_date, {
    message: 'Due date cannot be earlier than start date.',
    path: ['due_date'],
  });

type ProjectFormValues = z.infer<typeof projectFormSchema>;

const milestoneSchema = z.object({
  title: z.string().min(2, 'Milestone title is required.'),
  description: z.string().optional(),
  due_date: optionalDateField,
  status: z.enum(['planned', 'in_progress', 'completed', 'missed']),
});

type MilestoneFormValues = z.infer<typeof milestoneSchema>;

function majorToMinor(rawMajor: string | undefined, currencyCode: string): number {
  const cleaned = (rawMajor ?? '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 1 : 100;
  return Math.round(parsed * multiplier);
}

function minorToMajorInput(amountMinor: number, currencyCode: string): string {
  if (!amountMinor) return '0';
  const divisor = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 1 : 100;
  return divisor === 1 ? String(amountMinor) : (amountMinor / divisor).toFixed(2);
}

export function ProjectsPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(searchParams.get('project'));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');

  const [formModalMode, setFormModalMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<MilestoneRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'project'; item: ProjectRecord }
    | { kind: 'milestone'; item: MilestoneRecord }
    | { kind: 'task'; item: TaskRecord }
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Detail sub-forms state
  const [memberProfileId, setMemberProfileId] = useState('');
  const [memberRole, setMemberRole] = useState('Contributor');
  const [memberAllocation, setMemberAllocation] = useState(50);

  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>('medium');
  const [quickTaskAssignee, setQuickTaskAssignee] = useState('');
  const [quickTaskDueDate, setQuickTaskDueDate] = useState('');

  useEffect(() => {
    const paramProject = searchParams.get('project');
    if (paramProject) setSelectedProjectId(paramProject);
  }, [searchParams]);

  const canManageProjects = hasPermission('projects.manage');
  const canManageTasks = hasPermission('tasks.manage');

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const businessUnitsQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId),
  });

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const projectMembersQuery = useQuery({
    queryKey: ['project_members', companyId],
    queryFn: () => erpRepository.listProjectMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const milestonesQuery = useQuery({
    queryKey: ['milestones', companyId],
    queryFn: () => erpRepository.listMilestones(companyId!),
    enabled: Boolean(companyId),
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', companyId],
    queryFn: () => erpRepository.listTasks(companyId!),
    enabled: Boolean(companyId),
  });

  const companyQuery = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => erpRepository.getCompany(companyId!),
    enabled: Boolean(companyId),
  });

  const projects = projectsQuery.data ?? [];
  const businessUnits = businessUnitsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const members = teamQuery.data ?? [];
  const allProjectMembers = projectMembersQuery.data ?? [];
  const allMilestones = milestonesQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];
  const defaultCurrency = companyQuery.data?.default_currency ?? 'INR';

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);
  const unitMap = useMemo(() => new Map(businessUnits.map((b) => [b.id, b.name])), [businessUnits]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.project_type !== typeFilter) return false;
      if (unitFilter !== 'all' && p.business_unit_id !== unitFilter) return false;
      if (q) {
        const hay = `${p.code} ${p.name} ${p.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, searchTerm, statusFilter, typeFilter, unitFilter]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedMembers = useMemo(
    () => allProjectMembers.filter((pm) => pm.project_id === selectedProjectId),
    [allProjectMembers, selectedProjectId]
  );

  const selectedMilestones = useMemo(
    () => allMilestones.filter((m) => m.project_id === selectedProjectId),
    [allMilestones, selectedProjectId]
  );

  const selectedTasks = useMemo(
    () => allTasks.filter((t) => t.project_id === selectedProjectId),
    [allTasks, selectedProjectId]
  );

  const projectForm = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      project_type: 'product_engineering',
      status: 'active',
      business_unit_id: '',
      product_id: '',
      owner_id: currentUser?.id ?? '',
      project_manager_id: currentUser?.id ?? '',
      start_date: getLocalTodayIso(),
      due_date: '',
      budget_major: '0',
      budget_currency: defaultCurrency,
      progress_pct: 0,
    },
  });

  const milestoneForm = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      title: '',
      description: '',
      due_date: '',
      status: 'planned',
    },
  });

  const editMilestoneForm = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      title: '',
      description: '',
      due_date: '',
      status: 'planned',
    },
  });

  const invalidateProjectQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['project_members'] }),
      queryClient.invalidateQueries({ queryKey: ['milestones'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
    ]);
  };

  const openCreateModal = () => {
    setActionError(null);
    setEditingProjectId(null);
    projectForm.reset({
      code: `PRJ-${String(projects.length + 1).padStart(3, '0')}`,
      name: '',
      description: '',
      project_type: 'product_engineering',
      status: 'active',
      business_unit_id: businessUnits[0]?.id ?? '',
      product_id: '',
      owner_id: currentUser?.id ?? '',
      project_manager_id: currentUser?.id ?? '',
      start_date: getLocalTodayIso(),
      due_date: '',
      budget_major: '0',
      budget_currency: defaultCurrency,
      progress_pct: 0,
    });
    setFormModalMode('create');
  };

  const openEditModal = (project: ProjectRecord) => {
    setActionError(null);
    setEditingProjectId(project.id);
    projectForm.reset({
      code: project.code,
      name: project.name,
      description: project.description ?? '',
      project_type: project.project_type,
      status: project.status,
      business_unit_id: project.business_unit_id ?? '',
      product_id: project.product_id ?? '',
      owner_id: project.owner_id ?? '',
      project_manager_id: project.project_manager_id ?? '',
      start_date: normalizeDateIso(project.start_date) ?? '',
      due_date: normalizeDateIso(project.due_date) ?? '',
      budget_major: minorToMajorInput(project.budget_minor, project.budget_currency),
      budget_currency: project.budget_currency,
      progress_pct: project.progress_pct,
    });
    setFormModalMode('edit');
  };

  const openEditMilestoneModal = (ms: MilestoneRecord) => {
    setActionError(null);
    editMilestoneForm.reset({
      title: ms.title,
      description: ms.description ?? '',
      due_date: normalizeDateIso(ms.due_date) ?? '',
      status: ms.status,
    });
    setEditingMilestone(ms);
  };

  const saveProjectMutation = useMutation({
    mutationFn: async (vals: ProjectFormValues) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      const currency = vals.budget_currency.toUpperCase();
      const budgetMinor = majorToMinor(vals.budget_major, currency);
      const payload = {
        code: vals.code,
        name: vals.name,
        description: vals.description || null,
        project_type: vals.project_type as ProjectType,
        status: vals.status as ProjectStatus,
        business_unit_id: vals.business_unit_id || null,
        product_id: vals.product_id || null,
        owner_id: vals.owner_id || null,
        project_manager_id: vals.project_manager_id || null,
        start_date: vals.start_date || null,
        due_date: vals.due_date || null,
        budget_minor: budgetMinor,
        budget_currency: currency,
        progress_pct: Math.min(100, Math.max(0, Math.round(vals.progress_pct))),
      };
      if (formModalMode === 'edit' && editingProjectId) {
        return erpRepository.updateProject(currentUser.id, companyId, {
          ...payload,
          id: editingProjectId,
        });
      }
      return erpRepository.createProject(currentUser.id, companyId, payload);
    },
    onSuccess: async (saved) => {
      await invalidateProjectQueries();
      setFormModalMode('closed');
      setEditingProjectId(null);
      setSelectedProjectId(saved.id);
      setSearchParams({ project: saved.id });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to save project.');
    },
  });

  const completeProjectMutation = useMutation({
    mutationFn: async (project: ProjectRecord) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      return erpRepository.updateProject(currentUser.id, companyId, {
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        project_type: project.project_type,
        status: 'completed',
        business_unit_id: project.business_unit_id,
        product_id: project.product_id,
        client_id: project.client_id,
        owner_id: project.owner_id,
        project_manager_id: project.project_manager_id,
        start_date: project.start_date,
        due_date: project.due_date,
        budget_minor: project.budget_minor,
        budget_currency: project.budget_currency,
        progress_pct: 100,
      });
    },
    onSuccess: async () => {
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to complete project.');
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteProject(currentUser.id, companyId, projectId);
    },
    onSuccess: async (_, projectId) => {
      if (selectedProjectId === projectId) {
        clearSelection();
      }
      setDeleteTarget(null);
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to delete project.');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedProjectId || !memberProfileId) return;
      return erpRepository.addProjectMember(currentUser.id, companyId, {
        project_id: selectedProjectId,
        profile_id: memberProfileId,
        role_in_project: memberRole.trim() || 'Contributor',
        allocation_pct: Math.min(100, Math.max(5, Number(memberAllocation) || 50)),
      });
    },
    onSuccess: async () => {
      setMemberProfileId('');
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to add project member.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (rowId: string) => {
      if (!currentUser || !companyId) return;
      await erpRepository.removeProjectMember(currentUser.id, companyId, rowId);
    },
    onSuccess: async () => {
      await invalidateProjectQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to remove project member.');
    },
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (vals: MilestoneFormValues) => {
      if (!currentUser || !companyId || !selectedProjectId) throw new Error('No project selected.');
      return erpRepository.createMilestone(currentUser.id, companyId, {
        project_id: selectedProjectId,
        product_id: selectedProject?.product_id ?? null,
        title: vals.title,
        description: vals.description || null,
        due_date: vals.due_date || null,
        status: vals.status,
      });
    },
    onSuccess: async () => {
      milestoneForm.reset({ title: '', description: '', due_date: '', status: 'planned' });
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to create milestone.');
    },
  });

  const updateMilestoneStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: MilestoneRecord['status'] }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateMilestoneStatus(currentUser.id, companyId, payload.id, payload.status);
    },
    onSuccess: async () => {
      await invalidateProjectQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update milestone.');
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async (vals: MilestoneFormValues) => {
      if (!currentUser || !companyId || !editingMilestone) throw new Error('No milestone selected.');
      return erpRepository.updateMilestone(currentUser.id, companyId, {
        id: editingMilestone.id,
        title: vals.title,
        description: vals.description || null,
        due_date: vals.due_date || null,
        status: vals.status,
      });
    },
    onSuccess: async () => {
      setEditingMilestone(null);
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update milestone.');
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteMilestone(currentUser.id, companyId, milestoneId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to delete milestone.');
    },
  });

  const quickCreateTaskMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedProjectId || !quickTaskTitle.trim()) return;
      if (quickTaskDueDate && !isValidIsoDate(quickTaskDueDate)) {
        throw new Error('Enter a valid task due date (YYYY-MM-DD).');
      }
      await erpRepository.createTask(currentUser.id, companyId, {
        title: quickTaskTitle.trim(),
        task_type: 'task',
        project_id: selectedProjectId,
        product_id: selectedProject?.product_id ?? null,
        assigned_to: quickTaskAssignee || null,
        priority: quickTaskPriority,
        status: 'todo',
        due_date: quickTaskDueDate || null,
      });
    },
    onSuccess: async () => {
      setQuickTaskTitle('');
      setQuickTaskDueDate('');
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to create linked task.');
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.updateTask(currentUser.id, companyId, {
        id: taskId,
        status: 'completed',
      });
    },
    onSuccess: async () => {
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to complete task.');
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteTask(currentUser.id, companyId, taskId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidateProjectQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to delete task.');
    },
  });

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setSearchParams({ project: id });
  };

  const clearSelection = () => {
    setSelectedProjectId(null);
    setSearchParams({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Delivery Governance · {projects.length} project{projects.length === 1 ? '' : 's'} registered
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Project Management
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {selectedProject ? (
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Projects
            </button>
          ) : null}
          {canManageProjects ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New Project
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {/* SELECTED PROJECT DETAIL WORKSPACE */}
      {selectedProject ? (
        <div className="space-y-6">
          {/* Project Overview Header Card */}
          <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-[#1E3252]">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  <span>{selectedProject.code}</span>
                  <span>·</span>
                  <span className="capitalize">{selectedProject.project_type.replace('_', ' ')}</span>
                  <span>·</span>
                  <StatusText
                    tone={PROJECT_STATUS_TONES[selectedProject.status]}
                    label={selectedProject.status.replace('_', ' ').toUpperCase()}
                  />
                </div>
                <h2 className="mt-1.5 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  {selectedProject.name}
                </h2>
                {selectedProject.description ? (
                  <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {selectedProject.description}
                  </p>
                ) : null}
              </div>

              {canManageProjects ? (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedProject.status !== 'completed' ? (
                    <button
                      type="button"
                      disabled={completeProjectMutation.isPending}
                      onClick={() => completeProjectMutation.mutate(selectedProject)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Complete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedProject)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit Project
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ kind: 'project', item: selectedProject })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#091221] dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Business Unit</div>
                <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
                  {selectedProject.business_unit_id ? unitMap.get(selectedProject.business_unit_id) ?? '—' : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Linked Product</div>
                <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
                  {selectedProject.product_id ? (
                    <Link
                      to={`/products?product=${selectedProject.product_id}`}
                      className="text-[#0B3B66] hover:underline dark:text-sky-400"
                    >
                      {productMap.get(selectedProject.product_id) ?? 'Product'}
                    </Link>
                  ) : (
                    'None'
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Owner / PM</div>
                <div className="mt-1 text-xs text-slate-800 dark:text-slate-200">
                  {selectedProject.owner_id ? memberMap.get(selectedProject.owner_id) ?? '—' : '—'}
                  {selectedProject.project_manager_id
                    ? ` · PM: ${memberMap.get(selectedProject.project_manager_id) ?? '—'}`
                    : ''}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Timeline</div>
                <div className="mt-1 font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                  {selectedProject.start_date ?? 'TBD'} → {selectedProject.due_date ?? 'TBD'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Allocated Budget</div>
                <div className="mt-1 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                  {formatMinorCurrency(selectedProject.budget_minor, selectedProject.budget_currency)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Progress</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-200 dark:bg-[#13233C]">
                    <div
                      className="h-full bg-[#0B3B66] dark:bg-sky-500"
                      style={{ width: `${selectedProject.progress_pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                    {selectedProject.progress_pct}%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Team Members & Milestones Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Project Team Allocations */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Project Team ({selectedMembers.length})
                  </h3>
                </div>
              </div>

              {selectedMembers.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No allocated team members assigned yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {selectedMembers.map((pm) => (
                    <li key={pm.id} className="flex items-center justify-between py-2.5 text-xs">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {memberMap.get(pm.profile_id) ?? 'Team Member'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {pm.role_in_project} · <span className="font-mono tabular-nums">{pm.allocation_pct}%</span> allocation
                        </div>
                      </div>
                      {canManageProjects ? (
                        <button
                          type="button"
                          onClick={() => removeMemberMutation.mutate(pm.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          title="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {canManageProjects ? (
                <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-12 dark:border-[#1E3252]">
                  <select
                    value={memberProfileId}
                    onChange={(e) => setMemberProfileId(e.target.value)}
                    aria-label="Select member to allocate"
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-5 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="">Select member...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                  <input
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value)}
                    placeholder="Role"
                    aria-label="Role in project"
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-3 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={memberAllocation}
                    onChange={(e) => setMemberAllocation(Number(e.target.value))}
                    aria-label="Allocation percentage"
                    className="h-8 rounded border border-slate-200 bg-white px-2 font-mono text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <button
                    type="button"
                    disabled={!memberProfileId || addMemberMutation.isPending}
                    onClick={() => addMemberMutation.mutate()}
                    className="h-8 rounded bg-[#0B3B66] px-2.5 text-xs font-medium text-white disabled:opacity-40 sm:col-span-2 dark:bg-sky-600"
                  >
                    Assign
                  </button>
                </div>
              ) : null}
            </section>

            {/* Project Milestones */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <div className="flex items-center gap-2">
                  <MilestoneIcon className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Milestones ({selectedMilestones.length})
                  </h3>
                </div>
              </div>

              {selectedMilestones.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No milestones scheduled for this project yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {selectedMilestones.map((ms) => (
                    <li key={ms.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white">{ms.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">{ms.due_date ?? 'No due date'}</span>
                          <span>·</span>
                          <StatusText
                            tone={MILESTONE_STATUS_TONES[ms.status]}
                            label={ms.status.replace('_', ' ')}
                          />
                        </div>
                      </div>
                      {canManageProjects ? (
                        <div className="flex items-center gap-1.5">
                          {ms.status !== 'completed' ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateMilestoneStatusMutation.mutate({
                                  id: ms.id,
                                  status: 'completed',
                                })
                              }
                              title="Mark milestone completed"
                              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <select
                            value={ms.status}
                            onChange={(e) =>
                              updateMilestoneStatusMutation.mutate({
                                id: ms.id,
                                status: e.target.value as MilestoneRecord['status'],
                              })
                            }
                            aria-label={`Status for ${ms.title}`}
                            className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-[#1E3252] dark:bg-[#060D1A]"
                          >
                            <option value="planned">Planned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="missed">Missed</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => openEditMilestoneModal(ms)}
                            title="Edit milestone"
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ kind: 'milestone', item: ms })}
                            title="Delete milestone"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {canManageProjects ? (
                <form
                  onSubmit={milestoneForm.handleSubmit((vals) => createMilestoneMutation.mutate(vals))}
                  className="mt-4 border-t border-slate-100 pt-4 dark:border-[#1E3252]"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      {...milestoneForm.register('title')}
                      placeholder="New milestone title..."
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-6 dark:border-[#1E3252] dark:bg-[#060D1A]"
                    />
                    <input
                      type="date"
                      aria-label="Milestone due date"
                      {...milestoneForm.register('due_date')}
                      className="h-8 rounded border border-slate-200 bg-white px-2 font-mono text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                    />
                    <button
                      type="submit"
                      disabled={createMilestoneMutation.isPending}
                      className="h-8 rounded bg-[#0B3B66] px-2.5 text-xs font-medium text-white sm:col-span-2 dark:bg-sky-600"
                    >
                      Add
                    </button>
                  </div>
                  {milestoneForm.formState.errors.title || milestoneForm.formState.errors.due_date ? (
                    <p className="mt-1.5 text-[11px] text-red-600">
                      {milestoneForm.formState.errors.title?.message ?? milestoneForm.formState.errors.due_date?.message}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </section>
          </div>

          {/* Linked Project Tasks */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Project Tasks ({selectedTasks.length})
                </h3>
              </div>
              <Link to="/tasks" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                Open Task Board →
              </Link>
            </div>

            {canManageTasks ? (
              <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]">
                <input
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  placeholder="Quick add task linked to this project..."
                  className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                />
                <select
                  value={quickTaskAssignee}
                  onChange={(e) => setQuickTaskAssignee(e.target.value)}
                  className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <select
                  value={quickTaskPriority}
                  onChange={(e) => setQuickTaskPriority(e.target.value as TaskPriority)}
                  className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={quickTaskDueDate}
                  onChange={(e) => setQuickTaskDueDate(e.target.value)}
                  aria-label="Task due date"
                  title="Due date"
                  className="h-8 rounded border border-slate-200 bg-white px-2 font-mono text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                />
                <button
                  type="button"
                  disabled={!quickTaskTitle.trim() || quickCreateTaskMutation.isPending}
                  onClick={() => quickCreateTaskMutation.mutate()}
                  className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-40 sm:col-span-2 dark:bg-sky-600"
                >
                  Add Task
                </button>
              </div>
            ) : null}

            {selectedTasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No tasks linked to this project yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-[#1E3252] dark:text-slate-400">
                      <th className="py-2 pr-4 font-medium">Title</th>
                      <th className="py-2 pr-4 font-medium">Assignee</th>
                      <th className="py-2 pr-4 font-medium">Priority</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Due Date</th>
                      {canManageTasks ? <th className="py-2 text-right font-medium">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                    {selectedTasks.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-[#102038]">
                        <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">
                          <Link to={`/tasks?task=${t.id}`} className="hover:underline">
                            {t.title}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                          {t.assigned_to ? memberMap.get(t.assigned_to) ?? '—' : 'Unassigned'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <StatusText
                            tone={t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'warning' : 'neutral'}
                            label={t.priority}
                          />
                        </td>
                        <td className="py-2.5 pr-4 capitalize text-slate-700 dark:text-slate-300">
                          {t.status.replace('_', ' ')}
                        </td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {t.due_date ?? '—'}
                        </td>
                        {canManageTasks ? (
                          <td className="py-2.5 text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              {t.status !== 'completed' ? (
                                <button
                                  type="button"
                                  disabled={completeTaskMutation.isPending}
                                  onClick={() => completeTaskMutation.mutate(t.id)}
                                  title="Mark task completed"
                                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              <Link
                                to={`/tasks?task=${t.id}`}
                                title="Edit task in Task Board"
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'task', item: t })}
                                title="Delete task"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Risks & Documents Governance Strip */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Blocked Tasks & Delivery Risks
              </h3>
              {selectedTasks.filter((t) => t.status === 'blocked' || t.priority === 'critical').length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  No blocked or critical-priority tasks flagged on this project.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                  {selectedTasks
                    .filter((t) => t.status === 'blocked' || t.priority === 'critical')
                    .map((riskTask) => (
                      <li key={riskTask.id} className="flex items-center justify-between py-2">
                        <Link to={`/tasks?task=${riskTask.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                          {riskTask.title}
                        </Link>
                        <StatusText
                          tone={riskTask.status === 'blocked' ? 'critical' : 'warning'}
                          label={riskTask.status === 'blocked' ? 'BLOCKED' : 'CRITICAL'}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900 dark:text-white">
                  <FileText className="h-4 w-4 text-slate-400" />
                  Project Documents
                </h3>
                <Link to="/documents" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                  Document Vault →
                </Link>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Centralized Supabase Storage document indexing and signed-URL attachments for projects will synchronize here in Phase 6. Task-level file attachments are live today in each linked task&apos;s details drawer.
              </p>
            </section>
          </div>
        </div>
      ) : (
        /* PROJECT DIRECTORY LIST */
        <>
          {/* Filter Bar */}
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search project code or name..."
                aria-label="Search projects"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 focus:border-[#0B3B66] focus:bg-white focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by project type"
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
            >
              <option value="all">All Project Types</option>
              <option value="product_engineering">Product Engineering</option>
              <option value="client_delivery">Client Delivery</option>
              <option value="internal">Internal</option>
              <option value="operations">Operations</option>
            </select>

            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filter by business unit"
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
            >
              <option value="all">All Business Units</option>
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
          </div>

          {projectsQuery.isLoading ? (
            <div className="h-64 rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects recorded yet"
              description={
                projects.length === 0
                  ? 'Create a project to track milestones, allocated team members, delivery budgets, and linked tasks across business units.'
                  : 'No projects match your current search or filter criteria.'
              }
              action={
                canManageProjects ? (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create First Project
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Business Unit / Product</th>
                      <th className="px-4 py-3">Project Manager</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Budget</th>
                      <th className="px-4 py-3 text-right">Progress</th>
                      <th className="px-4 py-3">Status</th>
                      {canManageProjects ? <th className="px-4 py-3 text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                    {filteredProjects.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => selectProject(p.id)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-[#102038]"
                      >
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{p.code}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                          <div className="text-[11px] capitalize text-slate-500 dark:text-slate-400">
                            {p.project_type.replace('_', ' ')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          <div>{p.business_unit_id ? unitMap.get(p.business_unit_id) ?? '—' : '—'}</div>
                          {p.product_id ? (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {productMap.get(p.product_id) ?? 'Product'}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {p.project_manager_id ? memberMap.get(p.project_manager_id) ?? '—' : 'Unassigned'}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {p.due_date ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatMinorCurrency(p.budget_minor, p.budget_currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {p.progress_pct}%
                        </td>
                        <td className="px-4 py-3">
                          <StatusText
                            tone={PROJECT_STATUS_TONES[p.status]}
                            label={p.status.replace('_', ' ')}
                          />
                        </td>
                        {canManageProjects ? (
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-end gap-1">
                              {p.status !== 'completed' ? (
                                <button
                                  type="button"
                                  disabled={completeProjectMutation.isPending}
                                  onClick={() => completeProjectMutation.mutate(p)}
                                  title="Mark project complete"
                                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openEditModal(p)}
                                title="Edit project"
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'project', item: p })}
                                title="Delete project"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / Edit Project Modal */}
      {formModalMode !== 'closed' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {formModalMode === 'edit' ? 'Edit Project' : 'Create Project'}
              </h2>
              <button
                type="button"
                onClick={() => setFormModalMode('closed')}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={projectForm.handleSubmit((vals) => saveProjectMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Project Code *</label>
                <input
                  {...projectForm.register('code')}
                  placeholder="PRJ-001"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {projectForm.formState.errors.code ? (
                  <p className="mt-1 text-[11px] text-red-600">{projectForm.formState.errors.code.message}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Project Name *</label>
                <input
                  {...projectForm.register('name')}
                  placeholder="WrindhaOS Core Sync v1.2"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {projectForm.formState.errors.name ? (
                  <p className="mt-1 text-[11px] text-red-600">{projectForm.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  {...projectForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Project Type</label>
                <select
                  {...projectForm.register('project_type')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="product_engineering">Product Engineering</option>
                  <option value="client_delivery">Client Delivery</option>
                  <option value="internal">Internal</option>
                  <option value="operations">Operations</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select
                  {...projectForm.register('status')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Business Unit</label>
                <select
                  {...projectForm.register('business_unit_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Linked Product</label>
                <select
                  {...projectForm.register('product_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>{prod.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Project Owner</label>
                <select
                  {...projectForm.register('owner_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Project Manager</label>
                <select
                  {...projectForm.register('project_manager_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Start Date</label>
                <input
                  type="date"
                  {...projectForm.register('start_date')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {projectForm.formState.errors.start_date ? (
                  <p className="mt-1 text-[11px] text-red-600">{projectForm.formState.errors.start_date.message}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                <input
                  type="date"
                  {...projectForm.register('due_date')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {projectForm.formState.errors.due_date ? (
                  <p className="mt-1 text-[11px] text-red-600">{projectForm.formState.errors.due_date.message}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Budget (Major Units)
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    {...projectForm.register('budget_currency')}
                    maxLength={3}
                    className="h-9 w-20 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs uppercase text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...projectForm.register('budget_major')}
                    className="h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Progress (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  {...projectForm.register('progress_pct', { valueAsNumber: true })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setFormModalMode('closed')}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveProjectMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
                >
                  {saveProjectMutation.isPending ? 'Saving...' : formModalMode === 'edit' ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Milestone Modal */}
      {editingMilestone ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Edit Milestone
              </h2>
              <button
                type="button"
                onClick={() => setEditingMilestone(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={editMilestoneForm.handleSubmit((vals) => updateMilestoneMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300">Milestone Title *</label>
                <input
                  {...editMilestoneForm.register('title')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {editMilestoneForm.formState.errors.title ? (
                  <p className="mt-1 text-[11px] text-red-600">{editMilestoneForm.formState.errors.title.message}</p>
                ) : null}
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  {...editMilestoneForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                  <input
                    type="date"
                    {...editMilestoneForm.register('due_date')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                  {editMilestoneForm.formState.errors.due_date ? (
                    <p className="mt-1 text-[11px] text-red-600">{editMilestoneForm.formState.errors.due_date.message}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    {...editMilestoneForm.register('status')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="missed">Missed</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setEditingMilestone(null)}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMilestoneMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
                >
                  {updateMilestoneMutation.isPending ? 'Saving...' : 'Save Milestone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === 'project'
            ? 'Delete Project'
            : deleteTarget?.kind === 'milestone'
              ? 'Delete Milestone'
              : 'Delete Task'
        }
        description={
          deleteTarget?.kind === 'project'
            ? `Permanently delete "${deleteTarget.item.code} · ${deleteTarget.item.name}" and its project allocations and milestones?`
            : deleteTarget?.kind === 'milestone'
              ? `Permanently delete the "${deleteTarget.item.title}" milestone?`
              : deleteTarget?.kind === 'task'
                ? `Permanently delete task "${deleteTarget.item.title}"?`
                : ''
        }
        isPending={
          deleteProjectMutation.isPending ||
          deleteMilestoneMutation.isPending ||
          deleteTaskMutation.isPending
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === 'project') deleteProjectMutation.mutate(deleteTarget.item.id);
          else if (deleteTarget.kind === 'milestone') deleteMilestoneMutation.mutate(deleteTarget.item.id);
          else deleteTaskMutation.mutate(deleteTarget.item.id);
        }}
      />
    </div>
  );
}

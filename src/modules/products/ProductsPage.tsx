import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Bug,
  CheckSquare,
  Edit3,
  FileText,
  Layers,
  Milestone as MilestoneIcon,
  Package,
  Plus,
  Rocket,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatMinorCurrency } from '../../lib/currency';
import { erpRepository } from '../../services/erpRepository';
import type {
  FeatureRecord,
  MilestoneRecord,
  ProductHealth,
  ProductRecord,
  ProductStage,
  ReleaseRecord,
  ResourceMembership,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../../types/erp';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type WorkspaceTab = 'overview' | 'roadmap' | 'features' | 'tasks' | 'releases' | 'operations';

const HEALTH_TONES: Record<ProductHealth, 'nominal' | 'warning' | 'critical'> = {
  on_track: 'nominal',
  at_risk: 'warning',
  delayed: 'critical',
};

const productFormSchema = z.object({
  business_unit_id: z.string().min(1, 'Business unit is required.'),
  code: z.string().min(2, 'Product code is required.'),
  name: z.string().min(2, 'Product name is required.'),
  category: z.enum(['saas', 'mobile_game', 'business_software', 'platform', 'other']),
  description: z.string().optional(),
  stage: z.enum(['discovery', 'development', 'beta', 'live', 'maintenance', 'sunsetting']),
  health_status: z.enum(['on_track', 'at_risk', 'delayed']),
  progress_pct: z.number().min(0).max(100),
  product_owner_id: z.string().optional(),
  tech_lead_id: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const featureFormSchema = z.object({
  title: z.string().min(2, 'Feature title is required.'),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['proposed', 'scoped', 'in_development', 'testing', 'released', 'deferred']),
  milestone_id: z.string().optional(),
  owner_id: z.string().optional(),
});

type FeatureFormValues = z.infer<typeof featureFormSchema>;

const releaseFormSchema = z.object({
  version_tag: z.string().min(1, 'Version tag is required (e.g. v1.0.0).'),
  title: z.string().min(2, 'Release title is required.'),
  release_notes: z.string().optional(),
  environment: z.enum(['alpha', 'beta', 'staging', 'production']),
  status: z.enum(['planned', 'in_qa', 'ready', 'released', 'rolled_back']),
  target_date: z.string().optional(),
  release_manager_id: z.string().optional(),
});

type ReleaseFormValues = z.infer<typeof releaseFormSchema>;

export function ProductsPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(searchParams.get('product'));
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [taskFilterMode, setTaskFilterMode] = useState<'all' | 'dev' | 'bugs'>('all');

  const [productModalMode, setProductModalMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [actionError, setActionError] = useState<string | null>(null);

  // Inline creation drafts
  const [msTitle, setMsTitle] = useState('');
  const [msDueDate, setMsDueDate] = useState('');
  const [msDesc, setMsDesc] = useState('');

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('task');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignAccessLevel, setAssignAccessLevel] = useState<ResourceMembership['access_level']>('contributor');

  const canManageProducts = hasPermission('products.manage');
  const canManageTasks = hasPermission('tasks.manage');
  const canManageTeam = hasPermission('team.manage');

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId),
  });

  const businessUnitsQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', companyId],
    queryFn: () => erpRepository.listTasks(companyId!),
    enabled: Boolean(companyId),
  });

  const products = productsQuery.data ?? [];
  const businessUnits = businessUnitsQuery.data ?? [];
  const members = teamQuery.data ?? [];
  const allProjects = projectsQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];

  useEffect(() => {
    const paramProduct = searchParams.get('product');
    if (paramProduct) {
      setSelectedProductId(paramProduct);
    } else if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [searchParams, products, selectedProductId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );

  const milestonesQuery = useQuery({
    queryKey: ['milestones', companyId, selectedProduct?.id],
    queryFn: () => erpRepository.listMilestones(companyId!, { productId: selectedProduct!.id }),
    enabled: Boolean(companyId && selectedProduct?.id),
  });

  const featuresQuery = useQuery({
    queryKey: ['features', companyId, selectedProduct?.id],
    queryFn: () => erpRepository.listFeatures(companyId!, selectedProduct!.id),
    enabled: Boolean(companyId && selectedProduct?.id),
  });

  const releasesQuery = useQuery({
    queryKey: ['releases', companyId, selectedProduct?.id],
    queryFn: () => erpRepository.listReleases(companyId!, selectedProduct!.id),
    enabled: Boolean(companyId && selectedProduct?.id),
  });

  const financeSummaryQuery = useQuery({
    queryKey: ['bu_finance_summary', companyId, selectedProduct?.business_unit_id],
    queryFn: () => erpRepository.listBusinessUnitFinanceSummary(companyId!, selectedProduct!.business_unit_id),
    enabled: Boolean(companyId && selectedProduct?.business_unit_id),
  });

  const resourceMembershipsQuery = useQuery({
    queryKey: ['resource_memberships', companyId],
    queryFn: () => erpRepository.listResourceMemberships(companyId!),
    enabled: Boolean(companyId),
  });

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);
  const memberRecordMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const unitMap = useMemo(() => new Map(businessUnits.map((b) => [b.id, b])), [businessUnits]);

  const milestones = milestonesQuery.data ?? [];
  const features = featuresQuery.data ?? [];
  const releases = releasesQuery.data ?? [];

  const productTasks = useMemo(
    () => (selectedProduct ? allTasks.filter((t) => t.product_id === selectedProduct.id) : []),
    [allTasks, selectedProduct]
  );

  const productBugs = useMemo(
    () => productTasks.filter((t) => t.task_type === 'bug'),
    [productTasks]
  );

  const productDevTasks = useMemo(
    () => productTasks.filter((t) => t.task_type !== 'bug'),
    [productTasks]
  );

  const productProjects = useMemo(
    () => (selectedProduct ? allProjects.filter((p) => p.product_id === selectedProduct.id) : []),
    [allProjects, selectedProduct]
  );

  const visibleProductTasks = useMemo(() => {
    if (taskFilterMode === 'bugs') return productBugs;
    if (taskFilterMode === 'dev') return productDevTasks;
    return productTasks;
  }, [taskFilterMode, productTasks, productBugs, productDevTasks]);

  const productAssignedMemberships = useMemo(() => {
    if (!selectedProduct) return [];
    return (resourceMembershipsQuery.data ?? []).filter(
      (rm) => rm.resource_type === 'product' && rm.resource_id === selectedProduct.id
    );
  }, [resourceMembershipsQuery.data, selectedProduct]);

  const unassignedMembers = useMemo(() => {
    const assignedSet = new Set(productAssignedMemberships.map((rm) => rm.user_id));
    return members.filter((m) => !assignedSet.has(m.id));
  }, [members, productAssignedMemberships]);

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      business_unit_id: businessUnits[0]?.id ?? '',
      code: '',
      name: '',
      category: 'saas',
      description: '',
      stage: 'development',
      health_status: 'on_track',
      progress_pct: 0,
      product_owner_id: '',
      tech_lead_id: '',
    },
  });

  const featureForm = useForm<FeatureFormValues>({
    resolver: zodResolver(featureFormSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      status: 'proposed',
      milestone_id: '',
      owner_id: '',
    },
  });

  const releaseForm = useForm<ReleaseFormValues>({
    resolver: zodResolver(releaseFormSchema),
    defaultValues: {
      version_tag: '',
      title: '',
      release_notes: '',
      environment: 'staging',
      status: 'planned',
      target_date: '',
      release_manager_id: currentUser?.id ?? '',
    },
  });

  const invalidateProductQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['milestones'] }),
      queryClient.invalidateQueries({ queryKey: ['features'] }),
      queryClient.invalidateQueries({ queryKey: ['releases'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['resource_memberships'] }),
      queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
    ]);
  };

  const openCreateProductModal = () => {
    setActionError(null);
    productForm.reset({
      business_unit_id: businessUnits[0]?.id ?? '',
      code: `PROD-${String(products.length + 1).padStart(2, '0')}`,
      name: '',
      category: 'saas',
      description: '',
      stage: 'discovery',
      health_status: 'on_track',
      progress_pct: 0,
      product_owner_id: currentUser?.id ?? '',
      tech_lead_id: '',
    });
    setProductModalMode('create');
  };

  const openEditProductModal = (prod: ProductRecord) => {
    setActionError(null);
    productForm.reset({
      business_unit_id: prod.business_unit_id,
      code: prod.code,
      name: prod.name,
      category: prod.category,
      description: prod.description ?? '',
      stage: prod.stage,
      health_status: prod.health_status,
      progress_pct: prod.progress_pct,
      product_owner_id: prod.product_owner_id ?? '',
      tech_lead_id: prod.tech_lead_id ?? '',
    });
    setProductModalMode('edit');
  };

  const saveProductMutation = useMutation({
    mutationFn: async (vals: ProductFormValues) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      const payload = {
        business_unit_id: vals.business_unit_id,
        code: vals.code,
        name: vals.name,
        category: vals.category,
        description: vals.description || null,
        stage: vals.stage as ProductStage,
        health_status: vals.health_status as ProductHealth,
        progress_pct: Math.min(100, Math.max(0, Math.round(vals.progress_pct))),
        product_owner_id: vals.product_owner_id || null,
        tech_lead_id: vals.tech_lead_id || null,
      };
      if (productModalMode === 'edit' && selectedProduct) {
        return erpRepository.updateProduct(currentUser.id, companyId, {
          ...payload,
          id: selectedProduct.id,
        });
      }
      return erpRepository.createProduct(currentUser.id, companyId, payload);
    },
    onSuccess: async (saved) => {
      await invalidateProductQueries();
      setProductModalMode('closed');
      setSelectedProductId(saved.id);
      setSearchParams({ product: saved.id });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to save product.');
    },
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedProduct || !msTitle.trim()) return;
      await erpRepository.createMilestone(currentUser.id, companyId, {
        product_id: selectedProduct.id,
        project_id: null,
        title: msTitle.trim(),
        description: msDesc.trim() || null,
        due_date: msDueDate || null,
        status: 'planned',
      });
    },
    onSuccess: async () => {
      setMsTitle('');
      setMsDueDate('');
      setMsDesc('');
      await invalidateProductQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to create roadmap milestone.');
    },
  });

  const updateMilestoneStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: MilestoneRecord['status'] }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateMilestoneStatus(currentUser.id, companyId, payload.id, payload.status);
    },
    onSuccess: async () => {
      await invalidateProductQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update milestone.');
    },
  });

  const createFeatureMutation = useMutation({
    mutationFn: async (vals: FeatureFormValues) => {
      if (!currentUser || !companyId || !selectedProduct) throw new Error('No active product.');
      await erpRepository.createFeature(currentUser.id, companyId, {
        product_id: selectedProduct.id,
        milestone_id: vals.milestone_id || null,
        title: vals.title,
        description: vals.description || null,
        priority: vals.priority as TaskPriority,
        status: vals.status as FeatureRecord['status'],
        owner_id: vals.owner_id || null,
      });
    },
    onSuccess: async () => {
      featureForm.reset({
        title: '',
        description: '',
        priority: 'medium',
        status: 'proposed',
        milestone_id: '',
        owner_id: '',
      });
      await invalidateProductQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to add feature.');
    },
  });

  const updateFeatureStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: FeatureRecord['status'] }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateFeatureStatus(currentUser.id, companyId, payload.id, payload.status);
    },
    onSuccess: async () => {
      await invalidateProductQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update feature status.');
    },
  });

  const createProductTaskMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedProduct || !newTaskTitle.trim()) return;
      await erpRepository.createTask(currentUser.id, companyId, {
        title: newTaskTitle.trim(),
        task_type: newTaskType,
        product_id: selectedProduct.id,
        assigned_to: newTaskAssignee || null,
        priority: newTaskPriority,
        status: 'todo',
      });
    },
    onSuccess: async () => {
      setNewTaskTitle('');
      await invalidateProductQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to log task/bug.');
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: TaskStatus }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateTask(currentUser.id, companyId, payload);
    },
    onSuccess: async () => {
      await invalidateProductQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update task status.');
    },
  });

  const createReleaseMutation = useMutation({
    mutationFn: async (vals: ReleaseFormValues) => {
      if (!currentUser || !companyId || !selectedProduct) throw new Error('No active product.');
      await erpRepository.createRelease(currentUser.id, companyId, {
        product_id: selectedProduct.id,
        version_tag: vals.version_tag,
        title: vals.title,
        release_notes: vals.release_notes || null,
        environment: vals.environment,
        status: vals.status,
        target_date: vals.target_date || null,
        release_manager_id: vals.release_manager_id || null,
      });
    },
    onSuccess: async () => {
      releaseForm.reset({
        version_tag: '',
        title: '',
        release_notes: '',
        environment: 'staging',
        status: 'planned',
        target_date: '',
        release_manager_id: currentUser?.id ?? '',
      });
      await invalidateProductQueries();
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to create release.');
    },
  });

  const updateReleaseStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: ReleaseRecord['status'] }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateReleaseStatus(currentUser.id, companyId, payload.id, payload.status);
    },
    onSuccess: async () => {
      await invalidateProductQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update release status.');
    },
  });

  const assignEmployeeToProductMutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      accessLevel: ResourceMembership['access_level'];
    }) => {
      if (!currentUser || !companyId || !selectedProduct) throw new Error('No active product.');
      await erpRepository.upsertResourceMembership(currentUser.id, companyId, {
        user_id: payload.userId,
        resource_type: 'product',
        resource_id: selectedProduct.id,
        access_level: payload.accessLevel,
      });
    },
    onSuccess: async () => {
      setAssignMemberId('');
      await queryClient.invalidateQueries({ queryKey: ['resource_memberships'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to assign employee to product.');
    },
  });

  const removeEmployeeFromProductMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.removeResourceMembership(currentUser.id, companyId, membershipId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resource_memberships'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to remove employee from product.');
    },
  });

  const selectedBu = selectedProduct ? unitMap.get(selectedProduct.business_unit_id) : undefined;
  const financeCurrency = selectedBu?.budget_currency ?? 'INR';
  const fin = financeSummaryQuery.data ?? {
    actualRevenueMinor: 0,
    actualExpensesMinor: 0,
    plannedExpensesMinor: 0,
    forecastRevenueMinor: 0,
  };

  const openBugCount = productBugs.filter((b) => b.status !== 'completed' && b.status !== 'cancelled').length;
  const openDevCount = productDevTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;
  const releasedFeaturesCount = features.filter((f) => f.status === 'released').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Product Workspaces · {products.length} product{products.length === 1 ? '' : 's'} tracked
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Product Management
          </h1>
        </div>

        {canManageProducts ? (
          <button
            type="button"
            onClick={openCreateProductModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            New Product
          </button>
        ) : null}
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

      {productsQuery.isLoading ? (
        <div className="h-64 rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
      ) : !selectedProduct ? (
        <EmptyState
          icon={Package}
          title="No products configured"
          description="Create your first product workspace (such as WrindhaOS, Speed N Tension, or Business OS) to manage roadmaps, features, bugs, and releases."
          action={
            canManageProducts ? (
              <button
                type="button"
                onClick={openCreateProductModal}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Product
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Product Switcher Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((prod) => {
              const isSelected = prod.id === selectedProduct.id;
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    setSelectedProductId(prod.id);
                    setSearchParams({ product: prod.id });
                  }}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-[#0B3B66] bg-[#0B3B66] text-white dark:border-sky-500 dark:bg-[#102847]'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-[#1E3252] dark:bg-[#0C1729] dark:hover:border-sky-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-mono ${isSelected ? 'text-sky-200' : 'text-slate-500 dark:text-slate-400'}`}>
                      {prod.code}
                    </span>
                    <span className={`font-mono tabular-nums font-semibold ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {prod.progress_pct}%
                    </span>
                  </div>
                  <div className={`mt-1.5 font-display text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                    {prod.name}
                  </div>
                  <div className={`mt-1 text-[11px] capitalize ${isSelected ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    {prod.stage} · {prod.health_status.replace('_', ' ')}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Product Workspace Header */}
          <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-[#1E3252]">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{selectedProduct.code}</span>
                  <span>·</span>
                  <span>{selectedBu?.name ?? 'Business Unit'}</span>
                  <span>·</span>
                  <span className="capitalize">{selectedProduct.stage}</span>
                  <span>·</span>
                  <StatusText
                    tone={HEALTH_TONES[selectedProduct.health_status]}
                    label={selectedProduct.health_status.replace('_', ' ').toUpperCase()}
                  />
                </div>
                <h2 className="mt-1.5 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  {selectedProduct.name} Workspace
                </h2>
                {selectedProduct.description ? (
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {selectedProduct.description}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Owner / Tech Lead</div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {selectedProduct.product_owner_id ? memberMap.get(selectedProduct.product_owner_id) ?? '—' : 'Unassigned'}
                    {selectedProduct.tech_lead_id
                      ? ` · ${memberMap.get(selectedProduct.tech_lead_id) ?? '—'}`
                      : ''}
                  </div>
                </div>
                {canManageProducts ? (
                  <button
                    type="button"
                    onClick={() => openEditProductModal(selectedProduct)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Configure
                  </button>
                ) : null}
              </div>
            </div>

            {/* Workspace Sub-Navigation Tabs */}
            <div className="mt-4 flex flex-wrap gap-1">
              {(
                [
                  { id: 'overview', label: 'Product Dashboard' },
                  { id: 'roadmap', label: `Roadmap (${milestones.length})` },
                  { id: 'features', label: `Features (${features.length})` },
                  { id: 'tasks', label: `Dev Tasks & Bugs (${productTasks.length})` },
                  { id: 'releases', label: `Testing & Releases (${releases.length})` },
                  { id: 'operations', label: 'Marketing, Feedback & Docs' },
                ] as Array<{ id: WorkspaceTab; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#0B3B66] text-white dark:bg-sky-600'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#13233C]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {/* TAB 1: PRODUCT DASHBOARD */}
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <MetricBox
                  label="Product Progress"
                  value={`${selectedProduct.progress_pct}%`}
                  subtext={`Stage: ${selectedProduct.stage}`}
                  icon={Package}
                />
                <MetricBox
                  label="Features"
                  value={`${releasedFeaturesCount}/${features.length}`}
                  subtext="Released of scoped"
                  icon={Layers}
                />
                <MetricBox
                  label="Open Dev Tasks"
                  value={String(openDevCount)}
                  subtext={`${productDevTasks.length} total tasks`}
                  icon={CheckSquare}
                />
                <MetricBox
                  label="Open Bugs"
                  value={String(openBugCount)}
                  subtext={openBugCount > 0 ? 'Active bug queue' : 'Zero open bugs'}
                  tone={openBugCount > 0 ? 'critical' : 'nominal'}
                  icon={Bug}
                />
                <MetricBox
                  label="Releases"
                  value={String(releases.length)}
                  subtext={`${releases.filter((r) => r.status === 'released').length} shipped`}
                  icon={Rocket}
                />
              </div>

              {/* Revenue & Expenses from Business Unit Ledger */}
              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Unit Revenue & Expenses ({selectedBu?.name ?? 'Business Unit'})
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Currency: {financeCurrency} · Approved ledger records
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Actual Revenue (Approved)</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatMinorCurrency(fin.actualRevenueMinor, financeCurrency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Actual Expenses (Approved)</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatMinorCurrency(fin.actualExpensesMinor, financeCurrency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Planned Expenses</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMinorCurrency(fin.plannedExpensesMinor, financeCurrency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Forecast Revenue</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMinorCurrency(fin.forecastRevenueMinor, financeCurrency)}
                    </div>
                  </div>
                </div>
              </section>

              {/* Product Team & Assigned Employees */}
              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Product Team &amp; Assigned Employees ({productAssignedMemberships.length})
                    </h3>
                  </div>
                  {canManageTeam ? (
                    <Link
                      to="/team"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Create Employee in Team →
                    </Link>
                  ) : null}
                </div>

                {canManageTeam ? (
                  <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]">
                    <select
                      aria-label="Select employee to assign"
                      value={assignMemberId}
                      onChange={(e) => setAssignMemberId(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-900 sm:col-span-6 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                    >
                      <option value="">
                        {unassignedMembers.length === 0
                          ? 'All company employees are assigned'
                          : `Select employee to add to ${selectedProduct.name}...`}
                      </option>
                      {unassignedMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} — {m.job_title} ({m.employee_code})
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Product role level"
                      value={assignAccessLevel}
                      onChange={(e) =>
                        setAssignAccessLevel(e.target.value as ResourceMembership['access_level'])
                      }
                      className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-900 sm:col-span-3 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                    >
                      <option value="contributor">Contributor</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                    <button
                      type="button"
                      disabled={!assignMemberId || assignEmployeeToProductMutation.isPending}
                      onClick={() =>
                        assignEmployeeToProductMutation.mutate({
                          userId: assignMemberId,
                          accessLevel: assignAccessLevel,
                        })
                      }
                      className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-40 sm:col-span-3 dark:bg-sky-600 dark:hover:bg-sky-500"
                    >
                      {assignEmployeeToProductMutation.isPending ? 'Assigning...' : 'Assign Employee'}
                    </button>
                  </div>
                ) : null}

                {productAssignedMemberships.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No employees assigned to {selectedProduct.name} yet.
                    {canManageTeam
                      ? ' Use the selector above or create an employee in Team to assign them here.'
                      : ''}
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-[#1E3252] dark:text-slate-400">
                          <th className="py-2 pr-4 font-medium">Employee</th>
                          <th className="py-2 pr-4 font-medium">Job Title</th>
                          <th className="py-2 pr-4 font-medium">Work Email</th>
                          <th className="py-2 pr-4 font-medium">Product Access</th>
                          {canManageTeam ? <th className="py-2 text-right font-medium">Actions</th> : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                        {productAssignedMemberships.map((rm) => {
                          const member = memberRecordMap.get(rm.user_id);
                          return (
                            <tr key={rm.id}>
                              <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">
                                <Link
                                  to={`/team?member=${rm.user_id}`}
                                  className="hover:underline"
                                >
                                  {member?.full_name ?? rm.user_id}
                                </Link>
                              </td>
                              <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                                {member?.job_title ?? '—'}
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {member?.email ?? '—'}
                              </td>
                              <td className="py-2.5 pr-4">
                                {canManageTeam ? (
                                  <select
                                    aria-label={`Access level for ${member?.full_name ?? rm.user_id}`}
                                    value={rm.access_level}
                                    onChange={(e) =>
                                      assignEmployeeToProductMutation.mutate({
                                        userId: rm.user_id,
                                        accessLevel: e.target.value as ResourceMembership['access_level'],
                                      })
                                    }
                                    className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
                                  >
                                    <option value="contributor">Contributor</option>
                                    <option value="manager">Manager</option>
                                    <option value="owner">Owner</option>
                                  </select>
                                ) : (
                                  <span className="capitalize text-slate-700 dark:text-slate-300">
                                    {rm.access_level}
                                  </span>
                                )}
                              </td>
                              {canManageTeam ? (
                                <td className="py-2.5 text-right">
                                  <button
                                    type="button"
                                    disabled={removeEmployeeFromProductMutation.isPending}
                                    onClick={() => removeEmployeeFromProductMutation.mutate(rm.id)}
                                    className="text-[11px] font-medium text-red-700 hover:underline dark:text-red-400"
                                  >
                                    Remove
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Linked Projects & Recent Activity */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Linked Delivery Projects ({productProjects.length})
                    </h3>
                    <Link to="/projects" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                      Manage Projects →
                    </Link>
                  </div>
                  {productProjects.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No projects linked to {selectedProduct.name} yet.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                      {productProjects.map((proj) => (
                        <li key={proj.id} className="flex items-center justify-between py-2.5">
                          <div>
                            <Link to={`/projects?project=${proj.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                              {proj.code} · {proj.name}
                            </Link>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Due {proj.due_date ?? 'TBD'}
                            </div>
                          </div>
                          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {proj.progress_pct}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Active Bug Queue ({openBugCount})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskFilterMode('bugs');
                        setActiveTab('tasks');
                      }}
                      className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                    >
                      Open Bug Tracker →
                    </button>
                  </div>
                  {openBugCount === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No open bugs reported for {selectedProduct.name}.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                      {productBugs
                        .filter((b) => b.status !== 'completed' && b.status !== 'cancelled')
                        .slice(0, 5)
                        .map((bug) => (
                          <li key={bug.id} className="flex items-center justify-between py-2.5">
                            <Link to={`/tasks?task=${bug.id}`} className="truncate font-medium text-slate-900 hover:underline dark:text-white">
                              {bug.title}
                            </Link>
                            <StatusText
                              tone={bug.priority === 'critical' ? 'critical' : 'warning'}
                              label={bug.priority.toUpperCase()}
                            />
                          </li>
                        ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {/* TAB 2: ROADMAP & MILESTONES */}
          {activeTab === 'roadmap' ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <MilestoneIcon className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedProduct.name} Roadmap Milestones
                </h3>
              </div>

              {canManageProducts ? (
                <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]">
                  <input
                    value={msTitle}
                    onChange={(e) => setMsTitle(e.target.value)}
                    placeholder="Milestone title (e.g. Q2 Public Beta)"
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <input
                    value={msDesc}
                    onChange={(e) => setMsDesc(e.target.value)}
                    placeholder="Scope summary..."
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <input
                    type="date"
                    value={msDueDate}
                    onChange={(e) => setMsDueDate(e.target.value)}
                    className="h-8 rounded border border-slate-200 bg-white px-2 font-mono text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <button
                    type="button"
                    disabled={!msTitle.trim() || createMilestoneMutation.isPending}
                    onClick={() => createMilestoneMutation.mutate()}
                    className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-40 sm:col-span-2 dark:bg-sky-600"
                  >
                    Add Milestone
                  </button>
                </div>
              ) : null}

              {milestones.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No roadmap milestones recorded for {selectedProduct.name} yet.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {milestones.map((ms) => (
                    <li key={ms.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{ms.title}</div>
                        {ms.description ? (
                          <div className="mt-0.5 text-slate-500 dark:text-slate-400">{ms.description}</div>
                        ) : null}
                        <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          Target: {ms.due_date ?? 'Unscheduled'}
                        </div>
                      </div>
                      {canManageProducts ? (
                        <select
                          value={ms.status}
                          onChange={(e) =>
                            updateMilestoneStatusMutation.mutate({
                              id: ms.id,
                              status: e.target.value as MilestoneRecord['status'],
                            })
                          }
                          className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                        >
                          <option value="planned">Planned</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="missed">Missed</option>
                        </select>
                      ) : (
                        <StatusText
                          tone={ms.status === 'missed' ? 'critical' : ms.status === 'completed' ? 'nominal' : 'neutral'}
                          label={ms.status.replace('_', ' ')}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {/* TAB 3: FEATURES */}
          {activeTab === 'features' ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <Layers className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Product Features ({features.length})
                </h3>
              </div>

              {canManageProducts ? (
                <form
                  onSubmit={featureForm.handleSubmit((vals) => createFeatureMutation.mutate(vals))}
                  className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]"
                >
                  <input
                    {...featureForm.register('title')}
                    placeholder="Feature title..."
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <select
                    {...featureForm.register('priority')}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    {...featureForm.register('milestone_id')}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="">No milestone</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                  <select
                    {...featureForm.register('owner_id')}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="">Owner (Optional)</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={createFeatureMutation.isPending}
                    className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white sm:col-span-2 dark:bg-sky-600"
                  >
                    Add Feature
                  </button>
                </form>
              ) : null}

              {features.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No features scoped for {selectedProduct.name} yet.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-[#1E3252] dark:text-slate-400">
                        <th className="py-2 pr-4 font-medium">Feature</th>
                        <th className="py-2 pr-4 font-medium">Priority</th>
                        <th className="py-2 pr-4 font-medium">Owner</th>
                        <th className="py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                      {features.map((f) => (
                        <tr key={f.id}>
                          <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{f.title}</td>
                          <td className="py-2.5 pr-4">
                            <StatusText
                              tone={f.priority === 'critical' ? 'critical' : f.priority === 'high' ? 'warning' : 'neutral'}
                              label={f.priority}
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                            {f.owner_id ? memberMap.get(f.owner_id) ?? '—' : 'Unassigned'}
                          </td>
                          <td className="py-2.5">
                            {canManageProducts ? (
                              <select
                                value={f.status}
                                onChange={(e) =>
                                  updateFeatureStatusMutation.mutate({
                                    id: f.id,
                                    status: e.target.value as FeatureRecord['status'],
                                  })
                                }
                                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                              >
                                <option value="proposed">Proposed</option>
                                <option value="scoped">Scoped</option>
                                <option value="in_development">In Development</option>
                                <option value="testing">Testing</option>
                                <option value="released">Released</option>
                                <option value="deferred">Deferred</option>
                              </select>
                            ) : (
                              <span className="capitalize text-slate-700 dark:text-slate-300">
                                {f.status.replace('_', ' ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {/* TAB 4: DEVELOPMENT TASKS & BUG TRACKING */}
          {activeTab === 'tasks' ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Development Tasks & Bug Tracking
                  </h3>
                </div>
                <div className="flex items-center gap-1 rounded border border-slate-200 p-0.5 dark:border-[#1E3252]">
                  {(
                    [
                      { id: 'all', label: `All (${productTasks.length})` },
                      { id: 'dev', label: `Dev (${productDevTasks.length})` },
                      { id: 'bugs', label: `Bugs (${productBugs.length})` },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setTaskFilterMode(mode.id)}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                        taskFilterMode === mode.id
                          ? 'bg-[#0B3B66] text-white dark:bg-sky-600'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {canManageTasks ? (
                <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]">
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder={`Log task or bug for ${selectedProduct.name}...`}
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="task">Dev Task</option>
                    <option value="bug">Bug</option>
                    <option value="improvement">Improvement</option>
                    <option value="research">Research</option>
                  </select>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!newTaskTitle.trim() || createProductTaskMutation.isPending}
                    onClick={() => createProductTaskMutation.mutate()}
                    className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-40 sm:col-span-2 dark:bg-sky-600"
                  >
                    Log Item
                  </button>
                </div>
              ) : null}

              {visibleProductTasks.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No tasks or bugs logged for {selectedProduct.name} in this filter.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-[#1E3252] dark:text-slate-400">
                        <th className="py-2 pr-4 font-medium">Type</th>
                        <th className="py-2 pr-4 font-medium">Title</th>
                        <th className="py-2 pr-4 font-medium">Priority</th>
                        <th className="py-2 pr-4 font-medium">Assignee</th>
                        <th className="py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                      {visibleProductTasks.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2.5 pr-4 font-mono text-[11px] uppercase text-slate-500 dark:text-slate-400">
                            {t.task_type}
                          </td>
                          <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">
                            <Link to={`/tasks?task=${t.id}`} className="hover:underline">
                              {t.title}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusText
                              tone={t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'warning' : 'neutral'}
                              label={t.priority}
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                            {t.assigned_to ? memberMap.get(t.assigned_to) ?? '—' : 'Unassigned'}
                          </td>
                          <td className="py-2.5">
                            <select
                              value={t.status}
                              onChange={(e) =>
                                updateTaskStatusMutation.mutate({
                                  id: t.id,
                                  status: e.target.value as TaskStatus,
                                })
                              }
                              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                            >
                              <option value="backlog">Backlog</option>
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="blocked">Blocked</option>
                              <option value="in_review">In Review</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {/* TAB 5: TESTING & RELEASES */}
          {activeTab === 'releases' ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <Rocket className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Testing & Releases ({releases.length})
                </h3>
              </div>

              {canManageProducts ? (
                <form
                  onSubmit={releaseForm.handleSubmit((vals) => createReleaseMutation.mutate(vals))}
                  className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]"
                >
                  <input
                    {...releaseForm.register('version_tag')}
                    placeholder="v1.0.0"
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 font-mono text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <input
                    {...releaseForm.register('title')}
                    placeholder="Release title..."
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-4 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <select
                    {...releaseForm.register('environment')}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="alpha">Alpha</option>
                    <option value="beta">Beta</option>
                    <option value="staging">Staging / QA</option>
                    <option value="production">Production</option>
                  </select>
                  <input
                    type="date"
                    {...releaseForm.register('target_date')}
                    className="h-8 rounded border border-slate-200 bg-white px-2 font-mono text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <button
                    type="submit"
                    disabled={createReleaseMutation.isPending}
                    className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white sm:col-span-2 dark:bg-sky-600"
                  >
                    Schedule Release
                  </button>
                </form>
              ) : null}

              {releases.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No releases scheduled or shipped for {selectedProduct.name} yet.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-[#1E3252] dark:text-slate-400">
                        <th className="py-2 pr-4 font-medium">Version</th>
                        <th className="py-2 pr-4 font-medium">Title</th>
                        <th className="py-2 pr-4 font-medium">Environment</th>
                        <th className="py-2 pr-4 font-medium">Target Date</th>
                        <th className="py-2 font-medium">QA / Release Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                      {releases.map((rel) => (
                        <tr key={rel.id}>
                          <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900 dark:text-white">
                            {rel.version_tag}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-800 dark:text-slate-200">{rel.title}</td>
                          <td className="py-2.5 pr-4 capitalize text-slate-600 dark:text-slate-300">
                            {rel.environment}
                          </td>
                          <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {rel.target_date ?? 'TBD'}
                          </td>
                          <td className="py-2.5">
                            {canManageProducts ? (
                              <select
                                value={rel.status}
                                onChange={(e) =>
                                  updateReleaseStatusMutation.mutate({
                                    id: rel.id,
                                    status: e.target.value as ReleaseRecord['status'],
                                  })
                                }
                                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                              >
                                <option value="planned">Planned</option>
                                <option value="in_qa">In QA</option>
                                <option value="ready">Ready</option>
                                <option value="released">Released</option>
                                <option value="rolled_back">Rolled Back</option>
                              </select>
                            ) : (
                              <StatusText
                                tone={rel.status === 'released' ? 'nominal' : rel.status === 'rolled_back' ? 'critical' : 'neutral'}
                                label={rel.status.replace('_', ' ')}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {/* TAB 6: MARKETING, CUSTOMER FEEDBACK & PRODUCT DOCS */}
          {activeTab === 'operations' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Marketing & Research Tasks
                </h3>
                {productTasks.filter((t) => t.task_type === 'research').length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    No research or go-to-market tasks logged for {selectedProduct.name}. Log tasks with type &ldquo;Research&rdquo; in Dev Tasks & Bugs to track launch campaigns.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                    {productTasks
                      .filter((t) => t.task_type === 'research')
                      .map((rt) => (
                        <li key={rt.id} className="py-2">
                          <Link to={`/tasks?task=${rt.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                            {rt.title}
                          </Link>
                          <div className="text-[11px] capitalize text-slate-500">{rt.status.replace('_', ' ')}</div>
                        </li>
                      ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Customer Feedback
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Client communication logs and account feedback feeds integrate with Client Services & CRM in Phase 4. Use Features (Proposed) or Bug Tracking to log verified product feedback today.
                </p>
                <Link
                  to="/client-services"
                  className="mt-4 inline-block text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  Open Client Services Blueprint →
                </Link>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900 dark:text-white">
                  <FileText className="h-4 w-4 text-slate-400" />
                  Product Documentation
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Private product specs, architecture docs, and release manuals will connect to the Supabase Storage Document Library in Phase 6.
                </p>
                <Link
                  to="/documents"
                  className="mt-4 inline-block text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  Open Document Library Blueprint →
                </Link>
              </section>
            </div>
          ) : null}
        </>
      )}

      {/* Create / Edit Product Modal */}
      {productModalMode !== 'closed' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {productModalMode === 'edit' ? 'Configure Product Workspace' : 'Create Product Workspace'}
              </h2>
              <button
                type="button"
                onClick={() => setProductModalMode('closed')}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={productForm.handleSubmit((vals) => saveProductMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Product Code *</label>
                <input
                  {...productForm.register('code')}
                  placeholder="PROD-APP"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Product Name *</label>
                <input
                  {...productForm.register('name')}
                  placeholder="New Product Name"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Business Unit *</label>
                <select
                  {...productForm.register('business_unit_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Category</label>
                <select
                  {...productForm.register('category')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="saas">SaaS</option>
                  <option value="mobile_game">Mobile Game</option>
                  <option value="business_software">Business Software</option>
                  <option value="platform">Platform</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  {...productForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Lifecycle Stage</label>
                <select
                  {...productForm.register('stage')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="discovery">Discovery</option>
                  <option value="development">Development</option>
                  <option value="beta">Beta</option>
                  <option value="live">Live</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="sunsetting">Sunsetting</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Health Status</label>
                <select
                  {...productForm.register('health_status')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Product Owner (CPO / PM)</label>
                <select
                  {...productForm.register('product_owner_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Tech Lead (CTO / Eng)</label>
                <select
                  {...productForm.register('tech_lead_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Overall Progress (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  {...productForm.register('progress_pct', { valueAsNumber: true })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setProductModalMode('closed')}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveProductMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
                >
                  {saveProductMutation.isPending ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricBox({
  label,
  value,
  subtext,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtext: string;
  icon: typeof Package;
  tone?: 'nominal' | 'critical' | 'neutral';
}) {
  const toneClass =
    tone === 'critical'
      ? 'text-red-700 dark:text-red-400'
      : tone === 'nominal'
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-slate-900 dark:text-white';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtext}</div>
    </div>
  );
}

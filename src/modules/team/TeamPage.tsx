import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowUpDown,
  Building,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generateRandomNumberPassword } from '../../lib/authCredentials';
import { erpRepository } from '../../services/erpRepository';
import type { Department, EmploymentType, MemberStatus, ResourceMembership, TeamMemberRecord } from '../../types/erp';
import { ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

const createMemberSchema = z.object({
  employee_code: z.string().min(2, 'Employee code is required (e.g. EMP-010).'),
  full_name: z.string().min(2, 'Full name is required.'),
  email: z.string().email('Valid email address is required.'),
  job_title: z.string().min(2, 'Job title is required.'),
  department_id: z.string().optional(),
  primary_business_unit_id: z.string().optional(),
  manager_id: z.string().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'executive']),
  status: z.enum(['active', 'on_leave', 'onboarding', 'suspended', 'offboarded']),
  location: z.string().optional(),
  timezone: z.string().min(1),
  initial_role_id: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  must_change_password: z.boolean(),
});

type CreateMemberForm = z.infer<typeof createMemberSchema>;

const editMemberSchema = z.object({
  full_name: z.string().min(2, 'Full name is required.'),
  job_title: z.string().min(2, 'Job title is required.'),
  department_id: z.string().optional(),
  primary_business_unit_id: z.string().optional(),
  manager_id: z.string().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'executive']),
  status: z.enum(['active', 'on_leave', 'onboarding', 'suspended', 'offboarded']),
  location: z.string().optional(),
  phone: z.string().optional(),
});

type EditMemberForm = z.infer<typeof editMemberSchema>;

const departmentSchema = z.object({
  code: z.string().min(2, 'Department code is required.'),
  name: z.string().min(2, 'Department name is required.'),
  description: z.string().optional(),
  business_unit_id: z.string().optional(),
  head_profile_id: z.string().optional(),
});

type DepartmentForm = z.infer<typeof departmentSchema>;

type TeamTab = 'directory' | 'departments' | 'hierarchy';
type SortField = 'full_name' | 'employee_code' | 'status' | 'joined_at';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 8;

export function TeamPage() {
  const { profile: currentUser, companyId, hasPermission, minRoleTier, isPreviewMode } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TeamTab>('directory');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [buFilter, setBuFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('employee_code');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(searchParams.get('member'));
  const [createOpen, setCreateOpen] = useState(false);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(true);
  const [passwordManuallyEdited, setPasswordManuallyEdited] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    fullName: string;
    email: string;
    password: string;
    title: string;
  } | null>(null);
  const [credentialsCopied, setCredentialsCopied] = useState(false);
  const [selectedCreateProducts, setSelectedCreateProducts] = useState<
    Array<{ product_id: string; access_level: ResourceMembership['access_level'] }>
  >([]);
  const [productAssignAccessLevel, setProductAssignAccessLevel] =
    useState<ResourceMembership['access_level']>('contributor');

  useEffect(() => {
    const paramId = searchParams.get('member');
    if (paramId) setSelectedMemberId(paramId);
  }, [searchParams]);

  const canManageTeam = hasPermission('team.manage');
  const canAssignRoles = hasPermission('roles.assign');

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

  const businessUnitsQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const rbacQuery = useQuery({
    queryKey: ['roles_permissions', companyId],
    queryFn: () => erpRepository.getRolesAndPermissions(companyId!),
    enabled: Boolean(companyId),
  });

  const credentialStatusesQuery = useQuery({
    queryKey: ['credential_statuses', companyId],
    queryFn: () => erpRepository.listCredentialStatuses(companyId!),
    enabled: Boolean(companyId && canManageTeam),
  });

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId),
  });

  const membershipsQuery = useQuery({
    queryKey: ['resource_memberships', companyId, selectedMemberId],
    queryFn: () => erpRepository.listResourceMemberships(companyId!, selectedMemberId ?? undefined),
    enabled: Boolean(companyId && selectedMemberId),
  });

  const members = teamQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const businessUnits = businessUnitsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const roles = rbacQuery.data?.roles ?? [];
  const selectedMemberships = membershipsQuery.data ?? [];
  const buMemberships = useMemo(
    () => selectedMemberships.filter((rm) => rm.resource_type === 'business_unit'),
    [selectedMemberships]
  );
  const productMemberships = useMemo(
    () => selectedMemberships.filter((rm) => rm.resource_type === 'product'),
    [selectedMemberships]
  );
  const credentialStatusMap = useMemo(
    () => new Map((credentialStatusesQuery.data ?? []).map((c) => [c.user_id, c])),
    [credentialStatusesQuery.data]
  );

  const assignableRoles = useMemo(
    () => roles.filter((r) => r.is_assignable && r.role_tier >= minRoleTier),
    [roles, minRoleTier]
  );

  const filteredMembers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = members.filter((m) => {
      if (departmentFilter !== 'all' && m.department_id !== departmentFilter) return false;
      if (buFilter !== 'all' && m.primary_business_unit_id !== buFilter) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (q) {
        const hay = `${m.full_name} ${m.email} ${m.employee_code} ${m.job_title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      const cmp = String(valA).localeCompare(String(valB));
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [members, searchTerm, departmentFilter, buFilter, statusFilter, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedMembers = filteredMembers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedMember: TeamMemberRecord | null = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const createForm = useForm<CreateMemberForm>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: {
      employee_code: '',
      full_name: '',
      email: '',
      job_title: '',
      department_id: '',
      primary_business_unit_id: '',
      manager_id: '',
      employment_type: 'full_time',
      status: 'active',
      location: '',
      timezone: 'UTC',
      initial_role_id: '',
      password: generateRandomNumberPassword('team_member'),
      must_change_password: true,
    },
  });

  const editForm = useForm<EditMemberForm>({
    resolver: zodResolver(editMemberSchema),
  });

  const deptForm = useForm<DepartmentForm>({
    resolver: zodResolver(departmentSchema),
  });

  const openEditMember = (member: TeamMemberRecord) => {
    editForm.reset({
      full_name: member.full_name,
      job_title: member.job_title,
      department_id: member.department_id ?? '',
      primary_business_unit_id: member.primary_business_unit_id ?? '',
      manager_id: member.manager_id ?? '',
      employment_type: member.employment_type,
      status: member.status,
      location: member.location ?? '',
      phone: member.phone ?? '',
    });
    setEditMemberOpen(true);
  };

  const openCreateDept = () => {
    setEditingDept(null);
    deptForm.reset({ code: '', name: '', description: '', business_unit_id: '', head_profile_id: '' });
    setDeptModalOpen(true);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    deptForm.reset({
      code: dept.code,
      name: dept.name,
      description: dept.description ?? '',
      business_unit_id: dept.business_unit_id ?? '',
      head_profile_id: dept.head_profile_id ?? '',
    });
    setDeptModalOpen(true);
  };

  const createMemberMutation = useMutation({
    mutationFn: async (values: CreateMemberForm) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      return erpRepository.createTeamMember(currentUser.id, companyId, {
        employee_code: values.employee_code,
        full_name: values.full_name,
        email: values.email,
        job_title: values.job_title,
        department_id: values.department_id || null,
        primary_business_unit_id: values.primary_business_unit_id || null,
        manager_id: values.manager_id || null,
        employment_type: values.employment_type as EmploymentType,
        status: values.status as MemberStatus,
        location: values.location || null,
        timezone: values.timezone,
        initial_role_id: values.initial_role_id || null,
        password: values.password,
        must_change_password: values.must_change_password,
        product_assignments: selectedCreateProducts,
      });
    },
    onSuccess: async ({ profile: created, issuedPassword }) => {
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      await queryClient.invalidateQueries({ queryKey: ['credential_statuses'] });
      await queryClient.invalidateQueries({ queryKey: ['resource_memberships'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
      setCreateOpen(false);
      setPasswordManuallyEdited(false);
      setSelectedCreateProducts([]);
      createForm.reset({
        employee_code: '',
        full_name: '',
        email: '',
        job_title: '',
        department_id: '',
        primary_business_unit_id: '',
        manager_id: '',
        employment_type: 'full_time',
        status: 'active',
        location: '',
        timezone: 'UTC',
        initial_role_id: '',
        password: generateRandomNumberPassword('team_member'),
        must_change_password: true,
      });
      setSelectedMemberId(created.id);
      setActionError(null);
      setActionSuccess(`Added ${created.full_name} and provisioned login credentials.`);
      if (issuedPassword) {
        setCredentialsCopied(false);
        setIssuedCredentials({
          title: 'Account & Credentials Provisioned',
          fullName: created.full_name,
          email: created.email,
          password: issuedPassword,
        });
      }
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to add team member.');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (target: TeamMemberRecord) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      const res = await erpRepository.resetMemberPassword(currentUser.id, companyId, target.id);
      return { target, ...res };
    },
    onSuccess: async ({ target, email, temporaryPassword }) => {
      await queryClient.invalidateQueries({ queryKey: ['credential_statuses'] });
      setActionError(null);
      setActionSuccess(`Issued new temporary password for ${target.full_name}.`);
      setCredentialsCopied(false);
      setIssuedCredentials({
        title: 'Temporary Password Issued',
        fullName: target.full_name,
        email,
        password: temporaryPassword,
      });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to reset user password.');
    },
  });

  const editMemberMutation = useMutation({
    mutationFn: async (values: EditMemberForm) => {
      if (!currentUser || !companyId || !selectedMember) throw new Error('Missing member context.');
      return erpRepository.updateTeamMember(currentUser.id, companyId, {
        id: selectedMember.id,
        full_name: values.full_name,
        job_title: values.job_title,
        department_id: values.department_id || null,
        primary_business_unit_id: values.primary_business_unit_id || null,
        manager_id: values.manager_id || null,
        employment_type: values.employment_type,
        status: values.status,
        availability: selectedMember.availability,
        phone: values.phone || null,
        location: values.location || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
      setEditMemberOpen(false);
      setActionError(null);
      setActionSuccess('Team member profile updated.');
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to update member.');
    },
  });

  const saveDeptMutation = useMutation({
    mutationFn: async (values: DepartmentForm) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      if (editingDept) {
        return erpRepository.updateDepartment(currentUser.id, companyId, {
          id: editingDept.id,
          code: values.code,
          name: values.name,
          description: values.description || null,
          business_unit_id: values.business_unit_id || null,
          head_profile_id: values.head_profile_id || null,
        });
      }
      return erpRepository.createDepartment(currentUser.id, companyId, {
        code: values.code,
        name: values.name,
        description: values.description || null,
        business_unit_id: values.business_unit_id || null,
        head_profile_id: values.head_profile_id || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      setDeptModalOpen(false);
      setActionError(null);
      setActionSuccess(editingDept ? 'Department updated.' : 'Department created.');
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to save department.');
    },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (deptId: string) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      await erpRepository.deleteDepartment(currentUser.id, companyId, deptId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      setDeletingDept(null);
      setActionError(null);
      setActionSuccess('Department deleted.');
    },
    onError: (err) => {
      setDeletingDept(null);
      setActionError(err instanceof Error ? err.message : 'Unable to delete department.');
    },
  });

  const addBuAssignmentMutation = useMutation({
    mutationFn: async ({ userId, buId, accessLevel }: { userId: string; buId: string; accessLevel: ResourceMembership['access_level'] }) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      return erpRepository.upsertResourceMembership(currentUser.id, companyId, {
        user_id: userId,
        resource_type: 'business_unit',
        resource_id: buId,
        access_level: accessLevel,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resource_memberships'] });
      setActionError(null);
      setActionSuccess('Business unit assignment saved.');
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to save assignment.');
    },
  });

  const removeBuAssignmentMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      await erpRepository.removeResourceMembership(currentUser.id, companyId, membershipId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resource_memberships'] });
    },
  });

  const addProductAssignmentMutation = useMutation({
    mutationFn: async ({
      userId,
      productId,
      accessLevel,
    }: {
      userId: string;
      productId: string;
      accessLevel: ResourceMembership['access_level'];
    }) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      return erpRepository.upsertResourceMembership(currentUser.id, companyId, {
        user_id: userId,
        resource_type: 'product',
        resource_id: productId,
        access_level: accessLevel,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resource_memberships'] });
      setActionError(null);
      setActionSuccess('Product assignment saved.');
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Unable to save product assignment.');
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      await erpRepository.assignRoleToUser(currentUser.id, companyId, userId, roleId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      setActionError(null);
      setActionSuccess('Role assigned and audit logged.');
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Role assignment blocked.');
    },
  });

  const revokeRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      if (!currentUser || !companyId) throw new Error('No authenticated actor.');
      await erpRepository.revokeRoleFromUser(currentUser.id, companyId, userId, roleId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      setActionError(null);
      setActionSuccess('Role revoked.');
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Role revocation blocked.');
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Build hierarchy roots (members with no manager or whose manager isn't in company list)
  const hierarchyTree = useMemo(() => {
    const idSet = new Set(members.map((m) => m.id));
    const childrenMap = new Map<string | null, TeamMemberRecord[]>();
    for (const m of members) {
      const parentKey = m.manager_id && idSet.has(m.manager_id) ? m.manager_id : null;
      const list = childrenMap.get(parentKey) ?? [];
      list.push(m);
      childrenMap.set(parentKey, list);
    }
    return childrenMap;
  }, [members]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Organization & Governance · {members.length} team profile{members.length === 1 ? '' : 's'} · {departments.length} departments
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Team Management
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {canManageTeam && activeTab === 'departments' ? (
            <button
              type="button"
              onClick={openCreateDept}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Department
            </button>
          ) : null}
          {canManageTeam && activeTab !== 'departments' ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setPasswordManuallyEdited(false);
                setSelectedCreateProducts([]);
                createForm.setValue('password', generateRandomNumberPassword('team_member'));
                setCreateOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Team Member
            </button>
          ) : null}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-[#1E3252] dark:bg-[#091221]">
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'directory'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Directory
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('departments')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'departments'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Building className="h-3.5 w-3.5" />
          Departments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('hierarchy')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'hierarchy'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Reporting Hierarchy
        </button>
      </div>

      {actionError ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {actionSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {actionSuccess}
        </div>
      ) : null}

      {/* TAB 1: DIRECTORY */}
      {activeTab === 'directory' ? (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, code, title..."
                aria-label="Search team directory"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 focus:border-[#0B3B66] focus:bg-white focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by department"
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={buFilter}
              onChange={(e) => {
                setBuFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by business unit"
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
            >
              <option value="all">All Business Units</option>
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by member status"
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="onboarding">Onboarding</option>
              <option value="suspended">Suspended</option>
              <option value="offboarded">Offboarded</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className={selectedMember ? 'xl:col-span-8' : 'xl:col-span-12'}>
              {teamQuery.isLoading ? (
                <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
              ) : filteredMembers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No matching team members"
                  description="Adjust your search or filters to locate members in the company directory."
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('employee_code')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                              Code <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('full_name')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                              Member <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-4 py-3">Department / Unit</th>
                          <th className="px-4 py-3">Roles</th>
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                              Status <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                        {paginatedMembers.map((m) => {
                          const isSelected = selectedMember?.id === m.id;
                          return (
                            <tr
                              key={m.id}
                              onClick={() => {
                                setSelectedMemberId(m.id);
                                setSearchParams({ member: m.id });
                              }}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-sky-50/70 dark:bg-[#132948]'
                                  : 'hover:bg-slate-50 dark:hover:bg-[#102038]'
                              }`}
                            >
                              <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                                {m.employee_code}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900 dark:text-white">{m.full_name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {m.job_title} · {m.email}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                                <div>{m.department_name ?? 'Unassigned Dept'}</div>
                                <div className="text-slate-500 dark:text-slate-400">
                                  {m.business_unit_name ?? 'Company-Wide'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs font-medium text-[#0B3B66] dark:text-sky-400">
                                {m.roles.map((r) => r.name).join(' · ') || 'No Role'}
                              </td>
                              <td className="px-4 py-3">
                                <StatusText
                                  tone={m.status === 'active' ? 'nominal' : m.status === 'suspended' || m.status === 'offboarded' ? 'critical' : 'warning'}
                                  label={m.status.replace('_', ' ')}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-[#1E3252] dark:text-slate-400">
                    <span className="font-mono tabular-nums">
                      Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredMembers.length)} of {filteredMembers.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-[#1E3252] dark:hover:bg-[#13233C]"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-2 font-mono tabular-nums">
                        {safePage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-[#1E3252] dark:hover:bg-[#13233C]"
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Selected Member Profile, Assignments & Role Inspector */}
            {selectedMember ? (
              <aside className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729] xl:col-span-4">
                <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                  <div>
                    <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedMember.employee_code}
                    </p>
                    <h2 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                      {selectedMember.full_name}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{selectedMember.job_title}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canManageTeam ? (
                      <button
                        type="button"
                        onClick={() => openEditMember(selectedMember)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-[#13233C] dark:hover:text-slate-200"
                        aria-label="Edit member profile"
                        title="Edit profile"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMemberId(null);
                        setSearchParams({});
                      }}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#13233C]"
                      aria-label="Close member profile"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">{selectedMember.email}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500 dark:text-slate-400">Department</dt>
                    <dd className="text-slate-900 dark:text-white">{selectedMember.department_name ?? 'Unassigned'}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500 dark:text-slate-400">Primary Business Unit</dt>
                    <dd className="text-slate-900 dark:text-white">{selectedMember.business_unit_name ?? 'Company-Wide'}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500 dark:text-slate-400">Reports To</dt>
                    <dd className="text-slate-900 dark:text-white">{selectedMember.manager_name ?? 'Top Level'}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500 dark:text-slate-400">Availability</dt>
                    <dd className="capitalize text-slate-900 dark:text-white">
                      {selectedMember.availability.replace('_', ' ')}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500 dark:text-slate-400">Joined</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">{selectedMember.joined_at}</dd>
                  </div>
                </dl>

                {/* Business Unit Resource Assignments */}
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Unit & Resource Assignments
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {buMemberships.length === 0 ? (
                      <li className="text-xs text-slate-500 dark:text-slate-400">No secondary unit assignments.</li>
                    ) : (
                      buMemberships.map((rm) => {
                        const bu = businessUnits.find((b) => b.id === rm.resource_id);
                        return (
                          <li
                            key={rm.id}
                            className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-[#1E3252] dark:bg-[#091221]"
                          >
                            <span>
                              <span className="font-medium text-slate-900 dark:text-white">
                                {bu?.name ?? rm.resource_id}
                              </span>
                              <span className="ml-2 text-slate-500">({rm.access_level})</span>
                            </span>
                            {canManageTeam ? (
                              <button
                                type="button"
                                onClick={() => removeBuAssignmentMutation.mutate(rm.id)}
                                className="text-[11px] text-red-700 hover:underline dark:text-red-400"
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>

                  {canManageTeam ? (
                    <select
                      aria-label="Add business unit assignment"
                      defaultValue=""
                      onChange={(e) => {
                        const buId = e.target.value;
                        if (!buId) return;
                        addBuAssignmentMutation.mutate({
                          userId: selectedMember.id,
                          buId,
                          accessLevel: 'contributor',
                        });
                        e.target.value = '';
                      }}
                      className="mt-2.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                    >
                      <option value="">Assign to business unit...</option>
                      {businessUnits.map((bu) => (
                        <option key={bu.id} value={bu.id}>
                          {bu.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                {/* Product Assignments */}
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <Package className="h-3.5 w-3.5 text-[#0B3B66] dark:text-sky-400" />
                    Product Assignments
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {productMemberships.length === 0 ? (
                      <li className="text-xs text-slate-500 dark:text-slate-400">
                        Not assigned to any product workspace yet.
                      </li>
                    ) : (
                      productMemberships.map((rm) => {
                        const prod = products.find((p) => p.id === rm.resource_id);
                        return (
                          <li
                            key={rm.id}
                            className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-[#1E3252] dark:bg-[#091221]"
                          >
                            <span>
                              <span className="font-medium text-slate-900 dark:text-white">
                                {prod ? `${prod.name} (${prod.code})` : rm.resource_id}
                              </span>
                              <span className="ml-2 text-slate-500 capitalize">({rm.access_level})</span>
                            </span>
                            {canManageTeam ? (
                              <button
                                type="button"
                                onClick={() => removeBuAssignmentMutation.mutate(rm.id)}
                                className="text-[11px] text-red-700 hover:underline dark:text-red-400"
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>

                  {canManageTeam ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <select
                        aria-label="Product assignment access level"
                        value={productAssignAccessLevel}
                        onChange={(e) =>
                          setProductAssignAccessLevel(e.target.value as ResourceMembership['access_level'])
                        }
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                      >
                        <option value="contributor">Contributor</option>
                        <option value="manager">Manager</option>
                        <option value="owner">Owner</option>
                      </select>
                      <select
                        aria-label="Add product assignment"
                        defaultValue=""
                        onChange={(e) => {
                          const productId = e.target.value;
                          if (!productId) return;
                          addProductAssignmentMutation.mutate({
                            userId: selectedMember.id,
                            productId,
                            accessLevel: productAssignAccessLevel,
                          });
                          e.target.value = '';
                        }}
                        className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                      >
                        <option value="">Assign to product...</option>
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name} ({prod.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                {/* Role Assignment Section */}
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Assigned Roles</h3>
                  <ul className="mt-2 space-y-2">
                    {selectedMember.roles.length === 0 ? (
                      <li className="text-xs text-slate-500 dark:text-slate-400">No roles assigned.</li>
                    ) : (
                      selectedMember.roles.map((role) => (
                        <li
                          key={role.id}
                          className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-[#1E3252] dark:bg-[#091221]"
                        >
                          <span>
                            <strong className="font-medium text-slate-900 dark:text-white">{role.name}</strong>
                            <span className="ml-2 font-mono text-[11px] text-slate-500">Tier {role.role_tier}</span>
                          </span>
                          {canAssignRoles && selectedMember.id !== currentUser?.id ? (
                            <button
                              type="button"
                              onClick={() =>
                                revokeRoleMutation.mutate({ userId: selectedMember.id, roleId: role.id })
                              }
                              className="text-[11px] font-medium text-red-700 hover:underline dark:text-red-400"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>

                  {canAssignRoles ? (
                    selectedMember.id === currentUser?.id ? (
                      <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                        Separation of duties: you cannot modify your own role assignments.
                      </p>
                    ) : (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          aria-label="Assign role"
                          defaultValue=""
                          onChange={(e) => {
                            const roleId = e.target.value;
                            if (!roleId) return;
                            assignRoleMutation.mutate({ userId: selectedMember.id, roleId });
                            e.target.value = '';
                          }}
                          className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                        >
                          <option value="">Assign additional role...</option>
                          {assignableRoles
                            .filter((r) => !selectedMember.roles.some((mr) => mr.id === r.id))
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} (Tier {r.role_tier})
                              </option>
                            ))}
                        </select>
                      </div>
                    )
                  ) : null}
                </div>

                {/* Authentication & Credentials Section */}
                {canManageTeam ? (
                  <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                        <KeyRound className="h-3.5 w-3.5 text-[#0B3B66] dark:text-sky-400" />
                        Authentication &amp; Access
                      </h3>
                      <StatusText
                        tone={credentialStatusMap.get(selectedMember.id)?.has_credentials ? 'nominal' : 'warning'}
                        label={credentialStatusMap.get(selectedMember.id)?.has_credentials ? 'Active' : 'Unset'}
                      />
                    </div>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">Last Sign-In</dt>
                        <dd className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {credentialStatusMap.get(selectedMember.id)?.last_login_at
                            ? new Date(credentialStatusMap.get(selectedMember.id)!.last_login_at!).toLocaleString()
                            : 'Never signed in'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">Password Policy</dt>
                        <dd className="text-[11px] text-slate-700 dark:text-slate-300">
                          {credentialStatusMap.get(selectedMember.id)?.must_change_password
                            ? 'Rotation pending on login'
                            : 'Up to date'}
                        </dd>
                      </div>
                    </dl>
                    {selectedMember.id !== currentUser?.id ? (
                      <button
                        type="button"
                        disabled={resetPasswordMutation.isPending}
                        onClick={() => resetPasswordMutation.mutate(selectedMember)}
                        className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200 dark:hover:bg-[#13233C]"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {resetPasswordMutation.isPending
                          ? 'Generating...'
                          : 'Reset Password (Generate Random)'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </aside>
            ) : null}
          </div>
        </>
      ) : null}

      {/* TAB 2: DEPARTMENTS */}
      {activeTab === 'departments' ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Business Unit</th>
                  <th className="px-5 py-3">Department Head</th>
                  <th className="px-5 py-3 text-right">Members</th>
                  {canManageTeam ? <th className="px-5 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {departments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageTeam ? 6 : 5}
                      className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      No departments created yet. Add your organization&apos;s departments to structure reporting and teams.
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => {
                    const head = members.find((m) => m.id === dept.head_profile_id);
                    const bu = businessUnits.find((b) => b.id === dept.business_unit_id);
                    const count = members.filter((m) => m.department_id === dept.id).length;
                    return (
                      <tr key={dept.id} className="hover:bg-slate-50 dark:hover:bg-[#102038]">
                        <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{dept.code}</td>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{dept.name}</div>
                          {dept.description ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400">{dept.description}</div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                          {bu?.name ?? 'Company-Wide'}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                          {head?.full_name ?? 'Unassigned'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
                          {count}
                        </td>
                        {canManageTeam ? (
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => openEditDept(dept)}
                                className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingDept(dept)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* TAB 3: REPORTING HIERARCHY */}
      {activeTab === 'hierarchy' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="border-b border-slate-100 pb-4 dark:border-[#1E3252]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Organizational Reporting Hierarchy
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Computed from each team profile's <code className="font-mono">manager_id</code> reporting link. Click any member to inspect or edit their manager.
            </p>
          </div>
          <div className="mt-5 space-y-3">
            {(hierarchyTree.get(null) ?? []).map((rootMember) => (
              <HierarchyNode
                key={rootMember.id}
                member={rootMember}
                childrenMap={hierarchyTree}
                depth={0}
                onSelect={(id) => {
                  setSelectedMemberId(id);
                  setActiveTab('directory');
                  setSearchParams({ member: id });
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Add Team Member Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Create Team Profile
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!isPreviewMode ? (
              <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
                Production Supabase mode active: creating an employee invokes the <code className="font-mono">create-team-member</code> Supabase Edge Function to provision <code className="font-mono">auth.users</code>, profile, role, and product memberships.
              </div>
            ) : null}

            <form
              onSubmit={createForm.handleSubmit((vals) => createMemberMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Employee Code *</label>
                <input
                  {...createForm.register('employee_code')}
                  placeholder="EMP-010"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {createForm.formState.errors.employee_code ? (
                  <p className="mt-1 text-[11px] text-red-600">{createForm.formState.errors.employee_code.message}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
                <input
                  {...createForm.register('full_name')}
                  placeholder="Full name"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {createForm.formState.errors.full_name ? (
                  <p className="mt-1 text-[11px] text-red-600">{createForm.formState.errors.full_name.message}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Work Email *</label>
                <input
                  type="email"
                  {...createForm.register('email')}
                  placeholder="member@company.com"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Job Title *</label>
                <input
                  {...createForm.register('job_title')}
                  placeholder="Software Engineer"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Department</label>
                <select
                  {...createForm.register('department_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Primary Business Unit</label>
                <select
                  {...createForm.register('primary_business_unit_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Company-Wide</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Reporting Manager</label>
                <select
                  {...createForm.register('manager_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None (Top Level)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name} ({m.job_title})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Initial Role</label>
                <select
                  {...createForm.register('initial_role_id', {
                    onChange: (e) => {
                      if (passwordManuallyEdited) return;
                      const pickedRole = roles.find((r) => r.id === e.target.value);
                      createForm.setValue(
                        'password',
                        generateRandomNumberPassword(pickedRole?.slug ?? 'team_member'),
                        { shouldValidate: true }
                      );
                    },
                  })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">No initial role</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} (Tier {r.role_tier})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Employment Type</label>
                <select
                  {...createForm.register('employment_type')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contractor">Contractor</option>
                  <option value="executive">Executive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Location</label>
                <input
                  {...createForm.register('location')}
                  placeholder="Headquarters / Remote"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3.5 sm:col-span-2 dark:border-[#1E3252] dark:bg-[#091221]">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <KeyRound className="h-3.5 w-3.5 text-[#0B3B66] dark:text-sky-400" />
                    Authentication Password (Random Numeric Format) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const roleId = createForm.getValues('initial_role_id');
                      const pickedRole = roles.find((r) => r.id === roleId);
                      setPasswordManuallyEdited(false);
                      createForm.setValue(
                        'password',
                        generateRandomNumberPassword(pickedRole?.slug ?? 'team_member'),
                        { shouldValidate: true }
                      );
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </button>
                </div>
                <div className="relative mt-2">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    {...createForm.register('password', {
                      onChange: () => setPasswordManuallyEdited(true),
                    })}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white pr-9 pl-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                  >
                    {showCreatePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {createForm.formState.errors.password ? (
                  <p className="mt-1 text-[11px] text-red-600">{createForm.formState.errors.password.message}</p>
                ) : null}
                <label className="mt-2.5 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    {...createForm.register('must_change_password')}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B3B66]"
                  />
                  Prompt user to change password after first sign-in
                </label>
              </div>

              {products.length > 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3.5 sm:col-span-2 dark:border-[#1E3252] dark:bg-[#091221]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <Package className="h-3.5 w-3.5 text-[#0B3B66] dark:text-sky-400" />
                      Assign to Products
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedCreateProducts.length} selected
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {products.map((prod) => {
                      const existing = selectedCreateProducts.find((item) => item.product_id === prod.id);
                      const checked = Boolean(existing);
                      return (
                        <div
                          key={prod.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                        >
                          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-900 dark:text-white">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCreateProducts((prev) => [
                                    ...prev,
                                    { product_id: prod.id, access_level: 'contributor' },
                                  ]);
                                } else {
                                  setSelectedCreateProducts((prev) =>
                                    prev.filter((item) => item.product_id !== prod.id)
                                  );
                                }
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B3B66]"
                            />
                            <span>{prod.name}</span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {prod.code}
                            </span>
                          </label>
                          {checked && existing ? (
                            <select
                              aria-label={`${prod.name} access level`}
                              value={existing.access_level}
                              onChange={(e) => {
                                const level = e.target.value as ResourceMembership['access_level'];
                                setSelectedCreateProducts((prev) =>
                                  prev.map((item) =>
                                    item.product_id === prod.id ? { ...item, access_level: level } : item
                                  )
                                );
                              }}
                              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                            >
                              <option value="contributor">Contributor</option>
                              <option value="manager">Manager</option>
                              <option value="owner">Owner</option>
                            </select>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMemberMutation.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {createMemberMutation.isPending ? 'Saving...' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Team Member Modal */}
      {editMemberOpen && selectedMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Edit Profile · {selectedMember.employee_code}
              </h2>
              <button type="button" onClick={() => setEditMemberOpen(false)} className="rounded p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={editForm.handleSubmit((vals) => editMemberMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
                <input
                  {...editForm.register('full_name')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Job Title *</label>
                <input
                  {...editForm.register('job_title')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Department</label>
                <select
                  {...editForm.register('department_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Primary Business Unit</label>
                <select
                  {...editForm.register('primary_business_unit_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Company-Wide</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Reporting Manager</label>
                <select
                  {...editForm.register('manager_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">None (Top Level)</option>
                  {members
                    .filter((m) => m.id !== selectedMember.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name} ({m.job_title})</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select
                  {...editForm.register('status')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="suspended">Suspended</option>
                  <option value="offboarded">Offboarded</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Location</label>
                <input
                  {...editForm.register('location')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Phone</label>
                <input
                  {...editForm.register('phone')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button type="button" onClick={() => setEditMemberOpen(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editMemberMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
                >
                  {editMemberMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Create/Edit Department Modal */}
      {deptModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {editingDept ? 'Edit Department' : 'Create Department'}
              </h2>
              <button type="button" onClick={() => setDeptModalOpen(false)} className="rounded p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={deptForm.handleSubmit((vals) => saveDeptMutation.mutate(vals))} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Code *</label>
                <input
                  {...deptForm.register('code')}
                  placeholder="QA"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Name *</label>
                <input
                  {...deptForm.register('name')}
                  placeholder="Quality Assurance"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Business Unit</label>
                <select
                  {...deptForm.register('business_unit_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Company-Wide</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Department Head</label>
                <select
                  {...deptForm.register('head_profile_id')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name} ({m.job_title})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  {...deptForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button type="button" onClick={() => setDeptModalOpen(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]">
                  Cancel
                </button>
                <button type="submit" disabled={saveDeptMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {saveDeptMutation.isPending ? 'Saving...' : 'Save Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {/* Issued Credentials Modal (One-Time Display) */}
      {issuedCredentials ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {issuedCredentials.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
                aria-label="Close credentials modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Share these sign-in credentials securely with <strong className="text-slate-900 dark:text-white">{issuedCredentials.fullName}</strong>. Passwords are stored as salted SHA-256 hashes and will not be shown again once dismissed.
            </p>

            <dl className="mt-4 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
              <div>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Work Email</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-white">
                  {issuedCredentials.email}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Assigned Password</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-[#0B3B66] dark:text-sky-400">
                  {issuedCredentials.password}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!navigator.clipboard) return;
                  await navigator.clipboard.writeText(
                    `Email: ${issuedCredentials.email}\nPassword: ${issuedCredentials.password}`
                  );
                  setCredentialsCopied(true);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
              >
                {credentialsCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {credentialsCopied ? 'Copied Details' : 'Copy Credentials'}
              </button>
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deletingDept)}
        title="Delete Department"
        description={
          deletingDept
            ? `Permanently delete the "${deletingDept.name}" department? Assigned team members will remain active with no department assigned.`
            : ''
        }
        isPending={deleteDeptMutation.isPending}
        onCancel={() => setDeletingDept(null)}
        onConfirm={() => {
          if (deletingDept) deleteDeptMutation.mutate(deletingDept.id);
        }}
      />
    </div>
  );
}

function HierarchyNode({
  member,
  childrenMap,
  depth,
  onSelect,
}: {
  member: TeamMemberRecord;
  childrenMap: Map<string | null, TeamMemberRecord[]>;
  depth: number;
  onSelect: (id: string) => void;
}) {
  const reports = childrenMap.get(member.id) ?? [];
  return (
    <div style={{ marginLeft: depth > 0 ? `${Math.min(depth * 24, 96)}px` : undefined }}>
      <button
        type="button"
        onClick={() => onSelect(member.id)}
        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-left transition-colors hover:bg-slate-100 dark:border-[#1E3252] dark:bg-[#091221] dark:hover:bg-[#13233C]"
      >
        <div>
          <span className="text-xs font-semibold text-slate-900 dark:text-white">{member.full_name}</span>
          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
            {member.job_title} · {member.department_name ?? 'No Dept'}
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#0B3B66] dark:text-sky-400">
          {reports.length} direct report{reports.length === 1 ? '' : 's'}
        </span>
      </button>
      {reports.length > 0 ? (
        <div className="mt-2 space-y-2">
          {reports.map((child) => (
            <HierarchyNode
              key={child.id}
              member={child}
              childrenMap={childrenMap}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

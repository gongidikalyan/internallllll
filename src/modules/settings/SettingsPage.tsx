import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Check, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BUSINESS_UNIT_LABELS } from '../../lib/navigation';
import { erpRepository } from '../../services/erpRepository';
import type { BusinessUnit, BusinessUnitStatus, BusinessUnitType } from '../../types/erp';
import { ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';
import { StatusText } from '../../components/ui/StatusText';

type SettingsTab = 'company' | 'business-units' | 'roles' | 'audit' | 'environment';

const companySchema = z.object({
  name: z.string().min(2, 'Display name is required.'),
  legal_name: z.string().min(2, 'Legal entity name is required.'),
  registration_number: z.string().optional(),
  tax_id: z.string().optional(),
  default_currency: z.string().length(3, 'Use 3-letter ISO currency code (e.g. INR).'),
  fiscal_year_start_month: z.number().int().min(1).max(12),
  timezone: z.string().min(2),
  headquarters_address: z.string().optional(),
  website_url: z.string().optional(),
  primary_contact_email: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  attendance_checkin_required: z.boolean(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

const buSchema = z.object({
  code: z.string().min(2, 'Unit code is required.'),
  name: z.string().min(2, 'Business unit name is required.'),
  unit_type: z.enum(['saas_product', 'mobile_game', 'business_software', 'client_services', 'internal_ops', 'other']),
  description: z.string().optional(),
  status: z.enum(['active', 'incubating', 'paused', 'archived']),
  budget_currency: z.string().length(3, 'Use 3-letter currency code.'),
});

type BusinessUnitFormValues = z.infer<typeof buSchema>;

const roleSchema = z.object({
  name: z.string().min(2, 'Role name is required.'),
  slug: z.string().min(2, 'Slug is required.').regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, and underscores only.'),
  description: z.string().optional(),
  role_tier: z.number().int().min(1).max(100),
});

type RoleFormValues = z.infer<typeof roleSchema>;

export function SettingsPage() {
  const { profile, companyId, hasPermission, minRoleTier, isPreviewMode, refreshSessionProfile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'company';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [buModalOpen, setBuModalOpen] = useState(false);
  const [editingBu, setEditingBu] = useState<BusinessUnit | null>(null);
  const [deletingBu, setDeletingBu] = useState<BusinessUnit | null>(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  useEffect(() => {
    const paramTab = searchParams.get('tab') as SettingsTab | null;
    if (paramTab && ['company', 'business-units', 'roles', 'audit', 'environment'].includes(paramTab)) {
      setActiveTab(paramTab);
    }
  }, [searchParams]);

  const canManageCompany = hasPermission('settings.manage');
  const canManageBu = hasPermission('business_units.manage');
  const canViewRoles = hasPermission('roles.view');
  const canManageRoles = hasPermission('roles.manage');
  const canViewAudit = hasPermission('audit.view');

  const companyQuery = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => erpRepository.getCompany(companyId!),
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
    enabled: Boolean(companyId) && canViewRoles,
  });

  const auditQuery = useQuery({
    queryKey: ['audit_logs', companyId],
    queryFn: () => erpRepository.listAuditLogs(companyId!),
    enabled: Boolean(companyId) && canViewAudit && activeTab === 'audit',
  });

  const companyForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    values: companyQuery.data
      ? {
          name: companyQuery.data.name,
          legal_name: companyQuery.data.legal_name,
          registration_number: companyQuery.data.registration_number ?? '',
          tax_id: companyQuery.data.tax_id ?? '',
          default_currency: companyQuery.data.default_currency,
          fiscal_year_start_month: companyQuery.data.fiscal_year_start_month,
          timezone: companyQuery.data.timezone,
          headquarters_address: companyQuery.data.headquarters_address ?? '',
          website_url: companyQuery.data.website_url ?? '',
          primary_contact_email: companyQuery.data.primary_contact_email ?? '',
          attendance_checkin_required: companyQuery.data.attendance_checkin_required,
        }
      : undefined,
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      if (!profile || !companyId) throw new Error('No authenticated actor.');
      return erpRepository.updateCompany(profile.id, companyId, {
        ...values,
        registration_number: values.registration_number || null,
        tax_id: values.tax_id || null,
        headquarters_address: values.headquarters_address || null,
        website_url: values.website_url || null,
        primary_contact_email: values.primary_contact_email || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['company'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
      setFeedback({ type: 'success', text: 'Company profile updated.' });
    },
    onError: (err) => {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save company profile.' });
    },
  });

  const buForm = useForm<BusinessUnitFormValues>({
    resolver: zodResolver(buSchema),
    defaultValues: {
      code: '',
      name: '',
      unit_type: 'saas_product',
      description: '',
      status: 'active',
      budget_currency: 'INR',
    },
  });

  const openCreateBu = () => {
    setEditingBu(null);
    buForm.reset({
      code: '',
      name: '',
      unit_type: 'saas_product',
      description: '',
      status: 'active',
      budget_currency: companyQuery.data?.default_currency ?? 'INR',
    });
    setBuModalOpen(true);
  };

  const openEditBu = (bu: BusinessUnit) => {
    setEditingBu(bu);
    buForm.reset({
      code: bu.code,
      name: bu.name,
      unit_type: bu.unit_type,
      description: bu.description ?? '',
      status: bu.status,
      budget_currency: bu.budget_currency,
    });
    setBuModalOpen(true);
  };

  const saveBuMutation = useMutation({
    mutationFn: async (values: BusinessUnitFormValues) => {
      if (!profile || !companyId) throw new Error('No authenticated actor.');
      if (editingBu) {
        return erpRepository.updateBusinessUnit(profile.id, companyId, {
          id: editingBu.id,
          code: values.code,
          name: values.name,
          unit_type: values.unit_type as BusinessUnitType,
          description: values.description || null,
          status: values.status as BusinessUnitStatus,
          budget_currency: values.budget_currency,
        });
      }
      return erpRepository.createBusinessUnit(profile.id, companyId, {
        code: values.code,
        name: values.name,
        unit_type: values.unit_type as BusinessUnitType,
        description: values.description || null,
        status: values.status as BusinessUnitStatus,
        budget_currency: values.budget_currency,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['business_units'] });
      setBuModalOpen(false);
      setFeedback({ type: 'success', text: editingBu ? 'Business unit updated.' : 'Business unit created.' });
    },
    onError: (err) => {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save business unit.' });
    },
  });

  const deleteBuMutation = useMutation({
    mutationFn: async (buId: string) => {
      if (!profile || !companyId) throw new Error('No authenticated actor.');
      await erpRepository.deleteBusinessUnit(profile.id, companyId, buId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['business_units'] });
      setDeletingBu(null);
      setFeedback({ type: 'success', text: 'Business unit deleted.' });
    },
    onError: (err) => {
      setDeletingBu(null);
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to delete business unit.' });
    },
  });

  const roleForm = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      role_tier: Math.max(20, minRoleTier),
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (values: RoleFormValues) => {
      if (!profile || !companyId) throw new Error('No authenticated actor.');
      return erpRepository.createRole(profile.id, companyId, {
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        role_tier: values.role_tier,
        permission_ids: [],
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['roles_permissions'] });
      setRoleModalOpen(false);
      roleForm.reset();
      setSelectedRoleId(created.id);
      setFeedback({ type: 'success', text: `Role "${created.name}" created. Configure its permissions below.` });
    },
    onError: (err) => {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to create role.' });
    },
  });

  const togglePermMutation = useMutation({
    mutationFn: async ({ roleId, permissionId, enabled }: { roleId: string; permissionId: string; enabled: boolean }) => {
      if (!profile || !companyId) throw new Error('No authenticated actor.');
      await erpRepository.toggleRolePermission(profile.id, companyId, roleId, permissionId, enabled);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles_permissions'] });
      await refreshSessionProfile();
    },
    onError: (err) => {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Permission update denied.' });
    },
  });

  const rolesList = rbacQuery.data?.roles ?? [];
  const permissionsList = rbacQuery.data?.permissions ?? [];
  const rolePermsList = rbacQuery.data?.rolePermissions ?? [];

  const activeRole = useMemo(() => {
    if (rolesList.length === 0) return null;
    return rolesList.find((r) => r.id === selectedRoleId) ?? rolesList[0];
  }, [rolesList, selectedRoleId]);

  const activeRolePermSet = useMemo(() => {
    if (!activeRole) return new Set<string>();
    return new Set(rolePermsList.filter((rp) => rp.role_id === activeRole.id).map((rp) => rp.permission_id));
  }, [activeRole, rolePermsList]);

  const switchTab = (tab: SettingsTab) => {
    setFeedback(null);
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Company Administration & Security Governance
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Settings & Access Control
        </h1>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-[#1E3252] dark:bg-[#091221]">
        <TabButton active={activeTab === 'company'} onClick={() => switchTab('company')} label="Company Profile" />
        <TabButton active={activeTab === 'business-units'} onClick={() => switchTab('business-units')} label="Business Units" />
        {canViewRoles ? (
          <TabButton active={activeTab === 'roles'} onClick={() => switchTab('roles')} label="Roles & Permissions" />
        ) : null}
        {canViewAudit ? (
          <TabButton active={activeTab === 'audit'} onClick={() => switchTab('audit')} label="Audit Logs" />
        ) : null}
        <TabButton active={activeTab === 'environment'} onClick={() => switchTab('environment')} label="Environment" />
      </div>

      {feedback ? (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-md border px-4 py-3 text-xs ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
          }`}
        >
          {feedback.type === 'error' ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      {/* TAB 1: Company Profile */}
      {activeTab === 'company' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="border-b border-slate-100 pb-4 dark:border-[#1E3252]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Company Profile & Fiscal Policy
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Legal entity configuration, default reporting currency, and attendance policy.
            </p>
          </div>

          <form
            onSubmit={companyForm.handleSubmit((vals) => updateCompanyMutation.mutate(vals))}
            className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Workspace Name *
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('name')}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
              {companyForm.formState.errors.name ? (
                <p className="mt-1 text-[11px] text-red-600">{companyForm.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Legal Entity Name *
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('legal_name')}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Registration Number
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('registration_number')}
                placeholder="Optional"
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Tax / VAT ID
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('tax_id')}
                placeholder="Optional"
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Default Currency (ISO 4217) *
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('default_currency')}
                maxLength={3}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Fiscal Year Start Month (1–12)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                disabled={!canManageCompany}
                {...companyForm.register('fiscal_year_start_month', { valueAsNumber: true })}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Primary Contact Email
              </label>
              <input
                type="email"
                disabled={!canManageCompany}
                {...companyForm.register('primary_contact_email')}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Timezone
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('timezone')}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Headquarters Address
              </label>
              <input
                disabled={!canManageCompany}
                {...companyForm.register('headquarters_address')}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:bg-slate-100 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:disabled:bg-[#091221]"
              />
            </div>

            <div className="flex items-center gap-2.5 md:col-span-2">
              <input
                id="attendance-policy"
                type="checkbox"
                disabled={!canManageCompany}
                {...companyForm.register('attendance_checkin_required')}
                className="h-4 w-4 rounded border-slate-300 text-[#0B3B66]"
              />
              <label htmlFor="attendance-policy" className="text-xs text-slate-700 dark:text-slate-300">
                Require daily check-in and check-out logging in Attendance & Leave module
              </label>
            </div>

            {canManageCompany ? (
              <div className="flex justify-end border-t border-slate-100 pt-4 md:col-span-2 dark:border-[#1E3252]">
                <button
                  type="submit"
                  disabled={updateCompanyMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-5 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {updateCompanyMutation.isPending ? 'Saving...' : 'Save Company Profile'}
                </button>
              </div>
            ) : null}
          </form>
        </section>
      ) : null}

      {/* TAB 2: Business Units */}
      {activeTab === 'business-units' ? (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-[#1E3252]">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Business Units
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Manage initial units (WrindhaOS, Speed N Tension, Business OS, Client Services) and add new operating units.
              </p>
            </div>
            {canManageBu ? (
              <button
                type="button"
                onClick={openCreateBu}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Business Unit
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-6 py-3">Code</th>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Currency</th>
                  <th className="px-6 py-3">Status</th>
                  {canManageBu ? <th className="px-6 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {(businessUnitsQuery.data ?? []).map((bu) => (
                  <tr key={bu.id} className="hover:bg-slate-50 dark:hover:bg-[#102038]">
                    <td className="px-6 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{bu.code}</td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{bu.name}</div>
                      {bu.description ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{bu.description}</div>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {BUSINESS_UNIT_LABELS[bu.unit_type] ?? bu.unit_type}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {bu.budget_currency}
                    </td>
                    <td className="px-6 py-3">
                      <StatusText
                        tone={bu.status === 'active' ? 'nominal' : bu.status === 'paused' ? 'warning' : 'neutral'}
                        label={bu.status}
                      />
                    </td>
                    {canManageBu ? (
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEditBu(bu)}
                            className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingBu(bu)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* TAB 3: Roles & Permissions RBAC Matrix */}
      {activeTab === 'roles' && canViewRoles ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729] lg:col-span-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Organizational Roles ({rolesList.length})
              </h2>
              {canManageRoles ? (
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  <Plus className="h-3.5 w-3.5" /> New Role
                </button>
              ) : null}
            </div>
            <ul className="mt-3 space-y-1.5">
              {rolesList.map((role) => {
                const isSelected = activeRole?.id === role.id;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-[#0B3B66] bg-sky-50/70 dark:border-sky-500 dark:bg-[#132948]'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-[#1E3252] dark:hover:bg-[#102038]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{role.name}</span>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          Tier {role.role_tier}
                        </span>
                      </div>
                      {role.description ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400">
                          {role.description}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729] lg:col-span-8">
            {activeRole ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-4 dark:border-[#1E3252]">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                      <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                        {activeRole.name} Permissions
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {activeRole.description} · Tier {activeRole.role_tier} · {activeRolePermSet.size} active permissions
                    </p>
                  </div>
                  {canManageRoles && activeRole.role_tier < minRoleTier ? (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Read-only (Higher authority tier than your role)
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {permissionsList.map((perm) => {
                    const checked = activeRolePermSet.has(perm.id);
                    const editable = canManageRoles && activeRole.role_tier >= minRoleTier;
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-start justify-between gap-4 py-3 ${
                          editable ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-white">
                            <span>{perm.name}</span>
                            <code className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {perm.code}
                            </code>
                            {perm.is_sensitive ? (
                              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                · Sensitive
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {perm.description}
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!editable || togglePermMutation.isPending}
                          onChange={(e) =>
                            togglePermMutation.mutate({
                              roleId: activeRole.id,
                              permissionId: perm.id,
                              enabled: e.target.checked,
                            })
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#0B3B66]"
                        />
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* TAB 4: Audit Logs */}
      {activeTab === 'audit' && canViewAudit ? (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="border-b border-slate-200 px-6 py-4 dark:border-[#1E3252]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Security & Governance Audit Trail
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Append-only operational log of role assignments, company updates, and unit changes.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Actor</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Entity</th>
                  <th className="px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {(auditQuery.data ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-3 font-mono text-slate-500 dark:text-slate-400">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">
                      {entry.actor_name ?? entry.actor_id ?? 'System'}
                    </td>
                    <td className="px-6 py-3 font-mono text-[#0B3B66] dark:text-sky-400">{entry.action}</td>
                    <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{entry.entity_type}</td>
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {entry.after_state ? JSON.stringify(entry.after_state) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* TAB 5: Environment & Persistence Status */}
      {activeTab === 'environment' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-[#0B3B66] dark:text-sky-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Persistence & Environment Status
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {isPreviewMode
                  ? import.meta.env.VITE_SUPABASE_URL
                    ? `Target Supabase URL configured (${String(import.meta.env.VITE_SUPABASE_URL)}), waiting for VITE_SUPABASE_ANON_KEY. Using local browser storage until the public anon key is added.`
                    : 'Running in local storage mode. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect to Supabase PostgreSQL.'
                  : `Connected to Supabase PostgreSQL (${String(import.meta.env.VITE_SUPABASE_URL)}) with Supabase Auth and Row Level Security enabled.`}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              PostgreSQL Migrations Ready in Repository
            </div>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <li>supabase/migrations/0001_core_identity_and_org.sql</li>
              <li>supabase/migrations/0002_operations_products_finance_hr.sql</li>
              <li>supabase/migrations/0003_rls_and_security_functions.sql</li>
              <li>supabase/migrations/0004_seed_initial_data.sql</li>
              <li>supabase/migrations/0005_seed_finance_accounts_and_categories.sql</li>
              <li>supabase/migrations/0006_add_tasks_delete_policy.sql</li>
              <li>supabase/functions/create-team-member/index.ts</li>
            </ul>
          </div>

          {isPreviewMode ? (
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 dark:border-[#1E3252]">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Reset local workspace storage back to a clean slate (keeps only the 4 executive logins — CEO, CTO, CBO, CPO — along with core business units, products, and RBAC roles, clearing all added employees and operational records).
              </div>
              <button
                type="button"
                onClick={async () => {
                  erpRepository.resetPreviewDatabase();
                  await queryClient.invalidateQueries();
                  await refreshSessionProfile();
                  setFeedback({ type: 'success', text: 'Workspace storage reset to clean slate.' });
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset Local Storage
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Business Unit Create/Edit Modal */}
      {buModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {editingBu ? 'Edit Business Unit' : 'Create Business Unit'}
              </h2>
              <button
                type="button"
                onClick={() => setBuModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={buForm.handleSubmit((vals) => saveBuMutation.mutate(vals))} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Code *</label>
                <input
                  {...buForm.register('code')}
                  placeholder="NEW-UNIT"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Name *</label>
                <input
                  {...buForm.register('name')}
                  placeholder="Unit name"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    {...buForm.register('unit_type')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  >
                    <option value="saas_product">SaaS Product</option>
                    <option value="mobile_game">Mobile Gaming</option>
                    <option value="business_software">Business Software</option>
                    <option value="client_services">Client Services</option>
                    <option value="internal_ops">Internal Operations</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    {...buForm.register('status')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  >
                    <option value="active">Active</option>
                    <option value="incubating">Incubating</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Budget Currency</label>
                <input
                  {...buForm.register('budget_currency')}
                  maxLength={3}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  {...buForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setBuModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveBuMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
                >
                  {saveBuMutation.isPending ? 'Saving...' : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Custom Role Modal */}
      {roleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Create Organizational Role
              </h2>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={roleForm.handleSubmit((vals) => createRoleMutation.mutate(vals))} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Role Name *</label>
                <input
                  {...roleForm.register('name')}
                  placeholder="QA Lead"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Slug *</label>
                <input
                  {...roleForm.register('slug')}
                  placeholder="qa_lead"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
                {roleForm.formState.errors.slug ? (
                  <p className="mt-1 text-[11px] text-red-600">{roleForm.formState.errors.slug.message}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Authority Tier (1–100, must be ≥ {minRoleTier})
                </label>
                <input
                  type="number"
                  min={minRoleTier}
                  max={100}
                  {...roleForm.register('role_tier', { valueAsNumber: true })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  {...roleForm.register('description')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRoleMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
                >
                  {createRoleMutation.isPending ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deletingBu)}
        title="Delete Business Unit"
        description={
          deletingBu
            ? `Delete business unit "${deletingBu.name}" (${deletingBu.code})? Existing departments, projects, or members referencing it will be unlinked.`
            : ''
        }
        isPending={deleteBuMutation.isPending}
        onCancel={() => setDeletingBu(null)}
        onConfirm={() => {
          if (deletingBu) deleteBuMutation.mutate(deletingBu.id);
        }}
      />
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

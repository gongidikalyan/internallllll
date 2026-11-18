import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  generateRandomNumberPassword,
  generateSaltHex,
  hashPassword,
} from '../lib/authCredentials';
import type {
  AnnouncementItem,
  ApprovalHistoryRecord,
  ApprovalRequestRecord,
  ApprovalRequestType,
  ApprovalStatus,
  AttendanceRecord,
  AttendanceStatus,
  AuditLogEntry,
  BudgetRecord,
  BudgetStatus,
  BusinessUnit,
  BusinessUnitStatus,
  BusinessUnitType,
  CeoDashboardMetrics,
  ClientCommunication,
  ClientContact,
  ClientRecord,
  ClientStatus,
  CommunicationChannel,
  Company,
  ContractRecord,
  ContractStatus,
  CredentialStatusSummary,
  DecisionActionRecord,
  DecisionActionStatus,
  DecisionRecord,
  DecisionStatus,
  Department,
  DocumentAccessScope,
  DocumentCategory,
  DocumentRecord,
  EmploymentType,
  FeatureRecord,
  FinancialAccount,
  FinancialAccountType,
  FinancialCategory,
  FinancialFlowType,
  FinancialTransactionRecord,
  FinancialTransactionType,
  InvoicePaymentRecord,
  InvoiceRecord,
  LeadRecord,
  LeadStage,
  LeaveRequestRecord,
  LeaveStatus,
  LeaveType,
  MeetingNoteRecord,
  MeetingParticipantRecord,
  MeetingRecord,
  MeetingStatus,
  MeetingType,
  MemberStatus,
  MilestoneRecord,
  NotificationItem,
  Permission,
  ProductHealth,
  ProductRecord,
  ProductStage,
  Profile,
  ProjectMember,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  ProposalRecord,
  ProposalStatus,
  ReleaseRecord,
  ResourceMembership,
  Role,
  RolePermission,
  RsvpStatus,
  TaskActivityItem,
  TaskAttachment,
  TaskComment,
  TaskDependency,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  TaskType,
  TeamMemberRecord,
  UserRole,
} from '../types/erp';
import {
  loadPreviewState,
  resetPreviewState,
  savePreviewState,
  type PreviewDatabaseState,
} from './previewStore';

export interface UpdateCompanyInput {
  name: string;
  legal_name: string;
  registration_number?: string | null;
  tax_id?: string | null;
  default_currency: string;
  fiscal_year_start_month: number;
  timezone: string;
  headquarters_address?: string | null;
  website_url?: string | null;
  primary_contact_email?: string | null;
  attendance_checkin_required: boolean;
}

export interface CreateBusinessUnitInput {
  code: string;
  name: string;
  unit_type: BusinessUnitType;
  description?: string | null;
  status: BusinessUnitStatus;
  lead_profile_id?: string | null;
  budget_currency: string;
}

export interface UpdateBusinessUnitInput extends CreateBusinessUnitInput {
  id: string;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
  description?: string | null;
  business_unit_id?: string | null;
  head_profile_id?: string | null;
}

export interface UpdateDepartmentInput extends CreateDepartmentInput {
  id: string;
}

export interface CreateTeamMemberInput {
  employee_code: string;
  full_name: string;
  email: string;
  job_title: string;
  department_id?: string | null;
  primary_business_unit_id?: string | null;
  manager_id?: string | null;
  employment_type: EmploymentType;
  status: MemberStatus;
  location?: string | null;
  timezone: string;
  initial_role_id?: string | null;
  password?: string;
  must_change_password?: boolean;
  product_assignments?: Array<{
    product_id: string;
    access_level: ResourceMembership['access_level'];
  }>;
}

export interface CreateTeamMemberResult {
  profile: Profile;
  issuedPassword: string | null;
}

export interface UpdateTeamMemberInput {
  id: string;
  full_name: string;
  job_title: string;
  department_id?: string | null;
  primary_business_unit_id?: string | null;
  manager_id?: string | null;
  employment_type: EmploymentType;
  status: MemberStatus;
  availability: Profile['availability'];
  phone?: string | null;
  location?: string | null;
}

export interface CreateRoleInput {
  name: string;
  slug: string;
  description?: string | null;
  role_tier: number;
  permission_ids: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  task_type: TaskType;
  department_id?: string | null;
  project_id?: string | null;
  product_id?: string | null;
  assigned_to?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  start_date?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string | null;
  task_type?: TaskType;
  department_id?: string | null;
  project_id?: string | null;
  product_id?: string | null;
  assigned_to?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  start_date?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  completion_notes?: string | null;
}

export interface CreateProductInput {
  business_unit_id: string;
  code: string;
  name: string;
  category: ProductRecord['category'];
  description?: string | null;
  stage: ProductStage;
  health_status: ProductHealth;
  progress_pct: number;
  product_owner_id?: string | null;
  tech_lead_id?: string | null;
}

export interface UpdateProductInput extends CreateProductInput {
  id: string;
}

export interface CreateProjectInput {
  business_unit_id?: string | null;
  product_id?: string | null;
  client_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  owner_id?: string | null;
  project_manager_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  budget_minor: number;
  budget_currency: string;
  progress_pct: number;
}

export interface UpdateProjectInput extends CreateProjectInput {
  id: string;
}

export interface CreateLeadInput {
  business_unit_id?: string | null;
  organization_name: string;
  contact_name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  source?: string | null;
  stage: LeadStage;
  estimated_value_minor: number;
  currency_code: string;
  owner_id?: string | null;
  next_follow_up_at?: string | null;
  requirements_summary?: string | null;
}

export interface UpdateLeadInput {
  id: string;
  organization_name?: string;
  contact_name?: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  source?: string | null;
  stage?: LeadStage;
  estimated_value_minor?: number;
  currency_code?: string;
  owner_id?: string | null;
  next_follow_up_at?: string | null;
  requirements_summary?: string | null;
  lost_reason?: string | null;
}

export interface CreateClientInput {
  business_unit_id?: string | null;
  name: string;
  industry?: string | null;
  website?: string | null;
  billing_address?: string | null;
  account_owner_id?: string | null;
  status: ClientStatus;
}

export interface CreateProposalInput {
  lead_id?: string | null;
  client_id?: string | null;
  proposal_number: string;
  title: string;
  scope_summary: string;
  estimated_hours?: number | null;
  proposed_amount_minor: number;
  currency_code: string;
  valid_until?: string | null;
}

export interface CreateContractInput {
  client_id: string;
  proposal_id?: string | null;
  contract_number: string;
  title: string;
  contract_value_minor: number;
  currency_code: string;
  start_date: string;
  end_date?: string | null;
  status: ContractStatus;
}

export interface LogCommunicationInput {
  client_id?: string | null;
  lead_id?: string | null;
  channel: CommunicationChannel;
  subject: string;
  summary: string;
  communicated_at?: string;
}

export interface CreateMilestoneInput {
  project_id?: string | null;
  product_id?: string | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  status: MilestoneRecord['status'];
}

export interface CreateFeatureInput {
  product_id: string;
  milestone_id?: string | null;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: FeatureRecord['status'];
  owner_id?: string | null;
}

export interface CreateReleaseInput {
  product_id: string;
  version_tag: string;
  title: string;
  release_notes?: string | null;
  environment: ReleaseRecord['environment'];
  status: ReleaseRecord['status'];
  target_date?: string | null;
  release_manager_id?: string | null;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  severity: 'info' | 'advisory' | 'urgent';
  business_unit_id?: string | null;
}

export interface CreateFinancialAccountInput {
  code: string;
  name: string;
  account_type: FinancialAccountType;
  currency_code: string;
}

export interface CreateFinancialCategoryInput {
  code: string;
  name: string;
  flow_type: FinancialFlowType;
}

export interface CreateFinancialTransactionInput {
  business_unit_id?: string | null;
  project_id?: string | null;
  account_id: string;
  category_id: string;
  transaction_type: Exclude<FinancialTransactionType, 'reversal'>;
  amount_minor: number;
  currency_code: string;
  transaction_date: string;
  description: string;
  reference_number?: string | null;
  submit_for_approval?: boolean;
  assigned_approver_id?: string | null;
}

export interface CreateBudgetInput {
  business_unit_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  fiscal_year: number;
  name: string;
  allocated_minor: number;
  currency_code: string;
  status: Extract<BudgetStatus, 'draft' | 'pending_approval'>;
  assigned_approver_id?: string | null;
}

export interface CreateInvoiceInput {
  client_id: string;
  project_id?: string | null;
  business_unit_id?: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal_minor: number;
  tax_minor: number;
  currency_code: string;
  issue_immediately?: boolean;
}

export interface RecordInvoicePaymentInput {
  invoice_id: string;
  account_id: string;
  revenue_category_id?: string | null;
  amount_minor: number;
  payment_date: string;
  payment_method: string;
  reference_code?: string | null;
}

export interface CreateApprovalRequestInput {
  request_type: ApprovalRequestType;
  entity_type: string;
  entity_id?: string | null;
  title: string;
  summary?: string | null;
  assigned_approver_id?: string | null;
}

export interface CreateMeetingInput {
  business_unit_id?: string | null;
  project_id?: string | null;
  title: string;
  agenda?: string | null;
  meeting_type: MeetingType;
  scheduled_start: string;
  scheduled_end: string;
  location_or_link?: string | null;
  participant_ids?: string[];
}

export interface CreateDecisionInput {
  meeting_id?: string | null;
  business_unit_id?: string | null;
  title: string;
  context: string;
  outcome: string;
  status: DecisionStatus;
}

export interface CreateDecisionActionInput {
  decision_id: string;
  title: string;
  owner_id: string;
  due_date?: string | null;
}

export interface CheckInAttendanceInput {
  work_date: string;
  status: Extract<AttendanceStatus, 'present' | 'remote' | 'half_day'>;
  notes?: string | null;
}

export interface RecordAttendanceAdminInput {
  profile_id: string;
  work_date: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface CreateLeaveRequestInput {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason?: string | null;
  assigned_approver_id?: string | null;
}

export interface UploadDocumentInput {
  title: string;
  category: DocumentCategory;
  version_label: string;
  access_scope: DocumentAccessScope;
  business_unit_id?: string | null;
  product_id?: string | null;
  project_id?: string | null;
  file: File;
}

export interface UpdateDocumentMetadataInput {
  id: string;
  title: string;
  category: DocumentCategory;
  version_label: string;
  access_scope: DocumentAccessScope;
  business_unit_id?: string | null;
  product_id?: string | null;
  project_id?: string | null;
}

function getPreviewUserPermissions(state: PreviewDatabaseState, userId: string): Set<string> {
  const userRoleIds = new Set(
    state.user_roles.filter((ur) => ur.user_id === userId).map((ur) => ur.role_id)
  );
  const permIds = new Set(
    state.role_permissions
      .filter((rp) => userRoleIds.has(rp.role_id))
      .map((rp) => rp.permission_id)
  );
  const codes = new Set<string>();
  for (const p of state.permissions) {
    if (permIds.has(p.id)) {
      codes.add(p.code);
    }
  }
  return codes;
}

function getPreviewMinRoleTier(state: PreviewDatabaseState, userId: string): number {
  const roleIds = state.user_roles.filter((ur) => ur.user_id === userId).map((ur) => ur.role_id);
  const tiers = state.roles.filter((r) => roleIds.includes(r.id)).map((r) => r.role_tier);
  return tiers.length > 0 ? Math.min(...tiers) : 100;
}

function requirePreviewPermission(state: PreviewDatabaseState, actorId: string, permissionCode: string): void {
  const perms = getPreviewUserPermissions(state, actorId);
  if (!perms.has(permissionCode)) {
    throw new Error(`Authorization denied: missing required permission "${permissionCode}".`);
  }
}

function appendPreviewAudit(
  state: PreviewDatabaseState,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  afterState: Record<string, unknown> | null
): void {
  const actor = state.profiles.find((p) => p.id === actorId);
  state.audit_logs.unshift({
    id: crypto.randomUUID(),
    company_id: state.company.id,
    actor_id: actorId,
    actor_name: actor?.full_name ?? 'System',
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_state: afterState,
    created_at: new Date().toISOString(),
  });
}

function pushPreviewNotification(
  state: PreviewDatabaseState,
  recipientId: string,
  category: NotificationItem['category'],
  title: string,
  message: string,
  linkPath: string | null
): void {
  state.notifications.unshift({
    id: crypto.randomUUID(),
    company_id: state.company.id,
    recipient_id: recipientId,
    category,
    title,
    message,
    link_path: linkPath,
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString(),
  });
}

function logPreviewTaskActivity(
  state: PreviewDatabaseState,
  taskId: string,
  actorId: string,
  eventType: string,
  details: Record<string, unknown>
): void {
  const actor = state.profiles.find((p) => p.id === actorId);
  state.task_activity.unshift({
    id: crypto.randomUUID(),
    company_id: state.company.id,
    task_id: taskId,
    actor_id: actorId,
    actor_name: actor?.full_name ?? 'Team Member',
    event_type: eventType,
    details,
    created_at: new Date().toISOString(),
  });
}

export const erpRepository = {
  async getCompany(companyId: string): Promise<Company> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      if (error) throw new Error(error.message);
      return data as Company;
    }
    return loadPreviewState().company;
  },

  async updateCompany(actorId: string, companyId: string, input: UpdateCompanyInput): Promise<Company> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('companies')
        .update({
          name: input.name.trim(),
          legal_name: input.legal_name.trim(),
          registration_number: input.registration_number?.trim() || null,
          tax_id: input.tax_id?.trim() || null,
          default_currency: input.default_currency.toUpperCase(),
          fiscal_year_start_month: input.fiscal_year_start_month,
          timezone: input.timezone,
          headquarters_address: input.headquarters_address?.trim() || null,
          website_url: input.website_url?.trim() || null,
          primary_contact_email: input.primary_contact_email?.trim() || null,
          attendance_checkin_required: input.attendance_checkin_required,
        })
        .eq('id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as Company;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'settings.manage');
    const updated: Company = {
      ...state.company,
      ...input,
      name: input.name.trim(),
      legal_name: input.legal_name.trim(),
      default_currency: input.default_currency.toUpperCase(),
      registration_number: input.registration_number?.trim() || null,
      tax_id: input.tax_id?.trim() || null,
      headquarters_address: input.headquarters_address?.trim() || null,
      website_url: input.website_url?.trim() || null,
      primary_contact_email: input.primary_contact_email?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    state.company = updated;
    appendPreviewAudit(state, actorId, 'company.updated', 'company', updated.id, { name: updated.name, default_currency: updated.default_currency });
    savePreviewState(state);
    return updated;
  },

  async listBusinessUnits(companyId: string): Promise<BusinessUnit[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('business_units')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as BusinessUnit[];
    }
    return [...loadPreviewState().business_units];
  },

  async createBusinessUnit(actorId: string, companyId: string, input: CreateBusinessUnitInput): Promise<BusinessUnit> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('business_units')
        .insert({
          company_id: companyId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          unit_type: input.unit_type,
          description: input.description?.trim() || null,
          status: input.status,
          lead_profile_id: input.lead_profile_id || null,
          budget_currency: input.budget_currency.toUpperCase(),
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as BusinessUnit;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'business_units.manage');
    const code = input.code.trim().toUpperCase();
    if (state.business_units.some((bu) => bu.code === code || bu.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw new Error('A business unit with that code or name already exists.');
    }
    const now = new Date().toISOString();
    const created: BusinessUnit = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      code,
      name: input.name.trim(),
      unit_type: input.unit_type,
      description: input.description?.trim() || null,
      status: input.status,
      lead_profile_id: input.lead_profile_id || null,
      budget_currency: input.budget_currency.toUpperCase(),
      created_at: now,
      updated_at: now,
    };
    state.business_units.push(created);
    appendPreviewAudit(state, actorId, 'business_unit.created', 'business_unit', created.id, { code: created.code, name: created.name });
    savePreviewState(state);
    return created;
  },

  async updateBusinessUnit(actorId: string, companyId: string, input: UpdateBusinessUnitInput): Promise<BusinessUnit> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('business_units')
        .update({
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          unit_type: input.unit_type,
          description: input.description?.trim() || null,
          status: input.status,
          lead_profile_id: input.lead_profile_id || null,
          budget_currency: input.budget_currency.toUpperCase(),
        })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as BusinessUnit;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'business_units.manage');
    const idx = state.business_units.findIndex((b) => b.id === input.id);
    if (idx === -1) throw new Error('Business unit not found.');
    const updated: BusinessUnit = {
      ...state.business_units[idx],
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      unit_type: input.unit_type,
      description: input.description?.trim() || null,
      status: input.status,
      lead_profile_id: input.lead_profile_id || null,
      budget_currency: input.budget_currency.toUpperCase(),
      updated_at: new Date().toISOString(),
    };
    state.business_units[idx] = updated;
    appendPreviewAudit(state, actorId, 'business_unit.updated', 'business_unit', updated.id, { code: updated.code, status: updated.status });
    savePreviewState(state);
    return updated;
  },

  async listDepartments(companyId: string): Promise<Department[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('company_id', companyId)
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Department[];
    }
    return [...loadPreviewState().departments].sort((a, b) => a.name.localeCompare(b.name));
  },

  async createDepartment(actorId: string, companyId: string, input: CreateDepartmentInput): Promise<Department> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('departments')
        .insert({
          company_id: companyId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description?.trim() || null,
          business_unit_id: input.business_unit_id || null,
          head_profile_id: input.head_profile_id || null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as Department;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'team.manage');
    const code = input.code.trim().toUpperCase();
    if (state.departments.some((d) => d.code === code)) {
      throw new Error('A department with this code already exists.');
    }
    const now = new Date().toISOString();
    const created: Department = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      business_unit_id: input.business_unit_id || null,
      head_profile_id: input.head_profile_id || null,
      created_at: now,
      updated_at: now,
    };
    state.departments.push(created);
    appendPreviewAudit(state, actorId, 'department.created', 'department', created.id, { code: created.code, name: created.name });
    savePreviewState(state);
    return created;
  },

  async updateDepartment(actorId: string, companyId: string, input: UpdateDepartmentInput): Promise<Department> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('departments')
        .update({
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description?.trim() || null,
          business_unit_id: input.business_unit_id || null,
          head_profile_id: input.head_profile_id || null,
        })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as Department;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'team.manage');
    const idx = state.departments.findIndex((d) => d.id === input.id);
    if (idx === -1) throw new Error('Department not found.');
    const updated: Department = {
      ...state.departments[idx],
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      business_unit_id: input.business_unit_id || null,
      head_profile_id: input.head_profile_id || null,
      updated_at: new Date().toISOString(),
    };
    state.departments[idx] = updated;
    appendPreviewAudit(state, actorId, 'department.updated', 'department', updated.id, { code: updated.code, name: updated.name });
    savePreviewState(state);
    return updated;
  },

  async listResourceMemberships(companyId: string, userId?: string): Promise<ResourceMembership[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('resource_memberships').select('*').eq('company_id', companyId);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ResourceMembership[];
    }
    const all = loadPreviewState().resource_memberships;
    return userId ? all.filter((rm) => rm.user_id === userId) : [...all];
  },

  async upsertResourceMembership(
    actorId: string,
    companyId: string,
    input: {
      user_id: string;
      resource_type: ResourceMembership['resource_type'];
      resource_id: string;
      access_level: ResourceMembership['access_level'];
    }
  ): Promise<ResourceMembership> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('resource_memberships')
        .upsert(
          {
            company_id: companyId,
            user_id: input.user_id,
            resource_type: input.resource_type,
            resource_id: input.resource_id,
            access_level: input.access_level,
            granted_by: actorId,
          },
          { onConflict: 'user_id,resource_type,resource_id' }
        )
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ResourceMembership;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'team.manage');
    const existingIdx = state.resource_memberships.findIndex(
      (rm) => rm.user_id === input.user_id && rm.resource_type === input.resource_type && rm.resource_id === input.resource_id
    );
    if (existingIdx >= 0) {
      const updated: ResourceMembership = {
        ...state.resource_memberships[existingIdx],
        access_level: input.access_level,
        granted_by: actorId,
      };
      state.resource_memberships[existingIdx] = updated;
      savePreviewState(state);
      return updated;
    }
    const created: ResourceMembership = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      user_id: input.user_id,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      access_level: input.access_level,
      granted_by: actorId,
      created_at: new Date().toISOString(),
    };
    state.resource_memberships.push(created);
    appendPreviewAudit(state, actorId, 'resource_membership.granted', input.resource_type, input.resource_id, {
      user_id: input.user_id,
      access_level: input.access_level,
    });
    savePreviewState(state);
    return created;
  },

  async removeResourceMembership(actorId: string, companyId: string, membershipId: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('resource_memberships')
        .delete()
        .eq('id', membershipId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'team.manage');
    state.resource_memberships = state.resource_memberships.filter((rm) => rm.id !== membershipId);
    savePreviewState(state);
  },

  async listTeamMembers(companyId: string): Promise<TeamMemberRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const [profilesRes, deptsRes, busRes, rolesRes, userRolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('company_id', companyId).order('full_name', { ascending: true }),
        supabase.from('departments').select('id, name').eq('company_id', companyId),
        supabase.from('business_units').select('id, name').eq('company_id', companyId),
        supabase.from('roles').select('*').eq('company_id', companyId),
        supabase.from('user_roles').select('*').eq('company_id', companyId),
      ]);
      if (profilesRes.error) throw new Error(profilesRes.error.message);
      const profiles = (profilesRes.data ?? []) as Profile[];
      const deptMap = new Map((deptsRes.data ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));
      const buMap = new Map((busRes.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
      const roleMap = new Map(((rolesRes.data ?? []) as Role[]).map((r) => [r.id, r]));
      const profileNameMap = new Map(profiles.map((p) => [p.id, p.full_name]));
      const userRoles = (userRolesRes.data ?? []) as UserRole[];

      return profiles.map((p) => ({
        ...p,
        roles: userRoles
          .filter((ur) => ur.user_id === p.id)
          .map((ur) => roleMap.get(ur.role_id))
          .filter((r): r is Role => Boolean(r)),
        department_name: p.department_id ? deptMap.get(p.department_id) ?? null : null,
        business_unit_name: p.primary_business_unit_id ? buMap.get(p.primary_business_unit_id) ?? null : null,
        manager_name: p.manager_id ? profileNameMap.get(p.manager_id) ?? null : null,
      }));
    }

    const state = loadPreviewState();
    const deptMap = new Map(state.departments.map((d) => [d.id, d.name]));
    const buMap = new Map(state.business_units.map((b) => [b.id, b.name]));
    const roleMap = new Map(state.roles.map((r) => [r.id, r]));
    const profileNameMap = new Map(state.profiles.map((p) => [p.id, p.full_name]));

    return state.profiles.map((p) => ({
      ...p,
      roles: state.user_roles
        .filter((ur) => ur.user_id === p.id)
        .map((ur) => roleMap.get(ur.role_id))
        .filter((r): r is Role => Boolean(r)),
      department_name: p.department_id ? deptMap.get(p.department_id) ?? null : null,
      business_unit_name: p.primary_business_unit_id ? buMap.get(p.primary_business_unit_id) ?? null : null,
      manager_name: p.manager_id ? profileNameMap.get(p.manager_id) ?? null : null,
    }));
  },

  async createTeamMember(
    actorId: string,
    _companyId: string,
    input: CreateTeamMemberInput
  ): Promise<CreateTeamMemberResult> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.functions.invoke('create-team-member', {
        body: {
          employee_code: input.employee_code,
          full_name: input.full_name,
          email: input.email,
          job_title: input.job_title,
          department_id: input.department_id || null,
          primary_business_unit_id: input.primary_business_unit_id || null,
          manager_id: input.manager_id || null,
          employment_type: input.employment_type,
          status: input.status,
          location: input.location || null,
          timezone: input.timezone || 'UTC',
          initial_role_id: input.initial_role_id || null,
          password: input.password || generateRandomNumberPassword('team_member'),
          product_assignments: input.product_assignments ?? [],
        },
      });
      if (error) {
        throw new Error(
          error.message ||
            'Unable to invoke Supabase Edge Function create-team-member. Ensure supabase/functions/create-team-member is deployed.'
        );
      }
      const res = data as { profile?: Profile; issuedPassword?: string; error?: string } | null;
      if (!res?.profile) {
        throw new Error(res?.error || 'Failed to provision user via Supabase Edge Function.');
      }
      return { profile: res.profile, issuedPassword: res.issuedPassword ?? '' };
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'team.manage');
    const code = input.employee_code.trim().toUpperCase();
    const email = input.email.trim().toLowerCase();
    if (
      state.profiles.some((p) => p.employee_code === code || p.email.toLowerCase() === email) ||
      state.user_credentials.some((c) => c.email.toLowerCase() === email)
    ) {
      throw new Error('A team member with this employee code or email already exists.');
    }

    let roleSlugForPrefix: string | null = null;
    const now = new Date().toISOString();
    const newProfileId = crypto.randomUUID();

    if (input.initial_role_id) {
      requirePreviewPermission(state, actorId, 'roles.assign');
      const targetRole = state.roles.find((r) => r.id === input.initial_role_id);
      if (!targetRole) throw new Error('Selected role does not exist.');
      const actorMinTier = getPreviewMinRoleTier(state, actorId);
      if (targetRole.role_tier < actorMinTier) {
        throw new Error('Privilege escalation blocked: cannot assign a role higher than your own authority tier.');
      }
      roleSlugForPrefix = targetRole.slug;
      state.user_roles.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        user_id: newProfileId,
        role_id: targetRole.id,
        business_unit_id: input.primary_business_unit_id || null,
        assigned_by: actorId,
        assigned_at: now,
      });
    }

    const rawPassword = input.password?.trim()
      ? input.password.trim()
      : generateRandomNumberPassword(roleSlugForPrefix ?? input.job_title);

    if (rawPassword.length < 6) {
      throw new Error('Authentication password must be at least 6 characters.');
    }

    const salt = generateSaltHex();
    const passwordHash = await hashPassword(rawPassword, salt);

    const newProfile: Profile = {
      id: newProfileId,
      company_id: state.company.id,
      department_id: input.department_id || null,
      primary_business_unit_id: input.primary_business_unit_id || null,
      manager_id: input.manager_id || null,
      employee_code: code,
      full_name: input.full_name.trim(),
      email,
      job_title: input.job_title.trim(),
      employment_type: input.employment_type,
      status: input.status,
      availability: 'available',
      phone: null,
      location: input.location?.trim() || null,
      timezone: input.timezone || 'UTC',
      avatar_url: null,
      joined_at: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    };

    state.profiles.push(newProfile);
    state.user_credentials.push({
      id: crypto.randomUUID(),
      user_id: newProfile.id,
      email,
      password_hash: passwordHash,
      password_salt: salt,
      must_change_password: input.must_change_password ?? true,
      password_updated_at: now,
      failed_attempts: 0,
      last_login_at: null,
    });

    if (input.product_assignments && input.product_assignments.length > 0) {
      for (const assignment of input.product_assignments) {
        state.resource_memberships.push({
          id: crypto.randomUUID(),
          company_id: state.company.id,
          user_id: newProfile.id,
          resource_type: 'product',
          resource_id: assignment.product_id,
          access_level: assignment.access_level,
          granted_by: actorId,
          created_at: now,
        });
      }
    }

    appendPreviewAudit(state, actorId, 'team_member.created', 'profile', newProfile.id, {
      employee_code: newProfile.employee_code,
      full_name: newProfile.full_name,
      credentials_provisioned: true,
      assigned_products: input.product_assignments?.length ?? 0,
    });
    savePreviewState(state);
    return { profile: newProfile, issuedPassword: rawPassword };
  },

  async listCredentialStatuses(companyId: string): Promise<CredentialStatusSummary[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, created_at')
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return (data ?? []).map((p: { id: string; created_at: string }) => ({
        user_id: p.id,
        has_credentials: true,
        must_change_password: false,
        password_updated_at: p.created_at,
        last_login_at: null,
      }));
    }

    const state = loadPreviewState();
    const credByUser = new Map(state.user_credentials.map((c) => [c.user_id, c]));
    return state.profiles.map((p) => {
      const cred = credByUser.get(p.id);
      return {
        user_id: p.id,
        has_credentials: Boolean(cred),
        must_change_password: cred?.must_change_password ?? false,
        password_updated_at: cred?.password_updated_at ?? null,
        last_login_at: cred?.last_login_at ?? null,
      };
    });
  },

  async resetMemberPassword(
    actorId: string,
    _companyId: string,
    targetUserId: string,
    customPassword?: string
  ): Promise<{ email: string; temporaryPassword: string }> {
    if (isSupabaseConfigured && supabase) {
      const { data: targetData, error: targetErr } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .single();
      if (targetErr || !targetData) throw new Error(targetErr?.message ?? 'Member not found.');
      const targetEmail = (targetData as { email: string }).email;
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail);
      if (error) throw new Error(error.message);
      return {
        email: targetEmail,
        temporaryPassword: 'Password reset link sent via Supabase Auth email.',
      };
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'team.manage');
    const target = state.profiles.find((p) => p.id === targetUserId);
    if (!target) throw new Error('Team member not found.');

    const actorMinTier = getPreviewMinRoleTier(state, actorId);
    const targetMinTier = getPreviewMinRoleTier(state, targetUserId);
    if (targetMinTier < actorMinTier) {
      throw new Error('Cannot reset credentials for a user with a higher organizational authority tier.');
    }

    const targetRoleIds = new Set(
      state.user_roles.filter((ur) => ur.user_id === targetUserId).map((ur) => ur.role_id)
    );
    const targetRoles = state.roles
      .filter((r) => targetRoleIds.has(r.id))
      .sort((a, b) => a.role_tier - b.role_tier);
    const rolePrefixSeed = targetRoles[0]?.slug ?? target.job_title;

    const temporaryPassword = customPassword?.trim()
      ? customPassword.trim()
      : generateRandomNumberPassword(rolePrefixSeed);

    if (temporaryPassword.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const salt = generateSaltHex();
    const hash = await hashPassword(temporaryPassword, salt);
    const now = new Date().toISOString();

    const existing = state.user_credentials.find((c) => c.user_id === target.id);
    if (existing) {
      existing.email = target.email.toLowerCase();
      existing.password_hash = hash;
      existing.password_salt = salt;
      existing.must_change_password = true;
      existing.password_updated_at = now;
      existing.failed_attempts = 0;
    } else {
      state.user_credentials.push({
        id: crypto.randomUUID(),
        user_id: target.id,
        email: target.email.toLowerCase(),
        password_hash: hash,
        password_salt: salt,
        must_change_password: true,
        password_updated_at: now,
        failed_attempts: 0,
        last_login_at: null,
      });
    }

    state.initial_credentials_notice = state.initial_credentials_notice.filter(
      (n) => n.user_id !== target.id
    );

    appendPreviewAudit(state, actorId, 'user.password_reset', 'profile', target.id, {
      target_email: target.email,
      must_change_password: true,
    });
    savePreviewState(state);
    return { email: target.email, temporaryPassword };
  },

  async updateTeamMember(actorId: string, companyId: string, input: UpdateTeamMemberInput): Promise<Profile> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: input.full_name.trim(),
          job_title: input.job_title.trim(),
          department_id: input.department_id || null,
          primary_business_unit_id: input.primary_business_unit_id || null,
          manager_id: input.manager_id === input.id ? null : input.manager_id || null,
          employment_type: input.employment_type,
          status: input.status,
          availability: input.availability,
          phone: input.phone?.trim() || null,
          location: input.location?.trim() || null,
        })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    }

    const state = loadPreviewState();
    if (actorId !== input.id) {
      requirePreviewPermission(state, actorId, 'team.manage');
    }
    const idx = state.profiles.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new Error('Team member not found.');
    const updated: Profile = {
      ...state.profiles[idx],
      full_name: input.full_name.trim(),
      job_title: input.job_title.trim(),
      department_id: input.department_id || null,
      primary_business_unit_id: input.primary_business_unit_id || null,
      manager_id: input.manager_id === input.id ? null : input.manager_id || null,
      employment_type: input.employment_type,
      status: input.status,
      availability: input.availability,
      phone: input.phone?.trim() || null,
      location: input.location?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    state.profiles[idx] = updated;
    appendPreviewAudit(state, actorId, 'team_member.updated', 'profile', updated.id, { status: updated.status });
    savePreviewState(state);
    return updated;
  },

  async assignRoleToUser(actorId: string, companyId: string, targetUserId: string, roleId: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('user_roles').insert({
        company_id: companyId,
        user_id: targetUserId,
        role_id: roleId,
        assigned_by: actorId,
      });
      if (error) throw new Error(error.message);
      return;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'roles.assign');
    if (targetUserId === actorId) {
      throw new Error('Self-escalation blocked: users cannot modify their own assigned roles.');
    }
    const targetRole = state.roles.find((r) => r.id === roleId);
    if (!targetRole || !targetRole.is_assignable) {
      throw new Error('Target role is invalid or not assignable.');
    }
    const actorMinTier = getPreviewMinRoleTier(state, actorId);
    if (targetRole.role_tier < actorMinTier) {
      throw new Error('Privilege escalation blocked: cannot assign a role with higher authority than your own.');
    }
    if (state.user_roles.some((ur) => ur.user_id === targetUserId && ur.role_id === roleId)) {
      return;
    }
    state.user_roles.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      user_id: targetUserId,
      role_id: roleId,
      business_unit_id: null,
      assigned_by: actorId,
      assigned_at: new Date().toISOString(),
    });
    appendPreviewAudit(state, actorId, 'role.assigned', 'user_role', targetUserId, { role: targetRole.name });
    pushPreviewNotification(state, targetUserId, 'security', 'Role Assigned', `You have been assigned the ${targetRole.name} role.`, '/workspace');
    savePreviewState(state);
  },

  async revokeRoleFromUser(actorId: string, companyId: string, targetUserId: string, roleId: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('company_id', companyId)
        .eq('user_id', targetUserId)
        .eq('role_id', roleId);
      if (error) throw new Error(error.message);
      return;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'roles.assign');
    if (targetUserId === actorId) {
      throw new Error('Self-modification blocked: users cannot revoke their own roles.');
    }
    const targetRole = state.roles.find((r) => r.id === roleId);
    if (!targetRole) throw new Error('Role not found.');
    const actorMinTier = getPreviewMinRoleTier(state, actorId);
    if (targetRole.role_tier < actorMinTier) {
      throw new Error('Insufficient authority to revoke a higher-tier role.');
    }
    state.user_roles = state.user_roles.filter((ur) => !(ur.user_id === targetUserId && ur.role_id === roleId));
    appendPreviewAudit(state, actorId, 'role.revoked', 'user_role', targetUserId, { role: targetRole.name });
    savePreviewState(state);
  },

  async getRolesAndPermissions(companyId: string): Promise<{
    roles: Role[];
    permissions: Permission[];
    rolePermissions: RolePermission[];
  }> {
    if (isSupabaseConfigured && supabase) {
      const [rolesRes, permsRes, rpRes] = await Promise.all([
        supabase.from('roles').select('*').eq('company_id', companyId).order('role_tier', { ascending: true }),
        supabase.from('permissions').select('*').order('module', { ascending: true }),
        supabase.from('role_permissions').select('*').eq('company_id', companyId),
      ]);
      if (rolesRes.error) throw new Error(rolesRes.error.message);
      if (permsRes.error) throw new Error(permsRes.error.message);
      if (rpRes.error) throw new Error(rpRes.error.message);
      return {
        roles: (rolesRes.data ?? []) as Role[],
        permissions: (permsRes.data ?? []) as Permission[],
        rolePermissions: (rpRes.data ?? []) as RolePermission[],
      };
    }

    const state = loadPreviewState();
    return {
      roles: [...state.roles].sort((a, b) => a.role_tier - b.role_tier),
      permissions: [...state.permissions],
      rolePermissions: [...state.role_permissions],
    };
  },

  async createRole(actorId: string, companyId: string, input: CreateRoleInput): Promise<Role> {
    if (isSupabaseConfigured && supabase) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .insert({
          company_id: companyId,
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          description: input.description?.trim() || null,
          role_tier: input.role_tier,
          is_system_role: false,
          is_assignable: true,
        })
        .select('*')
        .single();
      if (roleError) throw new Error(roleError.message);
      const role = roleData as Role;
      if (input.permission_ids.length > 0) {
        const { error: rpErr } = await supabase.from('role_permissions').insert(
          input.permission_ids.map((pid) => ({
            company_id: companyId,
            role_id: role.id,
            permission_id: pid,
          }))
        );
        if (rpErr) throw new Error(rpErr.message);
      }
      return role;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'roles.manage');
    const actorMinTier = getPreviewMinRoleTier(state, actorId);
    if (input.role_tier < actorMinTier) {
      throw new Error('Privilege escalation blocked: cannot create a role with a higher tier than your own.');
    }
    const slug = input.slug.trim().toLowerCase();
    if (state.roles.some((r) => r.slug === slug || r.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw new Error('A role with that name or slug already exists.');
    }
    const now = new Date().toISOString();
    const role: Role = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      role_tier: input.role_tier,
      is_system_role: false,
      is_assignable: true,
      created_at: now,
      updated_at: now,
    };
    state.roles.push(role);
    for (const pid of input.permission_ids) {
      state.role_permissions.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        role_id: role.id,
        permission_id: pid,
      });
    }
    appendPreviewAudit(state, actorId, 'role.created', 'role', role.id, { name: role.name, role_tier: role.role_tier });
    savePreviewState(state);
    return role;
  },

  async toggleRolePermission(actorId: string, companyId: string, roleId: string, permissionId: string, enabled: boolean): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      if (enabled) {
        const { error } = await supabase.from('role_permissions').insert({
          company_id: companyId,
          role_id: roleId,
          permission_id: permissionId,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('company_id', companyId)
          .eq('role_id', roleId)
          .eq('permission_id', permissionId);
        if (error) throw new Error(error.message);
      }
      return;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'roles.manage');
    const role = state.roles.find((r) => r.id === roleId);
    if (!role) throw new Error('Role not found.');
    const actorMinTier = getPreviewMinRoleTier(state, actorId);
    if (role.role_tier < actorMinTier) {
      throw new Error('Privilege escalation blocked: cannot modify permissions of a higher-tier role.');
    }

    if (enabled) {
      if (!state.role_permissions.some((rp) => rp.role_id === roleId && rp.permission_id === permissionId)) {
        state.role_permissions.push({
          id: crypto.randomUUID(),
          company_id: state.company.id,
          role_id: roleId,
          permission_id: permissionId,
        });
      }
    } else {
      state.role_permissions = state.role_permissions.filter(
        (rp) => !(rp.role_id === roleId && rp.permission_id === permissionId)
      );
    }
    appendPreviewAudit(state, actorId, 'role_permission.updated', 'role', roleId, { permission_id: permissionId, enabled });
    savePreviewState(state);
  },

  // ============================================================================
  // Phase 2: Tasks, Comments, Attachments, Dependencies & Activity History
  // ============================================================================

  async listTasks(companyId: string): Promise<TaskRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as TaskRecord[];
    }
    return [...loadPreviewState().tasks].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createTask(actorId: string, companyId: string, input: CreateTaskInput): Promise<TaskRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          company_id: companyId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          task_type: input.task_type,
          department_id: input.department_id || null,
          project_id: input.project_id || null,
          product_id: input.product_id || null,
          assigned_to: input.assigned_to || null,
          created_by: actorId,
          priority: input.priority,
          status: input.status,
          start_date: input.start_date || null,
          due_date: input.due_date || null,
          estimated_hours: input.estimated_hours ?? null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const task = data as TaskRecord;
      await supabase.from('task_activity').insert({
        company_id: companyId,
        task_id: task.id,
        actor_id: actorId,
        event_type: 'task.created',
        details: { title: task.title, status: task.status, priority: task.priority },
      });
      if (task.assigned_to && task.assigned_to !== actorId) {
        await supabase.from('notifications').insert({
          company_id: companyId,
          recipient_id: task.assigned_to,
          category: 'task',
          title: 'Task Assigned',
          message: `You were assigned "${task.title}".`,
          link_path: `/tasks?task=${task.id}`,
        });
      }
      return task;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'tasks.manage');
    const now = new Date().toISOString();
    const created: TaskRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      project_id: input.project_id || null,
      product_id: input.product_id || null,
      department_id: input.department_id || null,
      feature_id: null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      task_type: input.task_type,
      assigned_to: input.assigned_to || null,
      created_by: actorId,
      priority: input.priority,
      status: input.status,
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      estimated_hours: input.estimated_hours ?? null,
      actual_hours: null,
      completion_notes: null,
      completed_at: input.status === 'completed' ? now : null,
      created_at: now,
      updated_at: now,
    };
    state.tasks.unshift(created);
    logPreviewTaskActivity(state, created.id, actorId, 'task.created', {
      status: created.status,
      priority: created.priority,
    });
    if (created.assigned_to && created.assigned_to !== actorId) {
      pushPreviewNotification(
        state,
        created.assigned_to,
        'task',
        'Task Assigned',
        `You were assigned "${created.title}".`,
        `/tasks?task=${created.id}`
      );
    }
    savePreviewState(state);
    return created;
  },

  async updateTask(actorId: string, companyId: string, input: UpdateTaskInput): Promise<TaskRecord> {
    if (isSupabaseConfigured && supabase) {
      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title.trim();
      if (input.description !== undefined) updates.description = input.description?.trim() || null;
      if (input.task_type !== undefined) updates.task_type = input.task_type;
      if (input.department_id !== undefined) updates.department_id = input.department_id || null;
      if (input.project_id !== undefined) updates.project_id = input.project_id || null;
      if (input.product_id !== undefined) updates.product_id = input.product_id || null;
      if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to || null;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.status !== undefined) {
        updates.status = input.status;
        updates.completed_at = input.status === 'completed' ? new Date().toISOString() : null;
      }
      if (input.start_date !== undefined) updates.start_date = input.start_date || null;
      if (input.due_date !== undefined) updates.due_date = input.due_date || null;
      if (input.estimated_hours !== undefined) updates.estimated_hours = input.estimated_hours;
      if (input.actual_hours !== undefined) updates.actual_hours = input.actual_hours;
      if (input.completion_notes !== undefined) updates.completion_notes = input.completion_notes?.trim() || null;

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const updated = data as TaskRecord;
      await supabase.from('task_activity').insert({
        company_id: companyId,
        task_id: updated.id,
        actor_id: actorId,
        event_type: input.status ? 'task.status_changed' : 'task.updated',
        details: updates,
      });
      return updated;
    }

    const state = loadPreviewState();
    const idx = state.tasks.findIndex((t) => t.id === input.id);
    if (idx === -1) throw new Error('Task not found.');
    const prev = state.tasks[idx];
    const perms = getPreviewUserPermissions(state, actorId);
    if (prev.assigned_to !== actorId && !perms.has('tasks.manage')) {
      throw new Error('Authorization denied: you can only update your own tasks or require tasks.manage.');
    }

    const now = new Date().toISOString();
    const nextStatus = input.status ?? prev.status;
    const updated: TaskRecord = {
      ...prev,
      title: input.title !== undefined ? input.title.trim() : prev.title,
      description: input.description !== undefined ? input.description?.trim() || null : prev.description,
      task_type: input.task_type ?? prev.task_type,
      department_id: input.department_id !== undefined ? input.department_id || null : prev.department_id,
      project_id: input.project_id !== undefined ? input.project_id || null : prev.project_id,
      product_id: input.product_id !== undefined ? input.product_id || null : prev.product_id,
      assigned_to: input.assigned_to !== undefined ? input.assigned_to || null : prev.assigned_to,
      priority: input.priority ?? prev.priority,
      status: nextStatus,
      start_date: input.start_date !== undefined ? input.start_date || null : prev.start_date,
      due_date: input.due_date !== undefined ? input.due_date || null : prev.due_date,
      estimated_hours: input.estimated_hours !== undefined ? input.estimated_hours : prev.estimated_hours,
      actual_hours: input.actual_hours !== undefined ? input.actual_hours : prev.actual_hours,
      completion_notes: input.completion_notes !== undefined ? input.completion_notes?.trim() || null : prev.completion_notes,
      completed_at:
        nextStatus === 'completed'
          ? prev.completed_at ?? now
          : input.status !== undefined
            ? null
            : prev.completed_at,
      updated_at: now,
    };

    state.tasks[idx] = updated;
    if (prev.status !== updated.status) {
      logPreviewTaskActivity(state, updated.id, actorId, 'task.status_changed', {
        from: prev.status,
        to: updated.status,
      });
    } else if (prev.assigned_to !== updated.assigned_to) {
      logPreviewTaskActivity(state, updated.id, actorId, 'task.reassigned', {
        assigned_to: updated.assigned_to,
      });
    } else {
      logPreviewTaskActivity(state, updated.id, actorId, 'task.updated', { title: updated.title });
    }

    if (updated.assigned_to && updated.assigned_to !== prev.assigned_to && updated.assigned_to !== actorId) {
      pushPreviewNotification(
        state,
        updated.assigned_to,
        'task',
        'Task Assigned',
        `You were assigned "${updated.title}".`,
        `/tasks?task=${updated.id}`
      );
    }

    savePreviewState(state);
    return updated;
  },

  async getTaskDetails(companyId: string, taskId: string): Promise<{
    comments: TaskComment[];
    attachments: TaskAttachment[];
    dependencies: TaskDependency[];
    activity: TaskActivityItem[];
  }> {
    if (isSupabaseConfigured && supabase) {
      const [commentsRes, attachRes, depRes, actRes, profRes] = await Promise.all([
        supabase.from('task_comments').select('*').eq('company_id', companyId).eq('task_id', taskId).order('created_at', { ascending: true }),
        supabase.from('task_attachments').select('*').eq('company_id', companyId).eq('task_id', taskId).order('created_at', { ascending: false }),
        supabase.from('task_dependencies').select('*').eq('company_id', companyId).eq('task_id', taskId),
        supabase.from('task_activity').select('*').eq('company_id', companyId).eq('task_id', taskId).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId),
      ]);
      const nameMap = new Map(((profRes.data ?? []) as Array<{ id: string; full_name: string }>).map((p) => [p.id, p.full_name]));
      return {
        comments: ((commentsRes.data ?? []) as TaskComment[]).map((c) => ({ ...c, author_name: nameMap.get(c.author_id) })),
        attachments: ((attachRes.data ?? []) as TaskAttachment[]).map((a) => ({ ...a, uploader_name: nameMap.get(a.uploaded_by) })),
        dependencies: (depRes.data ?? []) as TaskDependency[],
        activity: ((actRes.data ?? []) as TaskActivityItem[]).map((act) => ({
          ...act,
          actor_name: act.actor_id ? nameMap.get(act.actor_id) : 'System',
        })),
      };
    }

    const state = loadPreviewState();
    const nameMap = new Map(state.profiles.map((p) => [p.id, p.full_name]));
    return {
      comments: state.task_comments
        .filter((c) => c.task_id === taskId)
        .map((c) => ({ ...c, author_name: nameMap.get(c.author_id) ?? 'Member' })),
      attachments: state.task_attachments
        .filter((a) => a.task_id === taskId)
        .map((a) => ({ ...a, uploader_name: nameMap.get(a.uploaded_by) ?? 'Member' })),
      dependencies: state.task_dependencies.filter((d) => d.task_id === taskId),
      activity: state.task_activity
        .filter((act) => act.task_id === taskId)
        .map((act) => ({ ...act, actor_name: act.actor_id ? nameMap.get(act.actor_id) : 'System' })),
    };
  },

  async addTaskComment(actorId: string, companyId: string, taskId: string, body: string): Promise<TaskComment> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('task_comments')
        .insert({ company_id: companyId, task_id: taskId, author_id: actorId, body: body.trim() })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      await supabase.from('task_activity').insert({
        company_id: companyId,
        task_id: taskId,
        actor_id: actorId,
        event_type: 'task.commented',
        details: { excerpt: body.trim().slice(0, 80) },
      });
      return data as TaskComment;
    }

    const state = loadPreviewState();
    const now = new Date().toISOString();
    const comment: TaskComment = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      task_id: taskId,
      author_id: actorId,
      body: body.trim(),
      created_at: now,
      updated_at: now,
    };
    state.task_comments.push(comment);
    logPreviewTaskActivity(state, taskId, actorId, 'task.commented', { excerpt: comment.body.slice(0, 80) });
    const task = state.tasks.find((t) => t.id === taskId);
    if (task?.assigned_to && task.assigned_to !== actorId) {
      pushPreviewNotification(
        state,
        task.assigned_to,
        'task',
        'New Task Comment',
        `New comment on "${task.title}": ${comment.body.slice(0, 60)}`,
        `/tasks?task=${task.id}`
      );
    }
    savePreviewState(state);
    return comment;
  },

  async addTaskDependency(
    actorId: string,
    companyId: string,
    taskId: string,
    dependsOnTaskId: string,
    dependencyType: 'blocks' | 'relates_to'
  ): Promise<TaskDependency> {
    if (taskId === dependsOnTaskId) throw new Error('A task cannot depend on itself.');
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('task_dependencies')
        .insert({
          company_id: companyId,
          task_id: taskId,
          depends_on_task_id: dependsOnTaskId,
          dependency_type: dependencyType,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as TaskDependency;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'tasks.manage');
    if (state.task_dependencies.some((d) => d.task_id === taskId && d.depends_on_task_id === dependsOnTaskId)) {
      throw new Error('This dependency already exists.');
    }
    const dep: TaskDependency = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      task_id: taskId,
      depends_on_task_id: dependsOnTaskId,
      dependency_type: dependencyType,
      created_at: new Date().toISOString(),
    };
    state.task_dependencies.push(dep);
    logPreviewTaskActivity(state, taskId, actorId, 'task.dependency_added', { depends_on_task_id: dependsOnTaskId, dependencyType });
    savePreviewState(state);
    return dep;
  },

  async addTaskAttachmentMetadata(
    actorId: string,
    companyId: string,
    taskId: string,
    file: File
  ): Promise<TaskAttachment> {
    const storagePath = `${companyId}/tasks/${taskId}/${Date.now()}_${file.name}`;
    if (isSupabaseConfigured && supabase) {
      const { error: uploadErr } = await supabase.storage.from('task-attachments').upload(storagePath, file);
      if (uploadErr) throw new Error(uploadErr.message);
      const { data, error } = await supabase
        .from('task_attachments')
        .insert({
          company_id: companyId,
          task_id: taskId,
          uploaded_by: actorId,
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as TaskAttachment;
    }

    const state = loadPreviewState();
    const att: TaskAttachment = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      task_id: taskId,
      uploaded_by: actorId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_at: new Date().toISOString(),
    };
    state.task_attachments.unshift(att);
    logPreviewTaskActivity(state, taskId, actorId, 'task.attachment_added', { file_name: file.name, size_bytes: file.size });
    savePreviewState(state);
    return att;
  },

  // ============================================================================
  // Phase 2: Notifications & Announcements
  // ============================================================================

  async listNotifications(companyId: string, recipientId: string): Promise<NotificationItem[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('company_id', companyId)
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as NotificationItem[];
    }
    return loadPreviewState().notifications.filter((n) => n.recipient_id === recipientId);
  },

  async markNotificationRead(companyId: string, recipientId: string, notificationId: string): Promise<void> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('id', notificationId)
        .eq('company_id', companyId)
        .eq('recipient_id', recipientId);
      if (error) throw new Error(error.message);
      return;
    }
    const state = loadPreviewState();
    const target = state.notifications.find((n) => n.id === notificationId && n.recipient_id === recipientId);
    if (target) {
      target.is_read = true;
      target.read_at = now;
      savePreviewState(state);
    }
  },

  async markAllNotificationsRead(companyId: string, recipientId: string): Promise<void> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('company_id', companyId)
        .eq('recipient_id', recipientId)
        .eq('is_read', false);
      if (error) throw new Error(error.message);
      return;
    }
    const state = loadPreviewState();
    for (const n of state.notifications) {
      if (n.recipient_id === recipientId && !n.is_read) {
        n.is_read = true;
        n.read_at = now;
      }
    }
    savePreviewState(state);
  },

  async listAnnouncements(companyId: string): Promise<AnnouncementItem[]> {
    if (isSupabaseConfigured && supabase) {
      const [annRes, profRes] = await Promise.all([
        supabase.from('announcements').select('*').eq('company_id', companyId).order('published_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId),
      ]);
      if (annRes.error) throw new Error(annRes.error.message);
      const nameMap = new Map(((profRes.data ?? []) as Array<{ id: string; full_name: string }>).map((p) => [p.id, p.full_name]));
      return ((annRes.data ?? []) as AnnouncementItem[]).map((a) => ({ ...a, author_name: nameMap.get(a.author_id) }));
    }
    const state = loadPreviewState();
    const nameMap = new Map(state.profiles.map((p) => [p.id, p.full_name]));
    return state.announcements.map((a) => ({ ...a, author_name: nameMap.get(a.author_id) ?? 'Leadership' }));
  },

  async createAnnouncement(actorId: string, companyId: string, input: CreateAnnouncementInput): Promise<AnnouncementItem> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          author_id: actorId,
          title: input.title.trim(),
          body: input.body.trim(),
          severity: input.severity,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as AnnouncementItem;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'settings.manage');
    const now = new Date().toISOString();
    const created: AnnouncementItem = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      author_id: actorId,
      title: input.title.trim(),
      body: input.body.trim(),
      severity: input.severity,
      published_at: now,
      expires_at: null,
      created_at: now,
    };
    state.announcements.unshift(created);
    for (const member of state.profiles) {
      if (member.id !== actorId && member.status === 'active') {
        pushPreviewNotification(
          state,
          member.id,
          'system',
          `Announcement: ${created.title}`,
          created.body.slice(0, 100),
          '/notifications'
        );
      }
    }
    appendPreviewAudit(state, actorId, 'announcement.published', 'announcement', created.id, { title: created.title });
    savePreviewState(state);
    return created;
  },

  // ============================================================================
  // Phase 3: Products, Projects, Project Members, Milestones, Features, Releases
  // ============================================================================

  async listProducts(companyId: string): Promise<ProductRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductRecord[];
    }
    return [...loadPreviewState().products];
  },

  async createProduct(actorId: string, companyId: string, input: CreateProductInput): Promise<ProductRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('products')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          category: input.category,
          description: input.description?.trim() || null,
          stage: input.stage,
          health_status: input.health_status,
          progress_pct: input.progress_pct,
          product_owner_id: input.product_owner_id || null,
          tech_lead_id: input.tech_lead_id || null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProductRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'products.manage');
    const code = input.code.trim().toUpperCase();
    if (state.products.some((p) => p.code === code)) {
      throw new Error('A product with this code already exists.');
    }
    const now = new Date().toISOString();
    const created: ProductRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id,
      code,
      name: input.name.trim(),
      category: input.category,
      description: input.description?.trim() || null,
      stage: input.stage,
      health_status: input.health_status,
      progress_pct: input.progress_pct,
      product_owner_id: input.product_owner_id || null,
      tech_lead_id: input.tech_lead_id || null,
      created_at: now,
      updated_at: now,
    };
    state.products.push(created);
    appendPreviewAudit(state, actorId, 'product.created', 'product', created.id, { code: created.code, name: created.name });
    savePreviewState(state);
    return created;
  },

  async updateProduct(actorId: string, companyId: string, input: UpdateProductInput): Promise<ProductRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('products')
        .update({
          business_unit_id: input.business_unit_id,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          category: input.category,
          description: input.description?.trim() || null,
          stage: input.stage,
          health_status: input.health_status,
          progress_pct: input.progress_pct,
          product_owner_id: input.product_owner_id || null,
          tech_lead_id: input.tech_lead_id || null,
        })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProductRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'products.manage');
    const idx = state.products.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new Error('Product not found.');
    const updated: ProductRecord = {
      ...state.products[idx],
      business_unit_id: input.business_unit_id,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category,
      description: input.description?.trim() || null,
      stage: input.stage,
      health_status: input.health_status,
      progress_pct: input.progress_pct,
      product_owner_id: input.product_owner_id || null,
      tech_lead_id: input.tech_lead_id || null,
      updated_at: new Date().toISOString(),
    };
    state.products[idx] = updated;
    appendPreviewAudit(state, actorId, 'product.updated', 'product', updated.id, { stage: updated.stage, progress_pct: updated.progress_pct });
    savePreviewState(state);
    return updated;
  },

  async listProjects(companyId: string): Promise<ProjectRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectRecord[];
    }
    return [...loadPreviewState().projects].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createProject(actorId: string, companyId: string, input: CreateProjectInput): Promise<ProjectRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          product_id: input.product_id || null,
          client_id: input.client_id || null,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description?.trim() || null,
          project_type: input.project_type,
          status: input.status,
          owner_id: input.owner_id || null,
          project_manager_id: input.project_manager_id || null,
          start_date: input.start_date || null,
          due_date: input.due_date || null,
          budget_minor: Math.max(0, Math.trunc(input.budget_minor)),
          budget_currency: input.budget_currency.toUpperCase(),
          progress_pct: input.progress_pct,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProjectRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'projects.manage');
    const code = input.code.trim().toUpperCase();
    if (state.projects.some((p) => p.code === code)) {
      throw new Error('A project with this code already exists.');
    }
    const now = new Date().toISOString();
    const created: ProjectRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      product_id: input.product_id || null,
      client_id: input.client_id || null,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      project_type: input.project_type,
      status: input.status,
      owner_id: input.owner_id || null,
      project_manager_id: input.project_manager_id || null,
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      budget_minor: Math.max(0, Math.trunc(input.budget_minor)),
      budget_currency: input.budget_currency.toUpperCase(),
      progress_pct: input.progress_pct,
      created_at: now,
      updated_at: now,
    };
    state.projects.unshift(created);
    appendPreviewAudit(state, actorId, 'project.created', 'project', created.id, { code: created.code, name: created.name });
    savePreviewState(state);
    return created;
  },

  async updateProject(actorId: string, companyId: string, input: UpdateProjectInput): Promise<ProjectRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('projects')
        .update({
          business_unit_id: input.business_unit_id || null,
          product_id: input.product_id || null,
          client_id: input.client_id || null,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description?.trim() || null,
          project_type: input.project_type,
          status: input.status,
          owner_id: input.owner_id || null,
          project_manager_id: input.project_manager_id || null,
          start_date: input.start_date || null,
          due_date: input.due_date || null,
          budget_minor: Math.max(0, Math.trunc(input.budget_minor)),
          budget_currency: input.budget_currency.toUpperCase(),
          progress_pct: input.progress_pct,
        })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProjectRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'projects.manage');
    const idx = state.projects.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new Error('Project not found.');
    const updated: ProjectRecord = {
      ...state.projects[idx],
      business_unit_id: input.business_unit_id || null,
      product_id: input.product_id || null,
      client_id: input.client_id !== undefined ? input.client_id || null : state.projects[idx].client_id,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      project_type: input.project_type,
      status: input.status,
      owner_id: input.owner_id || null,
      project_manager_id: input.project_manager_id || null,
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      budget_minor: Math.max(0, Math.trunc(input.budget_minor)),
      budget_currency: input.budget_currency.toUpperCase(),
      progress_pct: input.progress_pct,
      updated_at: new Date().toISOString(),
    };
    state.projects[idx] = updated;
    appendPreviewAudit(state, actorId, 'project.updated', 'project', updated.id, { status: updated.status, progress_pct: updated.progress_pct });
    savePreviewState(state);
    return updated;
  },

  async listProjectMembers(companyId: string, projectId?: string): Promise<ProjectMember[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('project_members').select('*').eq('company_id', companyId);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectMember[];
    }
    const all = loadPreviewState().project_members;
    return projectId ? all.filter((pm) => pm.project_id === projectId) : [...all];
  },

  async addProjectMember(
    actorId: string,
    companyId: string,
    input: { project_id: string; profile_id: string; role_in_project: string; allocation_pct: number }
  ): Promise<ProjectMember> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('project_members')
        .upsert(
          {
            company_id: companyId,
            project_id: input.project_id,
            profile_id: input.profile_id,
            role_in_project: input.role_in_project.trim() || 'contributor',
            allocation_pct: input.allocation_pct,
          },
          { onConflict: 'project_id,profile_id' }
        )
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProjectMember;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'projects.manage');
    const existing = state.project_members.find(
      (pm) => pm.project_id === input.project_id && pm.profile_id === input.profile_id
    );
    if (existing) {
      existing.role_in_project = input.role_in_project.trim() || 'contributor';
      existing.allocation_pct = input.allocation_pct;
      savePreviewState(state);
      return existing;
    }
    const created: ProjectMember = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      project_id: input.project_id,
      profile_id: input.profile_id,
      role_in_project: input.role_in_project.trim() || 'contributor',
      allocation_pct: input.allocation_pct,
      joined_at: new Date().toISOString().slice(0, 10),
    };
    state.project_members.push(created);
    savePreviewState(state);
    return created;
  },

  async removeProjectMember(actorId: string, companyId: string, memberRowId: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', memberRowId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'projects.manage');
    state.project_members = state.project_members.filter((pm) => pm.id !== memberRowId);
    savePreviewState(state);
  },

  async listMilestones(companyId: string, filter?: { projectId?: string; productId?: string }): Promise<MilestoneRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('milestones').select('*').eq('company_id', companyId).order('due_date', { ascending: true });
      if (filter?.projectId) q = q.eq('project_id', filter.projectId);
      if (filter?.productId) q = q.eq('product_id', filter.productId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as MilestoneRecord[];
    }
    return loadPreviewState().milestones.filter((m) => {
      if (filter?.projectId && m.project_id !== filter.projectId) return false;
      if (filter?.productId && m.product_id !== filter.productId) return false;
      return true;
    });
  },

  async createMilestone(actorId: string, companyId: string, input: CreateMilestoneInput): Promise<MilestoneRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('milestones')
        .insert({
          company_id: companyId,
          project_id: input.project_id || null,
          product_id: input.product_id || null,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          due_date: input.due_date || null,
          status: input.status,
          completed_at: input.status === 'completed' ? new Date().toISOString() : null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as MilestoneRecord;
    }

    const state = loadPreviewState();
    const perms = getPreviewUserPermissions(state, actorId);
    if (!perms.has('projects.manage') && !perms.has('products.manage')) {
      throw new Error('Authorization denied: requires projects.manage or products.manage.');
    }
    const now = new Date().toISOString();
    const created: MilestoneRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      project_id: input.project_id || null,
      product_id: input.product_id || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.due_date || null,
      status: input.status,
      completed_at: input.status === 'completed' ? now : null,
      created_at: now,
      updated_at: now,
    };
    state.milestones.push(created);
    savePreviewState(state);
    return created;
  },

  async updateMilestoneStatus(
    actorId: string,
    companyId: string,
    milestoneId: string,
    status: MilestoneRecord['status']
  ): Promise<void> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('milestones')
        .update({ status, completed_at: status === 'completed' ? now : null })
        .eq('id', milestoneId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }
    const state = loadPreviewState();
    const perms = getPreviewUserPermissions(state, actorId);
    if (!perms.has('projects.manage') && !perms.has('products.manage')) {
      throw new Error('Authorization denied.');
    }
    const target = state.milestones.find((m) => m.id === milestoneId);
    if (target) {
      target.status = status;
      target.completed_at = status === 'completed' ? now : null;
      target.updated_at = now;
      savePreviewState(state);
    }
  },

  async listFeatures(companyId: string, productId?: string): Promise<FeatureRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let query = supabase
        .from('features')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (productId) {
        query = query.eq('product_id', productId);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as FeatureRecord[];
    }
    const features = loadPreviewState().features;
    return productId ? features.filter((f) => f.product_id === productId) : features;
  },

  async createFeature(actorId: string, companyId: string, input: CreateFeatureInput): Promise<FeatureRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('features')
        .insert({
          company_id: companyId,
          product_id: input.product_id,
          milestone_id: input.milestone_id || null,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority,
          status: input.status,
          owner_id: input.owner_id || null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as FeatureRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'products.manage');
    const now = new Date().toISOString();
    const created: FeatureRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      product_id: input.product_id,
      milestone_id: input.milestone_id || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      status: input.status,
      owner_id: input.owner_id || null,
      created_at: now,
      updated_at: now,
    };
    state.features.unshift(created);
    savePreviewState(state);
    return created;
  },

  async updateFeatureStatus(
    actorId: string,
    companyId: string,
    featureId: string,
    status: FeatureRecord['status']
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('features')
        .update({ status })
        .eq('id', featureId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }
    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'products.manage');
    const target = state.features.find((f) => f.id === featureId);
    if (target) {
      target.status = status;
      target.updated_at = new Date().toISOString();
      savePreviewState(state);
    }
  },

  async listReleases(companyId: string, productId?: string): Promise<ReleaseRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let query = supabase
        .from('releases')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (productId) {
        query = query.eq('product_id', productId);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ReleaseRecord[];
    }
    const releases = loadPreviewState().releases;
    return productId ? releases.filter((r) => r.product_id === productId) : releases;
  },

  async createRelease(actorId: string, companyId: string, input: CreateReleaseInput): Promise<ReleaseRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('releases')
        .insert({
          company_id: companyId,
          product_id: input.product_id,
          version_tag: input.version_tag.trim(),
          title: input.title.trim(),
          release_notes: input.release_notes?.trim() || null,
          environment: input.environment,
          status: input.status,
          target_date: input.target_date || null,
          released_at: input.status === 'released' ? new Date().toISOString() : null,
          release_manager_id: input.release_manager_id || null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ReleaseRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'products.manage');
    if (state.releases.some((r) => r.product_id === input.product_id && r.version_tag === input.version_tag.trim())) {
      throw new Error('This version tag already exists for this product.');
    }
    const now = new Date().toISOString();
    const created: ReleaseRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      product_id: input.product_id,
      version_tag: input.version_tag.trim(),
      title: input.title.trim(),
      release_notes: input.release_notes?.trim() || null,
      environment: input.environment,
      status: input.status,
      target_date: input.target_date || null,
      released_at: input.status === 'released' ? now : null,
      release_manager_id: input.release_manager_id || null,
      created_at: now,
      updated_at: now,
    };
    state.releases.unshift(created);
    savePreviewState(state);
    return created;
  },

  async updateReleaseStatus(
    actorId: string,
    companyId: string,
    releaseId: string,
    status: ReleaseRecord['status']
  ): Promise<void> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('releases')
        .update({ status, released_at: status === 'released' ? now : null })
        .eq('id', releaseId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }
    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'products.manage');
    const target = state.releases.find((r) => r.id === releaseId);
    if (target) {
      target.status = status;
      target.released_at = status === 'released' ? now : null;
      target.updated_at = now;
      savePreviewState(state);
    }
  },

  async listBusinessUnitFinanceSummary(companyId: string, businessUnitId: string): Promise<{
    actualRevenueMinor: number;
    actualExpensesMinor: number;
    plannedExpensesMinor: number;
    forecastRevenueMinor: number;
  }> {
    let txs: FinancialTransactionRecord[] = [];
    let cats: FinancialCategory[] = [];
    if (isSupabaseConfigured && supabase) {
      const [txRes, catRes] = await Promise.all([
        supabase
          .from('financial_transactions')
          .select('*')
          .eq('company_id', companyId)
          .eq('business_unit_id', businessUnitId),
        supabase
          .from('financial_categories')
          .select('*')
          .eq('company_id', companyId),
      ]);
      txs = (txRes.data ?? []) as FinancialTransactionRecord[];
      cats = (catRes.data ?? []) as FinancialCategory[];
    } else {
      const state = loadPreviewState();
      txs = state.financial_transactions.filter((t) => t.business_unit_id === businessUnitId);
      cats = state.financial_categories;
    }

    const txById = new Map(txs.map((t) => [t.id, t]));
    const catById = new Map(cats.map((c) => [c.id, c]));

    let actualRevenueMinor = 0;
    let actualExpensesMinor = 0;
    let plannedExpensesMinor = 0;
    let forecastRevenueMinor = 0;
    for (const tx of txs) {
      if (tx.transaction_type === 'actual_revenue' && tx.approval_status === 'approved') actualRevenueMinor += tx.amount_minor;
      if (tx.transaction_type === 'actual_expense' && tx.approval_status === 'approved') actualExpensesMinor += tx.amount_minor;
      if (tx.transaction_type === 'planned_expense') plannedExpensesMinor += tx.amount_minor;
      if (tx.transaction_type === 'forecast_revenue') forecastRevenueMinor += tx.amount_minor;
      if (tx.transaction_type === 'reversal' && tx.approval_status === 'approved' && tx.parent_transaction_id) {
        const parent = txById.get(tx.parent_transaction_id);
        if (parent?.transaction_type === 'actual_revenue') actualRevenueMinor += tx.amount_minor;
        if (parent?.transaction_type === 'actual_expense') actualExpensesMinor += tx.amount_minor;
      }
      if (tx.transaction_type === 'adjustment' && tx.approval_status === 'approved') {
        const cat = catById.get(tx.category_id);
        if (cat?.flow_type === 'income') actualRevenueMinor += tx.amount_minor;
        if (cat?.flow_type === 'expense') actualExpensesMinor += tx.amount_minor;
      }
    }
    return { actualRevenueMinor, actualExpensesMinor, plannedExpensesMinor, forecastRevenueMinor };
  },

  // ============================================================================
  // Phase 4: Client Services (Leads, Clients, Communications, Proposals, Contracts)
  // ============================================================================

  async listLeads(companyId: string): Promise<LeadRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as LeadRecord[];
    }
    return [...loadPreviewState().leads].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createLead(actorId: string, companyId: string, input: CreateLeadInput): Promise<LeadRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          organization_name: input.organization_name.trim(),
          contact_name: input.contact_name.trim(),
          contact_email: input.contact_email?.trim() || null,
          contact_phone: input.contact_phone?.trim() || null,
          source: input.source?.trim() || null,
          stage: input.stage,
          estimated_value_minor: Math.max(0, Math.trunc(input.estimated_value_minor)),
          currency_code: input.currency_code.toUpperCase(),
          owner_id: input.owner_id || actorId,
          next_follow_up_at: input.next_follow_up_at || null,
          requirements_summary: input.requirements_summary?.trim() || null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as LeadRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const now = new Date().toISOString();
    const created: LeadRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      client_id: null,
      organization_name: input.organization_name.trim(),
      contact_name: input.contact_name.trim(),
      contact_email: input.contact_email?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      source: input.source?.trim() || null,
      stage: input.stage,
      estimated_value_minor: Math.max(0, Math.trunc(input.estimated_value_minor)),
      currency_code: input.currency_code.toUpperCase(),
      owner_id: input.owner_id || actorId,
      next_follow_up_at: input.next_follow_up_at || null,
      requirements_summary: input.requirements_summary?.trim() || null,
      lost_reason: null,
      created_at: now,
      updated_at: now,
    };
    state.leads.unshift(created);
    appendPreviewAudit(state, actorId, 'lead.created', 'lead', created.id, {
      organization_name: created.organization_name,
      stage: created.stage,
    });
    savePreviewState(state);
    return created;
  },

  async updateLead(actorId: string, companyId: string, input: UpdateLeadInput): Promise<LeadRecord> {
    if (isSupabaseConfigured && supabase) {
      const updates: Record<string, unknown> = {};
      if (input.organization_name !== undefined) updates.organization_name = input.organization_name.trim();
      if (input.contact_name !== undefined) updates.contact_name = input.contact_name.trim();
      if (input.contact_email !== undefined) updates.contact_email = input.contact_email?.trim() || null;
      if (input.contact_phone !== undefined) updates.contact_phone = input.contact_phone?.trim() || null;
      if (input.source !== undefined) updates.source = input.source?.trim() || null;
      if (input.stage !== undefined) updates.stage = input.stage;
      if (input.estimated_value_minor !== undefined) updates.estimated_value_minor = Math.max(0, Math.trunc(input.estimated_value_minor));
      if (input.currency_code !== undefined) updates.currency_code = input.currency_code.toUpperCase();
      if (input.owner_id !== undefined) updates.owner_id = input.owner_id || null;
      if (input.next_follow_up_at !== undefined) updates.next_follow_up_at = input.next_follow_up_at || null;
      if (input.requirements_summary !== undefined) updates.requirements_summary = input.requirements_summary?.trim() || null;
      if (input.lost_reason !== undefined) updates.lost_reason = input.lost_reason?.trim() || null;

      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as LeadRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const idx = state.leads.findIndex((l) => l.id === input.id);
    if (idx === -1) throw new Error('Lead not found.');
    const cur = state.leads[idx];
    const updated: LeadRecord = {
      ...cur,
      organization_name: input.organization_name !== undefined ? input.organization_name.trim() : cur.organization_name,
      contact_name: input.contact_name !== undefined ? input.contact_name.trim() : cur.contact_name,
      contact_email: input.contact_email !== undefined ? input.contact_email?.trim() || null : cur.contact_email,
      contact_phone: input.contact_phone !== undefined ? input.contact_phone?.trim() || null : cur.contact_phone,
      source: input.source !== undefined ? input.source?.trim() || null : cur.source,
      stage: input.stage ?? cur.stage,
      estimated_value_minor: input.estimated_value_minor !== undefined ? Math.max(0, Math.trunc(input.estimated_value_minor)) : cur.estimated_value_minor,
      currency_code: input.currency_code !== undefined ? input.currency_code.toUpperCase() : cur.currency_code,
      owner_id: input.owner_id !== undefined ? input.owner_id || null : cur.owner_id,
      next_follow_up_at: input.next_follow_up_at !== undefined ? input.next_follow_up_at || null : cur.next_follow_up_at,
      requirements_summary: input.requirements_summary !== undefined ? input.requirements_summary?.trim() || null : cur.requirements_summary,
      lost_reason: input.lost_reason !== undefined ? input.lost_reason?.trim() || null : cur.lost_reason,
      updated_at: new Date().toISOString(),
    };
    state.leads[idx] = updated;
    appendPreviewAudit(state, actorId, 'lead.updated', 'lead', updated.id, { stage: updated.stage });
    savePreviewState(state);
    return updated;
  },

  async convertLeadToClient(actorId: string, companyId: string, leadId: string): Promise<ClientRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data: leadData, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('company_id', companyId)
        .single();
      if (leadErr || !leadData) throw new Error(leadErr?.message ?? 'Lead not found.');
      const lead = leadData as LeadRecord;
      if (lead.client_id) {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('*')
          .eq('id', lead.client_id)
          .single();
        if (existingClient) return existingClient as ClientRecord;
      }

      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .insert({
          company_id: companyId,
          business_unit_id: lead.business_unit_id,
          name: lead.organization_name,
          account_owner_id: lead.owner_id || actorId,
          status: lead.stage === 'won' ? 'active' : 'prospect',
        })
        .select('*')
        .single();
      if (clientErr) throw new Error(clientErr.message);
      const client = clientData as ClientRecord;

      await supabase.from('client_contacts').insert({
        company_id: companyId,
        client_id: client.id,
        full_name: lead.contact_name,
        email: lead.contact_email,
        phone: lead.contact_phone,
        is_primary: true,
      });

      await supabase
        .from('leads')
        .update({ client_id: client.id })
        .eq('id', lead.id)
        .eq('company_id', companyId);

      return client;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const lead = state.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error('Lead not found.');
    if (lead.client_id) {
      const existing = state.clients.find((c) => c.id === lead.client_id);
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const client: ClientRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: lead.business_unit_id,
      name: lead.organization_name,
      industry: null,
      website: null,
      billing_address: null,
      account_owner_id: lead.owner_id || actorId,
      status: lead.stage === 'won' ? 'active' : 'prospect',
      created_at: now,
      updated_at: now,
    };
    state.clients.unshift(client);
    state.client_contacts.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      client_id: client.id,
      full_name: lead.contact_name,
      role_title: 'Primary Contact',
      email: lead.contact_email,
      phone: lead.contact_phone,
      is_primary: true,
      created_at: now,
    });
    lead.client_id = client.id;
    lead.updated_at = now;
    appendPreviewAudit(state, actorId, 'lead.converted_to_client', 'client', client.id, { lead_id: lead.id, client_name: client.name });
    savePreviewState(state);
    return client;
  },

  async listClients(companyId: string): Promise<ClientRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ClientRecord[];
    }
    return [...loadPreviewState().clients].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createClient(actorId: string, companyId: string, input: CreateClientInput): Promise<ClientRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          name: input.name.trim(),
          industry: input.industry?.trim() || null,
          website: input.website?.trim() || null,
          billing_address: input.billing_address?.trim() || null,
          account_owner_id: input.account_owner_id || actorId,
          status: input.status,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ClientRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const now = new Date().toISOString();
    const created: ClientRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      name: input.name.trim(),
      industry: input.industry?.trim() || null,
      website: input.website?.trim() || null,
      billing_address: input.billing_address?.trim() || null,
      account_owner_id: input.account_owner_id || actorId,
      status: input.status,
      created_at: now,
      updated_at: now,
    };
    state.clients.unshift(created);
    appendPreviewAudit(state, actorId, 'client.created', 'client', created.id, { name: created.name });
    savePreviewState(state);
    return created;
  },

  async updateClientStatus(actorId: string, companyId: string, clientId: string, status: ClientStatus): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('clients')
        .update({ status })
        .eq('id', clientId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }
    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const client = state.clients.find((c) => c.id === clientId);
    if (client) {
      client.status = status;
      client.updated_at = new Date().toISOString();
      savePreviewState(state);
    }
  },

  async listClientContacts(companyId: string, clientId?: string): Promise<ClientContact[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('client_contacts').select('*').eq('company_id', companyId);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ClientContact[];
    }
    const all = loadPreviewState().client_contacts;
    return clientId ? all.filter((c) => c.client_id === clientId) : [...all];
  },

  async addClientContact(
    actorId: string,
    companyId: string,
    input: { client_id: string; full_name: string; role_title?: string | null; email?: string | null; phone?: string | null; is_primary: boolean }
  ): Promise<ClientContact> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('client_contacts')
        .insert({
          company_id: companyId,
          client_id: input.client_id,
          full_name: input.full_name.trim(),
          role_title: input.role_title?.trim() || null,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          is_primary: input.is_primary,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ClientContact;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const created: ClientContact = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      client_id: input.client_id,
      full_name: input.full_name.trim(),
      role_title: input.role_title?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      is_primary: input.is_primary,
      created_at: new Date().toISOString(),
    };
    state.client_contacts.push(created);
    savePreviewState(state);
    return created;
  },

  async listClientCommunications(companyId: string): Promise<ClientCommunication[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('client_communications')
        .select('*')
        .eq('company_id', companyId)
        .order('communicated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ClientCommunication[];
    }
    return [...loadPreviewState().client_communications].sort((a, b) =>
      b.communicated_at.localeCompare(a.communicated_at)
    );
  },

  async logClientCommunication(
    actorId: string,
    companyId: string,
    input: LogCommunicationInput
  ): Promise<ClientCommunication> {
    const communicatedAt = input.communicated_at || new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('client_communications')
        .insert({
          company_id: companyId,
          client_id: input.client_id || null,
          lead_id: input.lead_id || null,
          channel: input.channel,
          subject: input.subject.trim(),
          summary: input.summary.trim(),
          communicated_at: communicatedAt,
          logged_by: actorId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ClientCommunication;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const now = new Date().toISOString();
    const created: ClientCommunication = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      client_id: input.client_id || null,
      lead_id: input.lead_id || null,
      channel: input.channel,
      subject: input.subject.trim(),
      summary: input.summary.trim(),
      communicated_at: communicatedAt,
      logged_by: actorId,
      created_at: now,
    };
    state.client_communications.unshift(created);
    savePreviewState(state);
    return created;
  },

  async listProposals(companyId: string): Promise<ProposalRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProposalRecord[];
    }
    return [...loadPreviewState().proposals].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createProposal(actorId: string, companyId: string, input: CreateProposalInput): Promise<ProposalRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('proposals')
        .insert({
          company_id: companyId,
          lead_id: input.lead_id || null,
          client_id: input.client_id || null,
          proposal_number: input.proposal_number.trim().toUpperCase(),
          title: input.title.trim(),
          scope_summary: input.scope_summary.trim(),
          estimated_hours: input.estimated_hours ?? null,
          proposed_amount_minor: Math.max(0, Math.trunc(input.proposed_amount_minor)),
          currency_code: input.currency_code.toUpperCase(),
          status: 'draft',
          valid_until: input.valid_until || null,
          created_by: actorId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProposalRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const code = input.proposal_number.trim().toUpperCase();
    if (state.proposals.some((p) => p.proposal_number === code)) {
      throw new Error('A proposal with this number already exists.');
    }
    const now = new Date().toISOString();
    const created: ProposalRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      lead_id: input.lead_id || null,
      client_id: input.client_id || null,
      proposal_number: code,
      title: input.title.trim(),
      scope_summary: input.scope_summary.trim(),
      estimated_hours: input.estimated_hours ?? null,
      proposed_amount_minor: Math.max(0, Math.trunc(input.proposed_amount_minor)),
      currency_code: input.currency_code.toUpperCase(),
      technical_reviewed_by: null,
      technical_reviewed_at: null,
      commercial_approved_by: null,
      commercial_approved_at: null,
      status: 'draft',
      valid_until: input.valid_until || null,
      created_by: actorId,
      created_at: now,
      updated_at: now,
    };
    state.proposals.unshift(created);
    appendPreviewAudit(state, actorId, 'proposal.created', 'proposal', created.id, { proposal_number: created.proposal_number });
    savePreviewState(state);
    return created;
  },

  async submitProposalForTechReview(actorId: string, companyId: string, proposalId: string): Promise<ProposalRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('proposals')
        .update({ status: 'pending_tech_review' })
        .eq('id', proposalId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProposalRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'client_services.manage');
    const prop = state.proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error('Proposal not found.');
    prop.status = 'pending_tech_review';
    prop.updated_at = new Date().toISOString();
    // Notify technical reviewers (e.g. CTO)
    for (const profile of state.profiles) {
      if (profile.id !== actorId && getPreviewUserPermissions(state, profile.id).has('proposals.tech_review')) {
        pushPreviewNotification(
          state,
          profile.id,
          'client',
          'Technical Review Required',
          `Proposal ${prop.proposal_number} ("${prop.title}") requires technical estimate review.`,
          '/client-services'
        );
      }
    }
    appendPreviewAudit(state, actorId, 'proposal.submitted_tech_review', 'proposal', prop.id, { proposal_number: prop.proposal_number });
    savePreviewState(state);
    return prop;
  },

  async reviewProposalTechnical(
    actorId: string,
    companyId: string,
    proposalId: string,
    approved: boolean
  ): Promise<ProposalRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('proposals')
        .update(
          approved
            ? {
                status: 'pending_commercial_approval',
                technical_reviewed_by: actorId,
                technical_reviewed_at: now,
              }
            : {
                status: 'draft',
                technical_reviewed_by: null,
                technical_reviewed_at: null,
              }
        )
        .eq('id', proposalId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProposalRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'proposals.tech_review');
    const prop = state.proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error('Proposal not found.');
    if (prop.status !== 'pending_tech_review') {
      throw new Error('Proposal is not awaiting technical review.');
    }
    if (approved) {
      prop.status = 'pending_commercial_approval';
      prop.technical_reviewed_by = actorId;
      prop.technical_reviewed_at = now;
      for (const profile of state.profiles) {
        if (profile.id !== actorId && getPreviewUserPermissions(state, profile.id).has('proposals.commercial_approve')) {
          pushPreviewNotification(
            state,
            profile.id,
            'client',
            'Commercial Approval Required',
            `Proposal ${prop.proposal_number} passed technical review and awaits commercial approval.`,
            '/client-services'
          );
        }
      }
    } else {
      prop.status = 'draft';
      prop.technical_reviewed_by = null;
      prop.technical_reviewed_at = null;
      pushPreviewNotification(
        state,
        prop.created_by,
        'client',
        'Proposal Returned from Tech Review',
        `Proposal ${prop.proposal_number} was returned to draft for technical estimate revision.`,
        '/client-services'
      );
    }
    prop.updated_at = now;
    appendPreviewAudit(state, actorId, approved ? 'proposal.tech_approved' : 'proposal.tech_returned', 'proposal', prop.id, {
      status: prop.status,
    });
    savePreviewState(state);
    return prop;
  },

  async approveProposalCommercial(
    actorId: string,
    companyId: string,
    proposalId: string,
    approved: boolean
  ): Promise<ProposalRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data: existing, error: fetchErr } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .eq('company_id', companyId)
        .single();
      if (fetchErr || !existing) throw new Error(fetchErr?.message ?? 'Proposal not found.');
      const prop = existing as ProposalRecord;
      if (approved && !prop.technical_reviewed_by) {
        throw new Error('Technical estimate review is required before commercial commitment approval.');
      }
      const { data, error } = await supabase
        .from('proposals')
        .update(
          approved
            ? {
                status: 'sent',
                commercial_approved_by: actorId,
                commercial_approved_at: now,
              }
            : {
                status: 'rejected',
              }
        )
        .eq('id', proposalId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProposalRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'proposals.commercial_approve');
    const prop = state.proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error('Proposal not found.');
    if (prop.status !== 'pending_commercial_approval') {
      throw new Error('Proposal must complete technical review before commercial approval.');
    }
    if (approved && !prop.technical_reviewed_by) {
      throw new Error('Workflow violation: technical review must precede commercial commitment.');
    }
    if (approved) {
      prop.status = 'sent';
      prop.commercial_approved_by = actorId;
      prop.commercial_approved_at = now;
      if (prop.lead_id) {
        const lead = state.leads.find((l) => l.id === prop.lead_id);
        if (lead && ['new_lead', 'contacted', 'qualified', 'requirement_gathering'].includes(lead.stage)) {
          lead.stage = 'proposal_sent';
          lead.updated_at = now;
        }
      }
    } else {
      prop.status = 'rejected';
    }
    prop.updated_at = now;
    appendPreviewAudit(state, actorId, approved ? 'proposal.commercial_approved' : 'proposal.commercial_rejected', 'proposal', prop.id, {
      status: prop.status,
    });
    savePreviewState(state);
    return prop;
  },

  async updateProposalOutcome(
    actorId: string,
    companyId: string,
    proposalId: string,
    status: Extract<ProposalStatus, 'accepted' | 'rejected' | 'expired'>
  ): Promise<ProposalRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('proposals')
        .update({ status })
        .eq('id', proposalId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ProposalRecord;
    }

    const state = loadPreviewState();
    const perms = getPreviewUserPermissions(state, actorId);
    if (!perms.has('client_services.manage') && !perms.has('proposals.commercial_approve')) {
      throw new Error('Authorization denied: requires client_services.manage or proposals.commercial_approve.');
    }
    const prop = state.proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error('Proposal not found.');
    prop.status = status;
    prop.updated_at = new Date().toISOString();
    if (status === 'accepted' && prop.lead_id) {
      const lead = state.leads.find((l) => l.id === prop.lead_id);
      if (lead && lead.stage !== 'won') {
        lead.stage = 'won';
        lead.updated_at = prop.updated_at;
      }
    }
    savePreviewState(state);
    return prop;
  },

  async listContracts(companyId: string): Promise<ContractRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ContractRecord[];
    }
    return [...loadPreviewState().contracts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createContract(actorId: string, companyId: string, input: CreateContractInput): Promise<ContractRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          company_id: companyId,
          client_id: input.client_id,
          proposal_id: input.proposal_id || null,
          contract_number: input.contract_number.trim().toUpperCase(),
          title: input.title.trim(),
          contract_value_minor: Math.max(0, Math.trunc(input.contract_value_minor)),
          currency_code: input.currency_code.toUpperCase(),
          start_date: input.start_date,
          end_date: input.end_date || null,
          status: input.status,
          approved_by: input.status === 'active' ? actorId : null,
          signed_at: input.status === 'active' ? now : null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ContractRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'proposals.commercial_approve');
    const code = input.contract_number.trim().toUpperCase();
    if (state.contracts.some((c) => c.contract_number === code)) {
      throw new Error('A contract with this number already exists.');
    }
    const created: ContractRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      client_id: input.client_id,
      proposal_id: input.proposal_id || null,
      contract_number: code,
      title: input.title.trim(),
      contract_value_minor: Math.max(0, Math.trunc(input.contract_value_minor)),
      currency_code: input.currency_code.toUpperCase(),
      start_date: input.start_date,
      end_date: input.end_date || null,
      status: input.status,
      approved_by: input.status === 'active' ? actorId : null,
      signed_at: input.status === 'active' ? now : null,
      created_at: now,
      updated_at: now,
    };
    state.contracts.unshift(created);
    if (created.status === 'active') {
      const client = state.clients.find((c) => c.id === created.client_id);
      if (client && client.status === 'prospect') {
        client.status = 'active';
        client.updated_at = now;
      }
    }
    appendPreviewAudit(state, actorId, 'contract.created', 'contract', created.id, {
      contract_number: created.contract_number,
      status: created.status,
    });
    savePreviewState(state);
    return created;
  },

  async updateContractStatus(
    actorId: string,
    companyId: string,
    contractId: string,
    status: ContractStatus
  ): Promise<void> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const updates: Record<string, unknown> = { status };
      if (status === 'active') {
        updates.approved_by = actorId;
        updates.signed_at = now;
      }
      const { error } = await supabase
        .from('contracts')
        .update(updates)
        .eq('id', contractId)
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'proposals.commercial_approve');
    const contract = state.contracts.find((c) => c.id === contractId);
    if (!contract) throw new Error('Contract not found.');
    contract.status = status;
    if (status === 'active') {
      contract.approved_by = actorId;
      contract.signed_at = contract.signed_at ?? now;
      const client = state.clients.find((c) => c.id === contract.client_id);
      if (client && client.status === 'prospect') {
        client.status = 'active';
        client.updated_at = now;
      }
    }
    contract.updated_at = now;
    appendPreviewAudit(state, actorId, 'contract.status_updated', 'contract', contract.id, { status });
    savePreviewState(state);
  },

  // ============================================================================
  // Phase 5: Finance (Accounts, Categories, Immutable Ledger, Budgets, Invoices) & Approvals
  // ============================================================================

  async listFinancialAccounts(companyId: string): Promise<FinancialAccount[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('code', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FinancialAccount[];
    }
    return [...loadPreviewState().financial_accounts].sort((a, b) => a.code.localeCompare(b.code));
  },

  async createFinancialAccount(
    actorId: string,
    companyId: string,
    input: CreateFinancialAccountInput
  ): Promise<FinancialAccount> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('financial_accounts')
        .insert({
          company_id: companyId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          account_type: input.account_type,
          currency_code: input.currency_code.toUpperCase(),
          is_active: true,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as FinancialAccount;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const code = input.code.trim().toUpperCase();
    if (state.financial_accounts.some((a) => a.code === code)) {
      throw new Error('An account with this code already exists.');
    }
    const created: FinancialAccount = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      code,
      name: input.name.trim(),
      account_type: input.account_type,
      currency_code: input.currency_code.toUpperCase(),
      is_active: true,
      created_at: new Date().toISOString(),
    };
    state.financial_accounts.push(created);
    appendPreviewAudit(state, actorId, 'financial_account.created', 'financial_account', created.id, { code: created.code });
    savePreviewState(state);
    return created;
  },

  async listFinancialCategories(companyId: string): Promise<FinancialCategory[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .eq('company_id', companyId)
        .order('code', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FinancialCategory[];
    }
    return [...loadPreviewState().financial_categories].sort((a, b) => a.code.localeCompare(b.code));
  },

  async createFinancialCategory(
    actorId: string,
    companyId: string,
    input: CreateFinancialCategoryInput
  ): Promise<FinancialCategory> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('financial_categories')
        .insert({
          company_id: companyId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          flow_type: input.flow_type,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as FinancialCategory;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const code = input.code.trim().toUpperCase();
    if (state.financial_categories.some((c) => c.code === code)) {
      throw new Error('A financial category with this code already exists.');
    }
    const created: FinancialCategory = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      code,
      name: input.name.trim(),
      flow_type: input.flow_type,
      created_at: new Date().toISOString(),
    };
    state.financial_categories.push(created);
    appendPreviewAudit(state, actorId, 'financial_category.created', 'financial_category', created.id, { code: created.code });
    savePreviewState(state);
    return created;
  },

  async listFinancialTransactions(companyId: string): Promise<FinancialTransactionRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('company_id', companyId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FinancialTransactionRecord[];
    }
    return [...loadPreviewState().financial_transactions].sort(
      (a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at)
    );
  },

  async createFinancialTransaction(
    actorId: string,
    companyId: string,
    input: CreateFinancialTransactionInput
  ): Promise<FinancialTransactionRecord> {
    const needsApproval = Boolean(input.submit_for_approval);
    const approvalStatus = needsApproval ? 'pending' : 'approved';
    const amountMinor =
      input.transaction_type === 'adjustment'
        ? Math.trunc(input.amount_minor)
        : Math.max(0, Math.trunc(input.amount_minor));

    if (amountMinor === 0) {
      throw new Error('Transaction amount must be non-zero.');
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('financial_transactions')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          project_id: input.project_id || null,
          account_id: input.account_id,
          category_id: input.category_id,
          transaction_type: input.transaction_type,
          amount_minor: amountMinor,
          currency_code: input.currency_code.toUpperCase(),
          transaction_date: input.transaction_date,
          description: input.description.trim(),
          reference_number: input.reference_number?.trim() || null,
          parent_transaction_id: null,
          approval_status: approvalStatus,
          recorded_by: actorId,
          approved_by: needsApproval ? null : actorId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const tx = data as FinancialTransactionRecord;

      if (needsApproval) {
        const { data: reqData } = await supabase
          .from('approval_requests')
          .insert({
            company_id: companyId,
            request_type: 'expense',
            entity_type: 'financial_transaction',
            entity_id: tx.id,
            title: `${tx.transaction_type.replace('_', ' ')}: ${tx.description}`,
            summary: `Amount ${tx.amount_minor} (${tx.currency_code}) dated ${tx.transaction_date}`,
            requester_id: actorId,
            assigned_approver_id: input.assigned_approver_id || null,
            status: 'pending',
          })
          .select('*')
          .single();
        if (reqData) {
          await supabase.from('approval_history').insert({
            company_id: companyId,
            approval_request_id: (reqData as ApprovalRequestRecord).id,
            actor_id: actorId,
            action: 'submitted',
            comment: 'Submitted from Finance ledger.',
          });
        }
      }
      return tx;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const now = new Date().toISOString();
    const created: FinancialTransactionRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      project_id: input.project_id || null,
      account_id: input.account_id,
      category_id: input.category_id,
      transaction_type: input.transaction_type,
      amount_minor: amountMinor,
      currency_code: input.currency_code.toUpperCase(),
      transaction_date: input.transaction_date,
      description: input.description.trim(),
      reference_number: input.reference_number?.trim() || null,
      parent_transaction_id: null,
      approval_status: approvalStatus,
      recorded_by: actorId,
      approved_by: needsApproval ? null : actorId,
      created_at: now,
    };
    state.financial_transactions.unshift(created);

    if (needsApproval) {
      const approvalReq: ApprovalRequestRecord = {
        id: crypto.randomUUID(),
        company_id: state.company.id,
        request_type: 'expense',
        entity_type: 'financial_transaction',
        entity_id: created.id,
        title: `Expense Approval: ${created.description}`,
        summary: `Ledger entry ${created.reference_number ?? created.id.slice(0, 8)} · ${created.currency_code} ${(created.amount_minor / 100).toFixed(2)} dated ${created.transaction_date}`,
        requester_id: actorId,
        assigned_approver_id: input.assigned_approver_id || null,
        status: 'pending',
        submitted_at: now,
        resolved_at: null,
        resolved_by: null,
      };
      state.approval_requests.unshift(approvalReq);
      state.approval_history.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        approval_request_id: approvalReq.id,
        actor_id: actorId,
        action: 'submitted',
        comment: 'Submitted from Finance ledger for separation-of-duties approval.',
        created_at: now,
      });
      for (const p of state.profiles) {
        if (
          p.id !== actorId &&
          (p.id === input.assigned_approver_id ||
            (!input.assigned_approver_id && getPreviewUserPermissions(state, p.id).has('approvals.resolve')))
        ) {
          pushPreviewNotification(
            state,
            p.id,
            'finance',
            'Financial Approval Required',
            `${approvalReq.title} requires review.`,
            `/approvals?request=${approvalReq.id}`
          );
        }
      }
    }

    appendPreviewAudit(state, actorId, 'financial_transaction.recorded', 'financial_transaction', created.id, {
      transaction_type: created.transaction_type,
      amount_minor: created.amount_minor,
      approval_status: created.approval_status,
    });
    savePreviewState(state);
    return created;
  },

  async reverseFinancialTransaction(
    actorId: string,
    companyId: string,
    parentTransactionId: string,
    reason: string
  ): Promise<FinancialTransactionRecord> {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error('A reversal reason is required for immutable ledger auditing.');
    }

    if (isSupabaseConfigured && supabase) {
      const { data: parent, error: pErr } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('id', parentTransactionId)
        .eq('company_id', companyId)
        .single();
      if (pErr || !parent) throw new Error(pErr?.message ?? 'Original transaction not found.');
      const orig = parent as FinancialTransactionRecord;
      if (orig.transaction_type === 'reversal') {
        throw new Error('Cannot reverse a reversal entry.');
      }

      const { data, error } = await supabase
        .from('financial_transactions')
        .insert({
          company_id: companyId,
          business_unit_id: orig.business_unit_id,
          project_id: orig.project_id,
          account_id: orig.account_id,
          category_id: orig.category_id,
          transaction_type: 'reversal',
          amount_minor: -orig.amount_minor,
          currency_code: orig.currency_code,
          transaction_date: new Date().toISOString().slice(0, 10),
          description: `REVERSAL of "${orig.description}": ${cleanReason}`,
          reference_number: orig.reference_number ? `REV-${orig.reference_number}` : null,
          parent_transaction_id: orig.id,
          approval_status: 'approved',
          recorded_by: actorId,
          approved_by: actorId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as FinancialTransactionRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const orig = state.financial_transactions.find((t) => t.id === parentTransactionId);
    if (!orig) throw new Error('Original transaction not found.');
    if (orig.transaction_type === 'reversal') {
      throw new Error('Cannot reverse an existing reversal entry.');
    }
    if (state.financial_transactions.some((t) => t.parent_transaction_id === orig.id && t.transaction_type === 'reversal')) {
      throw new Error('This ledger entry has already been reversed.');
    }
    const now = new Date().toISOString();
    const reversal: FinancialTransactionRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: orig.business_unit_id,
      project_id: orig.project_id,
      account_id: orig.account_id,
      category_id: orig.category_id,
      transaction_type: 'reversal',
      amount_minor: -orig.amount_minor,
      currency_code: orig.currency_code,
      transaction_date: now.slice(0, 10),
      description: `REVERSAL of "${orig.description}": ${cleanReason}`,
      reference_number: orig.reference_number ? `REV-${orig.reference_number}` : null,
      parent_transaction_id: orig.id,
      approval_status: 'approved',
      recorded_by: actorId,
      approved_by: actorId,
      created_at: now,
    };
    state.financial_transactions.unshift(reversal);
    appendPreviewAudit(state, actorId, 'financial_transaction.reversed', 'financial_transaction', reversal.id, {
      parent_transaction_id: orig.id,
      amount_minor: reversal.amount_minor,
      reason: cleanReason,
    });
    savePreviewState(state);
    return reversal;
  },

  async listBudgets(companyId: string): Promise<BudgetRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('company_id', companyId)
        .order('fiscal_year', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as BudgetRecord[];
    }
    return [...loadPreviewState().budgets].sort((a, b) => b.fiscal_year - a.fiscal_year || b.created_at.localeCompare(a.created_at));
  },

  async createBudget(actorId: string, companyId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('budgets')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          department_id: input.department_id || null,
          project_id: input.project_id || null,
          fiscal_year: input.fiscal_year,
          name: input.name.trim(),
          allocated_minor: Math.max(0, Math.trunc(input.allocated_minor)),
          currency_code: input.currency_code.toUpperCase(),
          status: input.status,
          created_by: actorId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const budget = data as BudgetRecord;
      if (budget.status === 'pending_approval') {
        const { data: reqData } = await supabase
          .from('approval_requests')
          .insert({
            company_id: companyId,
            request_type: 'budget',
            entity_type: 'budget',
            entity_id: budget.id,
            title: `Budget Approval: ${budget.name} (FY ${budget.fiscal_year})`,
            summary: `Allocated ${budget.allocated_minor} (${budget.currency_code})`,
            requester_id: actorId,
            assigned_approver_id: input.assigned_approver_id || null,
            status: 'pending',
          })
          .select('*')
          .single();
        if (reqData) {
          await supabase.from('approval_history').insert({
            company_id: companyId,
            approval_request_id: (reqData as ApprovalRequestRecord).id,
            actor_id: actorId,
            action: 'submitted',
            comment: 'Budget submitted for executive/finance sign-off.',
          });
        }
      }
      return budget;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const now = new Date().toISOString();
    const created: BudgetRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      department_id: input.department_id || null,
      project_id: input.project_id || null,
      fiscal_year: input.fiscal_year,
      name: input.name.trim(),
      allocated_minor: Math.max(0, Math.trunc(input.allocated_minor)),
      currency_code: input.currency_code.toUpperCase(),
      status: input.status,
      created_by: actorId,
      approved_by: null,
      created_at: now,
      updated_at: now,
    };
    state.budgets.unshift(created);
    if (created.status === 'pending_approval') {
      const approvalReq: ApprovalRequestRecord = {
        id: crypto.randomUUID(),
        company_id: state.company.id,
        request_type: 'budget',
        entity_type: 'budget',
        entity_id: created.id,
        title: `Budget Approval: ${created.name} (FY ${created.fiscal_year})`,
        summary: `Requested allocation: ${created.currency_code} ${(created.allocated_minor / 100).toFixed(2)}`,
        requester_id: actorId,
        assigned_approver_id: input.assigned_approver_id || null,
        status: 'pending',
        submitted_at: now,
        resolved_at: null,
        resolved_by: null,
      };
      state.approval_requests.unshift(approvalReq);
      state.approval_history.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        approval_request_id: approvalReq.id,
        actor_id: actorId,
        action: 'submitted',
        comment: 'Budget submitted for separation-of-duties approval.',
        created_at: now,
      });
    }
    appendPreviewAudit(state, actorId, 'budget.created', 'budget', created.id, {
      name: created.name,
      allocated_minor: created.allocated_minor,
      status: created.status,
    });
    savePreviewState(state);
    return created;
  },

  async updateBudgetStatus(
    actorId: string,
    companyId: string,
    budgetId: string,
    status: BudgetStatus
  ): Promise<BudgetRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data: existing, error: fetchErr } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', budgetId)
        .eq('company_id', companyId)
        .single();
      if (fetchErr || !existing) throw new Error(fetchErr?.message ?? 'Budget not found.');
      const b = existing as BudgetRecord;
      if (status === 'approved' && b.created_by === actorId) {
        throw new Error('Separation of duties: budget creator cannot self-approve.');
      }
      const { data, error } = await supabase
        .from('budgets')
        .update({
          status,
          approved_by: status === 'approved' ? actorId : b.approved_by,
        })
        .eq('id', budgetId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      if (status === 'pending_approval') {
        const { data: reqData } = await supabase
          .from('approval_requests')
          .insert({
            company_id: companyId,
            request_type: 'budget',
            entity_type: 'budget',
            entity_id: b.id,
            title: `Budget Approval: ${b.name} (FY ${b.fiscal_year})`,
            summary: `Allocated ${b.allocated_minor} (${b.currency_code})`,
            requester_id: actorId,
            status: 'pending',
          })
          .select('*')
          .single();
        if (reqData) {
          await supabase.from('approval_history').insert({
            company_id: companyId,
            approval_request_id: (reqData as ApprovalRequestRecord).id,
            actor_id: actorId,
            action: 'submitted',
            comment: 'Submitted for budget approval.',
          });
        }
      }
      return data as BudgetRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const budget = state.budgets.find((b) => b.id === budgetId);
    if (!budget) throw new Error('Budget not found.');
    if (status === 'approved' && budget.created_by === actorId) {
      throw new Error('Separation of duties: budget creator cannot self-approve their own budget.');
    }
    const now = new Date().toISOString();
    budget.status = status;
    if (status === 'approved') budget.approved_by = actorId;
    budget.updated_at = now;

    if (
      status === 'pending_approval' &&
      !state.approval_requests.some((r) => r.entity_type === 'budget' && r.entity_id === budget.id && r.status === 'pending')
    ) {
      const approvalReq: ApprovalRequestRecord = {
        id: crypto.randomUUID(),
        company_id: state.company.id,
        request_type: 'budget',
        entity_type: 'budget',
        entity_id: budget.id,
        title: `Budget Approval: ${budget.name} (FY ${budget.fiscal_year})`,
        summary: `Requested allocation: ${budget.currency_code} ${(budget.allocated_minor / 100).toFixed(2)}`,
        requester_id: actorId,
        assigned_approver_id: null,
        status: 'pending',
        submitted_at: now,
        resolved_at: null,
        resolved_by: null,
      };
      state.approval_requests.unshift(approvalReq);
      state.approval_history.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        approval_request_id: approvalReq.id,
        actor_id: actorId,
        action: 'submitted',
        comment: 'Budget submitted for executive/finance review.',
        created_at: now,
      });
    }

    appendPreviewAudit(state, actorId, 'budget.status_updated', 'budget', budget.id, { status });
    savePreviewState(state);
    return budget;
  },

  async listInvoices(companyId: string): Promise<InvoiceRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', companyId)
        .order('issue_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as InvoiceRecord[];
    }
    return [...loadPreviewState().invoices].sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  },

  async createInvoice(actorId: string, companyId: string, input: CreateInvoiceInput): Promise<InvoiceRecord> {
    const subtotalMinor = Math.max(0, Math.trunc(input.subtotal_minor));
    const taxMinor = Math.max(0, Math.trunc(input.tax_minor));
    const totalMinor = subtotalMinor + taxMinor;
    if (totalMinor <= 0) {
      throw new Error('Invoice total must be greater than zero.');
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const initialStatus: InvoiceRecord['status'] = input.issue_immediately
      ? input.due_date < todayIso
        ? 'overdue'
        : 'issued'
      : 'draft';

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId,
          client_id: input.client_id,
          project_id: input.project_id || null,
          business_unit_id: input.business_unit_id || null,
          invoice_number: input.invoice_number.trim().toUpperCase(),
          issue_date: input.issue_date,
          due_date: input.due_date,
          subtotal_minor: subtotalMinor,
          tax_minor: taxMinor,
          total_minor: totalMinor,
          paid_minor: 0,
          currency_code: input.currency_code.toUpperCase(),
          status: initialStatus,
          created_by: actorId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as InvoiceRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const code = input.invoice_number.trim().toUpperCase();
    if (state.invoices.some((i) => i.invoice_number === code)) {
      throw new Error('An invoice with this number already exists.');
    }
    const now = new Date().toISOString();
    const created: InvoiceRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      client_id: input.client_id,
      project_id: input.project_id || null,
      business_unit_id: input.business_unit_id || null,
      invoice_number: code,
      issue_date: input.issue_date,
      due_date: input.due_date,
      subtotal_minor: subtotalMinor,
      tax_minor: taxMinor,
      total_minor: totalMinor,
      paid_minor: 0,
      currency_code: input.currency_code.toUpperCase(),
      status: initialStatus,
      created_by: actorId,
      created_at: now,
      updated_at: now,
    };
    state.invoices.unshift(created);
    appendPreviewAudit(state, actorId, 'invoice.created', 'invoice', created.id, {
      invoice_number: created.invoice_number,
      total_minor: created.total_minor,
      status: created.status,
    });
    savePreviewState(state);
    return created;
  },

  async issueInvoice(actorId: string, companyId: string, invoiceId: string): Promise<InvoiceRecord> {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (isSupabaseConfigured && supabase) {
      const { data: existing, error: fErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .single();
      if (fErr || !existing) throw new Error(fErr?.message ?? 'Invoice not found.');
      const inv = existing as InvoiceRecord;
      if (inv.status !== 'draft') throw new Error('Only draft invoices can be issued.');
      const nextStatus = inv.due_date < todayIso ? 'overdue' : 'issued';
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: nextStatus })
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as InvoiceRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const inv = state.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.status !== 'draft') throw new Error('Only draft invoices can be issued.');
    inv.status = inv.due_date < todayIso ? 'overdue' : 'issued';
    inv.updated_at = new Date().toISOString();
    appendPreviewAudit(state, actorId, 'invoice.issued', 'invoice', inv.id, { invoice_number: inv.invoice_number });
    savePreviewState(state);
    return inv;
  },

  async voidInvoice(actorId: string, companyId: string, invoiceId: string): Promise<InvoiceRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data: existing, error: fErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .single();
      if (fErr || !existing) throw new Error(fErr?.message ?? 'Invoice not found.');
      const inv = existing as InvoiceRecord;
      if (inv.paid_minor > 0) throw new Error('Cannot void an invoice that has recorded payments.');
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'void' })
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as InvoiceRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const inv = state.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.paid_minor > 0) throw new Error('Cannot void an invoice with recorded payments. Post a ledger reversal instead.');
    inv.status = 'void';
    inv.updated_at = new Date().toISOString();
    appendPreviewAudit(state, actorId, 'invoice.voided', 'invoice', inv.id, { invoice_number: inv.invoice_number });
    savePreviewState(state);
    return inv;
  },

  async listInvoicePayments(companyId: string, invoiceId?: string): Promise<InvoicePaymentRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase
        .from('invoice_payments')
        .select('*')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false });
      if (invoiceId) q = q.eq('invoice_id', invoiceId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as InvoicePaymentRecord[];
    }
    const all = loadPreviewState().invoice_payments;
    const filtered = invoiceId ? all.filter((p) => p.invoice_id === invoiceId) : all;
    return [...filtered].sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  },

  async recordInvoicePayment(
    actorId: string,
    companyId: string,
    input: RecordInvoicePaymentInput
  ): Promise<{ payment: InvoicePaymentRecord; invoice: InvoiceRecord }> {
    const amountMinor = Math.trunc(input.amount_minor);
    if (amountMinor <= 0) {
      throw new Error('Payment amount must be positive.');
    }

    if (isSupabaseConfigured && supabase) {
      const { data: invData, error: invErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', input.invoice_id)
        .eq('company_id', companyId)
        .single();
      if (invErr || !invData) throw new Error(invErr?.message ?? 'Invoice not found.');
      const inv = invData as InvoiceRecord;
      if (inv.status === 'draft' || inv.status === 'void') {
        throw new Error('Payments can only be recorded on issued or partially paid invoices.');
      }
      const remaining = inv.total_minor - inv.paid_minor;
      if (amountMinor > remaining) {
        throw new Error('Payment exceeds remaining invoice balance.');
      }

      const { data: payData, error: payErr } = await supabase
        .from('invoice_payments')
        .insert({
          company_id: companyId,
          invoice_id: inv.id,
          account_id: input.account_id,
          amount_minor: amountMinor,
          currency_code: inv.currency_code,
          payment_date: input.payment_date,
          payment_method: input.payment_method.trim(),
          reference_code: input.reference_code?.trim() || null,
          recorded_by: actorId,
        })
        .select('*')
        .single();
      if (payErr) throw new Error(payErr.message);

      const nextPaid = inv.paid_minor + amountMinor;
      const nextStatus: InvoiceRecord['status'] = nextPaid >= inv.total_minor ? 'paid' : 'partially_paid';
      const { data: updatedInv, error: updErr } = await supabase
        .from('invoices')
        .update({ paid_minor: nextPaid, status: nextStatus })
        .eq('id', inv.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (updErr) throw new Error(updErr.message);

      // Post received cash to immutable ledger as actual_revenue
      let categoryId = input.revenue_category_id || '';
      if (!categoryId) {
        const { data: cats } = await supabase
          .from('financial_categories')
          .select('id')
          .eq('company_id', companyId)
          .eq('flow_type', 'income')
          .limit(1);
        categoryId = (cats?.[0] as { id: string } | undefined)?.id ?? '';
      }
      if (categoryId) {
        await supabase.from('financial_transactions').insert({
          company_id: companyId,
          business_unit_id: inv.business_unit_id,
          project_id: inv.project_id,
          account_id: input.account_id,
          category_id: categoryId,
          transaction_type: 'actual_revenue',
          amount_minor: amountMinor,
          currency_code: inv.currency_code,
          transaction_date: input.payment_date,
          description: `Invoice payment received (${inv.invoice_number})`,
          reference_number: input.reference_code?.trim() || inv.invoice_number,
          approval_status: 'approved',
          recorded_by: actorId,
          approved_by: actorId,
        });
      }

      return { payment: payData as InvoicePaymentRecord, invoice: updatedInv as InvoiceRecord };
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'finance.manage');
    const inv = state.invoices.find((i) => i.id === input.invoice_id);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.status === 'draft' || inv.status === 'void') {
      throw new Error('Payments can only be recorded on issued, overdue, or partially paid invoices.');
    }
    const remaining = inv.total_minor - inv.paid_minor;
    if (amountMinor > remaining) {
      throw new Error('Payment exceeds the remaining invoice receivable balance.');
    }

    const now = new Date().toISOString();
    const payment: InvoicePaymentRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      invoice_id: inv.id,
      account_id: input.account_id,
      amount_minor: amountMinor,
      currency_code: inv.currency_code,
      payment_date: input.payment_date,
      payment_method: input.payment_method.trim(),
      reference_code: input.reference_code?.trim() || null,
      recorded_by: actorId,
      created_at: now,
    };
    state.invoice_payments.unshift(payment);
    inv.paid_minor += amountMinor;
    inv.status = inv.paid_minor >= inv.total_minor ? 'paid' : 'partially_paid';
    inv.updated_at = now;

    const incomeCategory =
      state.financial_categories.find((c) => c.id === input.revenue_category_id) ??
      state.financial_categories.find((c) => c.code === 'REV-CLIENT') ??
      state.financial_categories.find((c) => c.flow_type === 'income');

    if (incomeCategory) {
      state.financial_transactions.unshift({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        business_unit_id: inv.business_unit_id,
        project_id: inv.project_id,
        account_id: input.account_id,
        category_id: incomeCategory.id,
        transaction_type: 'actual_revenue',
        amount_minor: amountMinor,
        currency_code: inv.currency_code,
        transaction_date: input.payment_date,
        description: `Payment received for ${inv.invoice_number} (${payment.payment_method})`,
        reference_number: payment.reference_code ?? inv.invoice_number,
        parent_transaction_id: null,
        approval_status: 'approved',
        recorded_by: actorId,
        approved_by: actorId,
        created_at: now,
      });
    }

    appendPreviewAudit(state, actorId, 'invoice.payment_recorded', 'invoice', inv.id, {
      invoice_number: inv.invoice_number,
      amount_minor: amountMinor,
      new_status: inv.status,
    });
    savePreviewState(state);
    return { payment, invoice: inv };
  },

  async listApprovalRequests(companyId: string): Promise<ApprovalRequestRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('submitted_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ApprovalRequestRecord[];
    }
    return [...loadPreviewState().approval_requests].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  },

  async createApprovalRequest(
    actorId: string,
    companyId: string,
    input: CreateApprovalRequestInput
  ): Promise<ApprovalRequestRecord> {
    const entityId = input.entity_id || crypto.randomUUID();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('approval_requests')
        .insert({
          company_id: companyId,
          request_type: input.request_type,
          entity_type: input.entity_type,
          entity_id: entityId,
          title: input.title.trim(),
          summary: input.summary?.trim() || null,
          requester_id: actorId,
          assigned_approver_id: input.assigned_approver_id || null,
          status: 'pending',
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const req = data as ApprovalRequestRecord;
      await supabase.from('approval_history').insert({
        company_id: companyId,
        approval_request_id: req.id,
        actor_id: actorId,
        action: 'submitted',
        comment: input.summary?.trim() || 'Submitted approval request.',
      });
      return req;
    }

    const state = loadPreviewState();
    const now = new Date().toISOString();
    const created: ApprovalRequestRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      request_type: input.request_type,
      entity_type: input.entity_type,
      entity_id: entityId,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      requester_id: actorId,
      assigned_approver_id: input.assigned_approver_id || null,
      status: 'pending',
      submitted_at: now,
      resolved_at: null,
      resolved_by: null,
    };
    state.approval_requests.unshift(created);
    state.approval_history.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      approval_request_id: created.id,
      actor_id: actorId,
      action: 'submitted',
      comment: created.summary,
      created_at: now,
    });
    for (const p of state.profiles) {
      if (
        p.id !== actorId &&
        (p.id === created.assigned_approver_id ||
          (!created.assigned_approver_id && getPreviewUserPermissions(state, p.id).has('approvals.resolve')))
      ) {
        pushPreviewNotification(
          state,
          p.id,
          'approval',
          'New Approval Request',
          created.title,
          `/approvals?request=${created.id}`
        );
      }
    }
    appendPreviewAudit(state, actorId, 'approval_request.submitted', 'approval_request', created.id, {
      request_type: created.request_type,
      title: created.title,
    });
    savePreviewState(state);
    return created;
  },

  async listApprovalHistory(companyId: string, approvalRequestId: string): Promise<ApprovalHistoryRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('approval_history')
        .select('*')
        .eq('company_id', companyId)
        .eq('approval_request_id', approvalRequestId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ApprovalHistoryRecord[];
    }
    return loadPreviewState()
      .approval_history.filter((h) => h.approval_request_id === approvalRequestId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async addApprovalComment(
    actorId: string,
    companyId: string,
    approvalRequestId: string,
    comment: string
  ): Promise<ApprovalHistoryRecord> {
    const clean = comment.trim();
    if (!clean) throw new Error('Comment cannot be empty.');
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('approval_history')
        .insert({
          company_id: companyId,
          approval_request_id: approvalRequestId,
          actor_id: actorId,
          action: 'commented',
          comment: clean,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ApprovalHistoryRecord;
    }

    const state = loadPreviewState();
    const entry: ApprovalHistoryRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      approval_request_id: approvalRequestId,
      actor_id: actorId,
      action: 'commented',
      comment: clean,
      created_at: new Date().toISOString(),
    };
    state.approval_history.push(entry);
    savePreviewState(state);
    return entry;
  },

  async reassignApprovalRequest(
    actorId: string,
    companyId: string,
    approvalRequestId: string,
    newApproverId: string
  ): Promise<ApprovalRequestRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('approval_requests')
        .update({ assigned_approver_id: newApproverId })
        .eq('id', approvalRequestId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      await supabase.from('approval_history').insert({
        company_id: companyId,
        approval_request_id: approvalRequestId,
        actor_id: actorId,
        action: 'reassigned',
        comment: `Reassigned approver.`,
      });
      return data as ApprovalRequestRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'approvals.resolve');
    const req = state.approval_requests.find((r) => r.id === approvalRequestId);
    if (!req) throw new Error('Approval request not found.');
    if (req.status !== 'pending') throw new Error('Only pending requests can be reassigned.');
    if (newApproverId === req.requester_id) {
      throw new Error('Separation of duties: cannot assign requester as their own approver.');
    }
    req.assigned_approver_id = newApproverId;
    const approver = state.profiles.find((p) => p.id === newApproverId);
    state.approval_history.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      approval_request_id: req.id,
      actor_id: actorId,
      action: 'reassigned',
      comment: `Assigned to ${approver?.full_name ?? 'new approver'}.`,
      created_at: new Date().toISOString(),
    });
    pushPreviewNotification(
      state,
      newApproverId,
      'approval',
      'Approval Assigned to You',
      req.title,
      `/approvals?request=${req.id}`
    );
    savePreviewState(state);
    return req;
  },

  async resolveApprovalRequest(
    actorId: string,
    companyId: string,
    approvalRequestId: string,
    decision: Extract<ApprovalStatus, 'approved' | 'rejected' | 'cancelled'>,
    comment?: string
  ): Promise<ApprovalRequestRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data: existing, error: fetchErr } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('id', approvalRequestId)
        .eq('company_id', companyId)
        .single();
      if (fetchErr || !existing) throw new Error(fetchErr?.message ?? 'Approval request not found.');
      const req = existing as ApprovalRequestRecord;
      if (req.status !== 'pending') throw new Error('Approval request has already been resolved.');
      if (decision !== 'cancelled' && req.requester_id === actorId) {
        throw new Error('Separation of duties violation: requester cannot approve or reject their own request.');
      }

      const { data, error } = await supabase
        .from('approval_requests')
        .update({
          status: decision,
          resolved_at: now,
          resolved_by: decision === 'cancelled' ? null : actorId,
        })
        .eq('id', approvalRequestId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      await supabase.from('approval_history').insert({
        company_id: companyId,
        approval_request_id: approvalRequestId,
        actor_id: actorId,
        action: decision,
        comment: comment?.trim() || null,
      });

      if (req.entity_type === 'budget') {
        await supabase
          .from('budgets')
          .update({
            status: decision === 'approved' ? 'approved' : 'draft',
            approved_by: decision === 'approved' ? actorId : null,
          })
          .eq('id', req.entity_id)
          .eq('company_id', companyId);
      } else if (req.entity_type === 'leave_request') {
        const leaveStatus: LeaveStatus =
          decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'cancelled';
        await supabase
          .from('leave_requests')
          .update({
            status: leaveStatus,
            reviewed_by: decision === 'cancelled' ? null : actorId,
            reviewed_at: now,
          })
          .eq('id', req.entity_id)
          .eq('company_id', companyId);
      }

      return data as ApprovalRequestRecord;
    }

    const state = loadPreviewState();
    const req = state.approval_requests.find((r) => r.id === approvalRequestId);
    if (!req) throw new Error('Approval request not found.');
    if (req.status !== 'pending') throw new Error('This approval request is already resolved.');

    if (decision === 'cancelled') {
      if (req.requester_id !== actorId) {
        throw new Error('Only the original requester can cancel a pending request.');
      }
    } else {
      requirePreviewPermission(state, actorId, 'approvals.resolve');
      if (req.requester_id === actorId) {
        throw new Error('Separation of duties violation: you cannot approve or reject your own request.');
      }
    }

    req.status = decision;
    req.resolved_at = now;
    req.resolved_by = decision === 'cancelled' ? null : actorId;

    state.approval_history.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      approval_request_id: req.id,
      actor_id: actorId,
      action: decision,
      comment: comment?.trim() || null,
      created_at: now,
    });

    // Synchronize linked domain record
    if (req.entity_type === 'financial_transaction') {
      const tx = state.financial_transactions.find((t) => t.id === req.entity_id);
      if (tx) {
        tx.approval_status = decision === 'approved' ? 'approved' : 'rejected';
        tx.approved_by = decision === 'approved' ? actorId : null;
      }
    } else if (req.entity_type === 'budget') {
      const budget = state.budgets.find((b) => b.id === req.entity_id);
      if (budget) {
        budget.status = decision === 'approved' ? 'approved' : 'draft';
        budget.approved_by = decision === 'approved' ? actorId : null;
        budget.updated_at = now;
      }
    } else if (req.entity_type === 'leave_request') {
      const leave = state.leave_requests.find((l) => l.id === req.entity_id);
      if (leave) {
        leave.status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'cancelled';
        leave.reviewed_by = decision === 'cancelled' ? null : actorId;
        leave.reviewed_at = now;
      }
    }

    if (req.requester_id !== actorId) {
      pushPreviewNotification(
        state,
        req.requester_id,
        'approval',
        `Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        `${req.title} was ${decision}.`,
        `/approvals?request=${req.id}`
      );
    }

    appendPreviewAudit(state, actorId, `approval_request.${decision}`, 'approval_request', req.id, {
      request_type: req.request_type,
      entity_type: req.entity_type,
      entity_id: req.entity_id,
    });
    savePreviewState(state);
    return req;
  },

  // ============================================================================
  // Phase 6: Meetings & Decisions, Attendance & Leave, Documents
  // ============================================================================

  async listMeetings(companyId: string): Promise<MeetingRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('company_id', companyId)
        .order('scheduled_start', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as MeetingRecord[];
    }
    return [...loadPreviewState().meetings].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  },

  async createMeeting(actorId: string, companyId: string, input: CreateMeetingInput): Promise<MeetingRecord> {
    if (new Date(input.scheduled_end) <= new Date(input.scheduled_start)) {
      throw new Error('Meeting end time must be after the start time.');
    }
    const uniqueParticipantIds = Array.from(new Set([actorId, ...(input.participant_ids ?? [])]));

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meetings')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          project_id: input.project_id || null,
          title: input.title.trim(),
          agenda: input.agenda?.trim() || null,
          meeting_type: input.meeting_type,
          scheduled_start: input.scheduled_start,
          scheduled_end: input.scheduled_end,
          location_or_link: input.location_or_link?.trim() || null,
          organizer_id: actorId,
          status: 'scheduled',
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const meeting = data as MeetingRecord;
      if (uniqueParticipantIds.length > 0) {
        await supabase.from('meeting_participants').insert(
          uniqueParticipantIds.map((pid) => ({
            company_id: companyId,
            meeting_id: meeting.id,
            profile_id: pid,
            rsvp_status: pid === actorId ? 'accepted' : 'invited',
          }))
        );
      }
      return meeting;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const now = new Date().toISOString();
    const meeting: MeetingRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      project_id: input.project_id || null,
      title: input.title.trim(),
      agenda: input.agenda?.trim() || null,
      meeting_type: input.meeting_type,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      location_or_link: input.location_or_link?.trim() || null,
      organizer_id: actorId,
      status: 'scheduled',
      created_at: now,
      updated_at: now,
    };
    state.meetings.push(meeting);
    for (const pid of uniqueParticipantIds) {
      state.meeting_participants.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        meeting_id: meeting.id,
        profile_id: pid,
        rsvp_status: pid === actorId ? 'accepted' : 'invited',
        attended: null,
      });
      if (pid !== actorId) {
        pushPreviewNotification(
          state,
          pid,
          'meeting',
          'Meeting Invitation',
          `${meeting.title} (${new Date(meeting.scheduled_start).toLocaleString()})`,
          `/meetings?meeting=${meeting.id}`
        );
      }
    }
    appendPreviewAudit(state, actorId, 'meeting.scheduled', 'meeting', meeting.id, {
      title: meeting.title,
      meeting_type: meeting.meeting_type,
      participants: uniqueParticipantIds.length,
    });
    savePreviewState(state);
    return meeting;
  },

  async updateMeetingStatus(
    actorId: string,
    companyId: string,
    meetingId: string,
    status: MeetingStatus
  ): Promise<MeetingRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meetings')
        .update({ status })
        .eq('id', meetingId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as MeetingRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const mtg = state.meetings.find((m) => m.id === meetingId);
    if (!mtg) throw new Error('Meeting not found.');
    mtg.status = status;
    mtg.updated_at = new Date().toISOString();
    appendPreviewAudit(state, actorId, 'meeting.status_updated', 'meeting', mtg.id, { status });
    savePreviewState(state);
    return mtg;
  },

  async listMeetingParticipants(companyId: string, meetingId?: string): Promise<MeetingParticipantRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase.from('meeting_participants').select('*').eq('company_id', companyId);
      if (meetingId) q = q.eq('meeting_id', meetingId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as MeetingParticipantRecord[];
    }
    const all = loadPreviewState().meeting_participants;
    return meetingId ? all.filter((mp) => mp.meeting_id === meetingId) : [...all];
  },

  async upsertMeetingParticipant(
    actorId: string,
    companyId: string,
    meetingId: string,
    profileId: string
  ): Promise<MeetingParticipantRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meeting_participants')
        .upsert(
          { company_id: companyId, meeting_id: meetingId, profile_id: profileId, rsvp_status: 'invited' },
          { onConflict: 'meeting_id,profile_id' }
        )
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as MeetingParticipantRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const existing = state.meeting_participants.find(
      (mp) => mp.meeting_id === meetingId && mp.profile_id === profileId
    );
    if (existing) return existing;
    const created: MeetingParticipantRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      meeting_id: meetingId,
      profile_id: profileId,
      rsvp_status: 'invited',
      attended: null,
    };
    state.meeting_participants.push(created);
    const mtg = state.meetings.find((m) => m.id === meetingId);
    if (mtg && profileId !== actorId) {
      pushPreviewNotification(
        state,
        profileId,
        'meeting',
        'Added to Meeting',
        `You were added to "${mtg.title}".`,
        `/meetings?meeting=${meetingId}`
      );
    }
    savePreviewState(state);
    return created;
  },

  async updateRsvpStatus(
    actorId: string,
    companyId: string,
    meetingId: string,
    targetProfileId: string,
    rsvpStatus: RsvpStatus,
    attended?: boolean | null
  ): Promise<MeetingParticipantRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meeting_participants')
        .upsert(
          {
            company_id: companyId,
            meeting_id: meetingId,
            profile_id: targetProfileId,
            rsvp_status: rsvpStatus,
            ...(attended !== undefined ? { attended } : {}),
          },
          { onConflict: 'meeting_id,profile_id' }
        )
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as MeetingParticipantRecord;
    }

    const state = loadPreviewState();
    if (targetProfileId !== actorId) {
      requirePreviewPermission(state, actorId, 'meetings.manage');
    }
    const existing = state.meeting_participants.find(
      (mp) => mp.meeting_id === meetingId && mp.profile_id === targetProfileId
    );
    if (existing) {
      existing.rsvp_status = rsvpStatus;
      if (attended !== undefined) existing.attended = attended;
      savePreviewState(state);
      return existing;
    }
    const created: MeetingParticipantRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      meeting_id: meetingId,
      profile_id: targetProfileId,
      rsvp_status: rsvpStatus,
      attended: attended ?? null,
    };
    state.meeting_participants.push(created);
    savePreviewState(state);
    return created;
  },

  async listMeetingNotes(companyId: string, meetingId: string): Promise<MeetingNoteRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meeting_notes')
        .select('*')
        .eq('company_id', companyId)
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as MeetingNoteRecord[];
    }
    return loadPreviewState()
      .meeting_notes.filter((n) => n.meeting_id === meetingId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addMeetingNote(actorId: string, companyId: string, meetingId: string, content: string): Promise<MeetingNoteRecord> {
    const clean = content.trim();
    if (!clean) throw new Error('Meeting note content cannot be empty.');
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('meeting_notes')
        .insert({ company_id: companyId, meeting_id: meetingId, author_id: actorId, content: clean })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as MeetingNoteRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.view');
    const now = new Date().toISOString();
    const note: MeetingNoteRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      meeting_id: meetingId,
      author_id: actorId,
      content: clean,
      created_at: now,
      updated_at: now,
    };
    state.meeting_notes.unshift(note);
    savePreviewState(state);
    return note;
  },

  async listDecisions(companyId: string): Promise<DecisionRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DecisionRecord[];
    }
    return [...loadPreviewState().decisions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createDecision(actorId: string, companyId: string, input: CreateDecisionInput): Promise<DecisionRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('decisions')
        .insert({
          company_id: companyId,
          meeting_id: input.meeting_id || null,
          business_unit_id: input.business_unit_id || null,
          title: input.title.trim(),
          context: input.context.trim(),
          outcome: input.outcome.trim(),
          status: input.status,
          decided_by: input.status === 'approved' ? actorId : null,
          decided_at: input.status === 'approved' ? now : null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as DecisionRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const created: DecisionRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      meeting_id: input.meeting_id || null,
      business_unit_id: input.business_unit_id || null,
      title: input.title.trim(),
      context: input.context.trim(),
      outcome: input.outcome.trim(),
      status: input.status,
      decided_by: input.status === 'approved' ? actorId : null,
      decided_at: input.status === 'approved' ? now : null,
      created_at: now,
      updated_at: now,
    };
    state.decisions.unshift(created);
    appendPreviewAudit(state, actorId, 'decision.recorded', 'decision', created.id, {
      title: created.title,
      status: created.status,
    });
    savePreviewState(state);
    return created;
  },

  async updateDecisionStatus(
    actorId: string,
    companyId: string,
    decisionId: string,
    status: DecisionStatus
  ): Promise<DecisionRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('decisions')
        .update({
          status,
          ...(status === 'approved' ? { decided_by: actorId, decided_at: now } : {}),
        })
        .eq('id', decisionId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as DecisionRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const dec = state.decisions.find((d) => d.id === decisionId);
    if (!dec) throw new Error('Decision record not found.');
    dec.status = status;
    if (status === 'approved') {
      dec.decided_by = actorId;
      dec.decided_at = now;
    }
    dec.updated_at = now;
    appendPreviewAudit(state, actorId, 'decision.status_updated', 'decision', dec.id, { status });
    savePreviewState(state);
    return dec;
  },

  async listDecisionActions(companyId: string, decisionId?: string): Promise<DecisionActionRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase
        .from('decision_actions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (decisionId) q = q.eq('decision_id', decisionId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as DecisionActionRecord[];
    }
    const all = loadPreviewState().decision_actions;
    const filtered = decisionId ? all.filter((a) => a.decision_id === decisionId) : all;
    return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createDecisionAction(
    actorId: string,
    companyId: string,
    input: CreateDecisionActionInput
  ): Promise<DecisionActionRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('decision_actions')
        .insert({
          company_id: companyId,
          decision_id: input.decision_id,
          title: input.title.trim(),
          owner_id: input.owner_id,
          due_date: input.due_date || null,
          status: 'open',
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as DecisionActionRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const now = new Date().toISOString();
    const created: DecisionActionRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      decision_id: input.decision_id,
      title: input.title.trim(),
      owner_id: input.owner_id,
      due_date: input.due_date || null,
      status: 'open',
      created_at: now,
      updated_at: now,
    };
    state.decision_actions.unshift(created);
    if (created.owner_id !== actorId) {
      pushPreviewNotification(
        state,
        created.owner_id,
        'meeting',
        'Decision Action Assigned',
        created.title,
        '/meetings?tab=decisions'
      );
    }
    savePreviewState(state);
    return created;
  },

  async updateDecisionActionStatus(
    actorId: string,
    companyId: string,
    actionId: string,
    status: DecisionActionStatus
  ): Promise<DecisionActionRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('decision_actions')
        .update({ status })
        .eq('id', actionId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as DecisionActionRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'meetings.manage');
    const item = state.decision_actions.find((a) => a.id === actionId);
    if (!item) throw new Error('Decision action item not found.');
    item.status = status;
    item.updated_at = new Date().toISOString();
    savePreviewState(state);
    return item;
  },

  async listAttendanceRecords(companyId: string, profileId?: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase
        .from('attendance_records')
        .select('*')
        .eq('company_id', companyId)
        .order('work_date', { ascending: false });
      if (profileId) q = q.eq('profile_id', profileId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as AttendanceRecord[];
    }
    const all = loadPreviewState().attendance_records;
    const filtered = profileId ? all.filter((r) => r.profile_id === profileId) : all;
    return [...filtered].sort((a, b) => b.work_date.localeCompare(a.work_date));
  },

  async checkInAttendance(
    actorId: string,
    companyId: string,
    input: CheckInAttendanceInput
  ): Promise<AttendanceRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('company_id', companyId)
        .eq('profile_id', actorId)
        .eq('work_date', input.work_date)
        .maybeSingle();

      if (existing) {
        const rec = existing as AttendanceRecord;
        const { data, error } = await supabase
          .from('attendance_records')
          .update({
            status: input.status,
            check_in_at: rec.check_in_at ?? now,
            notes: input.notes?.trim() || rec.notes,
          })
          .eq('id', rec.id)
          .eq('company_id', companyId)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return data as AttendanceRecord;
      }

      const { data, error } = await supabase
        .from('attendance_records')
        .insert({
          company_id: companyId,
          profile_id: actorId,
          work_date: input.work_date,
          check_in_at: now,
          status: input.status,
          notes: input.notes?.trim() || null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as AttendanceRecord;
    }

    const state = loadPreviewState();
    const existing = state.attendance_records.find(
      (r) => r.profile_id === actorId && r.work_date === input.work_date
    );
    if (existing) {
      existing.status = input.status;
      existing.check_in_at = existing.check_in_at ?? now;
      if (input.notes !== undefined) existing.notes = input.notes?.trim() || null;
      savePreviewState(state);
      return existing;
    }

    const created: AttendanceRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      profile_id: actorId,
      work_date: input.work_date,
      check_in_at: now,
      check_out_at: null,
      status: input.status,
      notes: input.notes?.trim() || null,
      created_at: now,
    };
    state.attendance_records.unshift(created);
    savePreviewState(state);
    return created;
  },

  async checkOutAttendance(
    actorId: string,
    companyId: string,
    attendanceId: string,
    notes?: string | null
  ): Promise<AttendanceRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          check_out_at: now,
          ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        })
        .eq('id', attendanceId)
        .eq('company_id', companyId)
        .eq('profile_id', actorId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as AttendanceRecord;
    }

    const state = loadPreviewState();
    const rec = state.attendance_records.find((r) => r.id === attendanceId && r.profile_id === actorId);
    if (!rec) throw new Error('Attendance record not found.');
    rec.check_out_at = now;
    if (notes !== undefined) rec.notes = notes?.trim() || null;
    savePreviewState(state);
    return rec;
  },

  async recordAttendanceAdmin(
    actorId: string,
    companyId: string,
    input: RecordAttendanceAdminInput
  ): Promise<AttendanceRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('attendance_records')
        .upsert(
          {
            company_id: companyId,
            profile_id: input.profile_id,
            work_date: input.work_date,
            status: input.status,
            notes: input.notes?.trim() || null,
          },
          { onConflict: 'profile_id,work_date' }
        )
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as AttendanceRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'attendance.manage');
    const existing = state.attendance_records.find(
      (r) => r.profile_id === input.profile_id && r.work_date === input.work_date
    );
    if (existing) {
      existing.status = input.status;
      existing.notes = input.notes?.trim() || null;
      appendPreviewAudit(state, actorId, 'attendance.updated', 'attendance_record', existing.id, {
        profile_id: input.profile_id,
        status: input.status,
      });
      savePreviewState(state);
      return existing;
    }
    const created: AttendanceRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      profile_id: input.profile_id,
      work_date: input.work_date,
      check_in_at: null,
      check_out_at: null,
      status: input.status,
      notes: input.notes?.trim() || null,
      created_at: new Date().toISOString(),
    };
    state.attendance_records.unshift(created);
    appendPreviewAudit(state, actorId, 'attendance.recorded', 'attendance_record', created.id, {
      profile_id: input.profile_id,
      work_date: input.work_date,
      status: input.status,
    });
    savePreviewState(state);
    return created;
  },

  async listLeaveRequests(companyId: string, profileId?: string): Promise<LeaveRequestRecord[]> {
    if (isSupabaseConfigured && supabase) {
      let q = supabase
        .from('leave_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (profileId) q = q.eq('profile_id', profileId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaveRequestRecord[];
    }
    const all = loadPreviewState().leave_requests;
    const filtered = profileId ? all.filter((r) => r.profile_id === profileId) : all;
    return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createLeaveRequest(
    actorId: string,
    companyId: string,
    input: CreateLeaveRequestInput
  ): Promise<LeaveRequestRecord> {
    if (input.end_date < input.start_date) {
      throw new Error('Leave end date cannot precede start date.');
    }
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('leave_requests')
        .insert({
          company_id: companyId,
          profile_id: actorId,
          leave_type: input.leave_type,
          start_date: input.start_date,
          end_date: input.end_date,
          reason: input.reason?.trim() || null,
          status: 'pending',
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const leave = data as LeaveRequestRecord;

      const { data: appReq } = await supabase
        .from('approval_requests')
        .insert({
          company_id: companyId,
          request_type: 'leave',
          entity_type: 'leave_request',
          entity_id: leave.id,
          title: `Leave request (${input.leave_type}) · ${input.start_date} to ${input.end_date}`,
          summary: input.reason?.trim() || null,
          requester_id: actorId,
          assigned_approver_id: input.assigned_approver_id || null,
          status: 'pending',
        })
        .select('id')
        .single();
      if (appReq) {
        await supabase.from('approval_history').insert({
          company_id: companyId,
          approval_request_id: (appReq as { id: string }).id,
          actor_id: actorId,
          action: 'submitted',
          comment: input.reason?.trim() || 'Submitted leave request.',
        });
      }
      return leave;
    }

    const state = loadPreviewState();
    const requester = state.profiles.find((p) => p.id === actorId);
    const created: LeaveRequestRecord = {
      id: crypto.randomUUID(),
      company_id: state.company.id,
      profile_id: actorId,
      leave_type: input.leave_type,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason?.trim() || null,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      created_at: now,
    };
    state.leave_requests.unshift(created);

    const approvalId = crypto.randomUUID();
    const approvalTitle = `${requester?.full_name ?? 'Member'} · ${input.leave_type} leave (${input.start_date} → ${input.end_date})`;
    state.approval_requests.unshift({
      id: approvalId,
      company_id: state.company.id,
      request_type: 'leave',
      entity_type: 'leave_request',
      entity_id: created.id,
      title: approvalTitle,
      summary: created.reason,
      requester_id: actorId,
      assigned_approver_id: input.assigned_approver_id || null,
      status: 'pending',
      submitted_at: now,
      resolved_at: null,
      resolved_by: null,
    });
    state.approval_history.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      approval_request_id: approvalId,
      actor_id: actorId,
      action: 'submitted',
      comment: created.reason,
      created_at: now,
    });

    for (const p of state.profiles) {
      if (
        p.id !== actorId &&
        (p.id === input.assigned_approver_id ||
          (!input.assigned_approver_id && getPreviewUserPermissions(state, p.id).has('attendance.manage')))
      ) {
        pushPreviewNotification(
          state,
          p.id,
          'approval',
          'Leave Request Submitted',
          approvalTitle,
          '/attendance?tab=approvals'
        );
      }
    }
    appendPreviewAudit(state, actorId, 'leave_request.created', 'leave_request', created.id, {
      leave_type: created.leave_type,
      start_date: created.start_date,
      end_date: created.end_date,
    });
    savePreviewState(state);
    return created;
  },

  async reviewLeaveRequest(
    actorId: string,
    companyId: string,
    leaveId: string,
    decision: Extract<LeaveStatus, 'approved' | 'rejected' | 'cancelled'>,
    comment?: string
  ): Promise<LeaveRequestRecord> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data: existing, error: fErr } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('id', leaveId)
        .eq('company_id', companyId)
        .single();
      if (fErr || !existing) throw new Error(fErr?.message ?? 'Leave request not found.');
      const leave = existing as LeaveRequestRecord;
      if (leave.status !== 'pending') throw new Error('Leave request is already finalized.');
      if (decision !== 'cancelled' && leave.profile_id === actorId) {
        throw new Error('Separation of duties: you cannot approve or reject your own leave request.');
      }

      const { data, error } = await supabase
        .from('leave_requests')
        .update({
          status: decision,
          reviewed_by: decision === 'cancelled' ? null : actorId,
          reviewed_at: now,
        })
        .eq('id', leaveId)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      await supabase
        .from('approval_requests')
        .update({
          status: decision,
          resolved_at: now,
          resolved_by: decision === 'cancelled' ? null : actorId,
        })
        .eq('company_id', companyId)
        .eq('entity_type', 'leave_request')
        .eq('entity_id', leaveId)
        .eq('status', 'pending');

      return data as LeaveRequestRecord;
    }

    const state = loadPreviewState();
    const leave = state.leave_requests.find((l) => l.id === leaveId);
    if (!leave) throw new Error('Leave request not found.');
    if (leave.status !== 'pending') throw new Error('Leave request has already been resolved.');

    if (decision === 'cancelled') {
      if (leave.profile_id !== actorId) {
        throw new Error('Only the requesting team member can cancel a pending leave request.');
      }
    } else {
      requirePreviewPermission(state, actorId, 'attendance.manage');
      if (leave.profile_id === actorId) {
        throw new Error('Separation of duties violation: you cannot approve or reject your own leave request.');
      }
    }

    leave.status = decision;
    leave.reviewed_by = decision === 'cancelled' ? null : actorId;
    leave.reviewed_at = now;

    const linkedApproval = state.approval_requests.find(
      (a) => a.entity_type === 'leave_request' && a.entity_id === leave.id && a.status === 'pending'
    );
    if (linkedApproval) {
      linkedApproval.status = decision;
      linkedApproval.resolved_at = now;
      linkedApproval.resolved_by = decision === 'cancelled' ? null : actorId;
      state.approval_history.push({
        id: crypto.randomUUID(),
        company_id: state.company.id,
        approval_request_id: linkedApproval.id,
        actor_id: actorId,
        action: decision,
        comment: comment?.trim() || null,
        created_at: now,
      });
    }

    if (leave.profile_id !== actorId) {
      pushPreviewNotification(
        state,
        leave.profile_id,
        'approval',
        `Leave Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was ${decision}.`,
        '/attendance'
      );
    }

    appendPreviewAudit(state, actorId, `leave_request.${decision}`, 'leave_request', leave.id, {
      profile_id: leave.profile_id,
      leave_type: leave.leave_type,
    });
    savePreviewState(state);
    return leave;
  },

  async listDocuments(companyId: string): Promise<DocumentRecord[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DocumentRecord[];
    }
    return [...loadPreviewState().documents].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  async uploadDocument(actorId: string, companyId: string, input: UploadDocumentInput): Promise<DocumentRecord> {
    const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${companyId}/documents/${Date.now()}_${safeName}`;

    if (isSupabaseConfigured && supabase) {
      const { error: uploadErr } = await supabase.storage
        .from('company-documents')
        .upload(storagePath, input.file);
      if (uploadErr) throw new Error(uploadErr.message);

      const { data, error } = await supabase
        .from('documents')
        .insert({
          company_id: companyId,
          business_unit_id: input.business_unit_id || null,
          product_id: input.product_id || null,
          project_id: input.project_id || null,
          title: input.title.trim(),
          category: input.category,
          version_label: input.version_label.trim() || '1.0',
          storage_bucket: 'company-documents',
          storage_path: storagePath,
          mime_type: input.file.type || 'application/octet-stream',
          size_bytes: input.file.size,
          owner_id: actorId,
          access_scope: input.access_scope,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as DocumentRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'documents.manage');
    const now = new Date().toISOString();
    const docId = crypto.randomUUID();

    // Read small preview files (<= 2MB) into local preview storage for instant download verification
    if (input.file.size <= 2 * 1024 * 1024) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(input.file);
      });
      if (dataUrl) {
        state.document_contents[docId] = { dataUrl, fileName: input.file.name };
      }
    }

    const doc: DocumentRecord = {
      id: docId,
      company_id: state.company.id,
      business_unit_id: input.business_unit_id || null,
      product_id: input.product_id || null,
      project_id: input.project_id || null,
      title: input.title.trim(),
      category: input.category,
      version_label: input.version_label.trim() || '1.0',
      storage_bucket: 'company-documents',
      storage_path: storagePath,
      mime_type: input.file.type || 'application/octet-stream',
      size_bytes: input.file.size,
      owner_id: actorId,
      access_scope: input.access_scope,
      created_at: now,
      updated_at: now,
    };
    state.documents.unshift(doc);
    appendPreviewAudit(state, actorId, 'document.uploaded', 'document', doc.id, {
      title: doc.title,
      category: doc.category,
      version_label: doc.version_label,
      access_scope: doc.access_scope,
    });
    savePreviewState(state);
    return doc;
  },

  async updateDocumentMetadata(
    actorId: string,
    companyId: string,
    input: UpdateDocumentMetadataInput
  ): Promise<DocumentRecord> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('documents')
        .update({
          title: input.title.trim(),
          category: input.category,
          version_label: input.version_label.trim() || '1.0',
          access_scope: input.access_scope,
          business_unit_id: input.business_unit_id || null,
          product_id: input.product_id || null,
          project_id: input.project_id || null,
        })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as DocumentRecord;
    }

    const state = loadPreviewState();
    requirePreviewPermission(state, actorId, 'documents.manage');
    const doc = state.documents.find((d) => d.id === input.id);
    if (!doc) throw new Error('Document not found.');
    doc.title = input.title.trim();
    doc.category = input.category;
    doc.version_label = input.version_label.trim() || '1.0';
    doc.access_scope = input.access_scope;
    doc.business_unit_id = input.business_unit_id || null;
    doc.product_id = input.product_id || null;
    doc.project_id = input.project_id || null;
    doc.updated_at = new Date().toISOString();
    appendPreviewAudit(state, actorId, 'document.updated', 'document', doc.id, {
      title: doc.title,
      version_label: doc.version_label,
      access_scope: doc.access_scope,
    });
    savePreviewState(state);
    return doc;
  },

  async getDocumentDownloadUrl(_companyId: string, doc: DocumentRecord): Promise<{ url: string; fileName: string; isObjectUrl: boolean }> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket || 'company-documents')
        .createSignedUrl(doc.storage_path, 300);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Unable to generate signed URL for private document.');
      }
      const fileName = doc.storage_path.split('/').pop() ?? `${doc.title}.bin`;
      return { url: data.signedUrl, fileName, isObjectUrl: false };
    }

    const state = loadPreviewState();
    const stored = state.document_contents[doc.id];
    if (stored?.dataUrl) {
      return { url: stored.dataUrl, fileName: stored.fileName, isObjectUrl: false };
    }
    const manifest = [
      `Company ERP — Document Record`,
      `Title: ${doc.title}`,
      `Category: ${doc.category}`,
      `Version: v${doc.version_label}`,
      `Access Scope: ${doc.access_scope}`,
      `Storage Path: ${doc.storage_path}`,
      `Size: ${doc.size_bytes} bytes`,
    ].join('\n');
    const blob = new Blob([manifest], { type: 'text/plain;charset=utf-8' });
    return {
      url: URL.createObjectURL(blob),
      fileName: `${doc.title.replace(/\s+/g, '_')}_v${doc.version_label}.txt`,
      isObjectUrl: true,
    };
  },

  async listAuditLogs(companyId: string): Promise<AuditLogEntry[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditLogEntry[];
    }
    return [...loadPreviewState().audit_logs].slice(0, 50);
  },

  async getCeoDashboardMetrics(companyId: string): Promise<CeoDashboardMetrics> {
    if (isSupabaseConfigured && supabase) {
      const [
        companyRes,
        profilesRes,
        productsRes,
        projectsRes,
        tasksRes,
        leadsRes,
        finTxRes,
        finCatRes,
        invoicesRes,
        approvalsRes,
        meetingsRes,
      ] = await Promise.all([
        supabase.from('companies').select('default_currency').eq('id', companyId).single(),
        supabase.from('profiles').select('id, status').eq('company_id', companyId),
        supabase.from('products').select('id, company_id, business_unit_id, code, name, category, stage, health_status, progress_pct').eq('company_id', companyId),
        supabase.from('projects').select('id, company_id, business_unit_id, code, name, status, due_date, progress_pct').eq('company_id', companyId),
        supabase.from('tasks').select('id, company_id, project_id, product_id, title, assigned_to, priority, status, due_date').eq('company_id', companyId),
        supabase.from('leads').select('id, company_id, organization_name, stage, estimated_value_minor, currency_code').eq('company_id', companyId),
        supabase.from('financial_transactions').select('id, transaction_type, amount_minor, approval_status, parent_transaction_id, category_id').eq('company_id', companyId),
        supabase.from('financial_categories').select('id, flow_type').eq('company_id', companyId),
        supabase.from('invoices').select('id, company_id, invoice_number, total_minor, paid_minor, currency_code, status, due_date').eq('company_id', companyId),
        supabase.from('approval_requests').select('id, company_id, request_type, title, requester_id, assigned_approver_id, status, submitted_at').eq('company_id', companyId).eq('status', 'pending'),
        supabase.from('meetings').select('id, company_id, title, meeting_type, scheduled_start, scheduled_end, location_or_link, status').eq('company_id', companyId).eq('status', 'scheduled').gte('scheduled_start', new Date().toISOString()).order('scheduled_start', { ascending: true }).limit(5),
      ]);

      return computeCeoMetrics({
        currencyCode: (companyRes.data as { default_currency?: string } | null)?.default_currency ?? 'INR',
        profiles: (profilesRes.data ?? []) as Array<{ id: string; status: string }>,
        products: (productsRes.data ?? []) as CeoDashboardMetrics['products'],
        projects: (projectsRes.data ?? []) as Array<{ id: string; status: string }>,
        tasks: (tasksRes.data ?? []) as Array<{ status: string; due_date: string | null }>,
        leads: (leadsRes.data ?? []) as Array<{ stage: string; estimated_value_minor: number; currency_code: string }>,
        finTx: (finTxRes.data ?? []) as Array<{
          id: string;
          transaction_type: string;
          amount_minor: number;
          approval_status: string;
          parent_transaction_id?: string | null;
          category_id?: string;
        }>,
        finCategories: (finCatRes.data ?? []) as Array<{ id: string; flow_type: string }>,
        invoices: (invoicesRes.data ?? []) as Array<{ total_minor: number; paid_minor: number; status: string; due_date: string }>,
        approvals: (approvalsRes.data ?? []) as CeoDashboardMetrics['pendingApprovals'],
        meetings: (meetingsRes.data ?? []) as CeoDashboardMetrics['upcomingMeetings'],
      });
    }

    const state = loadPreviewState();
    return computeCeoMetrics({
      currencyCode: state.company.default_currency,
      profiles: state.profiles,
      products: state.products,
      projects: state.projects,
      tasks: state.tasks,
      leads: state.leads,
      finTx: state.financial_transactions,
      finCategories: state.financial_categories,
      invoices: state.invoices,
      approvals: state.approval_requests.filter((a) => a.status === 'pending'),
      meetings: state.meetings
        .filter((m) => m.status === 'scheduled' && m.scheduled_start >= new Date().toISOString())
        .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
        .slice(0, 5),
    });
  },

  resetPreviewDatabase(): PreviewDatabaseState {
    return resetPreviewState();
  },
};

function computeCeoMetrics(input: {
  currencyCode: string;
  profiles: Array<{ id: string; status: string }>;
  products: CeoDashboardMetrics['products'];
  projects: Array<{ id: string; status: string }>;
  tasks: Array<{ status: string; due_date: string | null }>;
  leads: Array<{ stage: string; estimated_value_minor: number; currency_code: string }>;
  finTx: Array<{
    id: string;
    transaction_type: string;
    amount_minor: number;
    approval_status: string;
    parent_transaction_id?: string | null;
    category_id?: string;
  }>;
  finCategories: Array<{ id: string; flow_type: string }>;
  invoices: Array<{ total_minor: number; paid_minor: number; status: string; due_date: string }>;
  approvals: CeoDashboardMetrics['pendingApprovals'];
  meetings: CeoDashboardMetrics['upcomingMeetings'];
}): CeoDashboardMetrics {
  const todayIso = new Date().toISOString().slice(0, 10);

  const activeTeamMembers = input.profiles.filter((p) => p.status === 'active').length;
  const activeProducts = input.products.filter((p) => p.stage !== 'sunsetting').length;
  const activeProjects = input.projects.filter((p) => p.status === 'active' || p.status === 'planning').length;

  const completedTasks = input.tasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = input.tasks.filter((t) =>
    ['backlog', 'todo', 'in_progress', 'blocked', 'in_review'].includes(t.status)
  ).length;
  const overdueTasks = input.tasks.filter(
    (t) =>
      t.due_date !== null &&
      t.due_date < todayIso &&
      !['completed', 'cancelled'].includes(t.status)
  ).length;

  const stageCounts = new Map<string, { count: number; valueMinor: number; currencyCode: string }>();
  let totalPipelineMinor = 0;
  for (const lead of input.leads) {
    if (lead.stage !== 'lost') {
      totalPipelineMinor += lead.estimated_value_minor;
    }
    const existing = stageCounts.get(lead.stage) ?? {
      count: 0,
      valueMinor: 0,
      currencyCode: lead.currency_code || input.currencyCode,
    };
    existing.count += 1;
    existing.valueMinor += lead.estimated_value_minor;
    stageCounts.set(lead.stage, existing);
  }

  const txById = new Map(input.finTx.map((t) => [t.id, t]));
  const catFlowMap = new Map(input.finCategories.map((c) => [c.id, c.flow_type]));
  let actualRevenueMinor = 0;
  let expensesMinor = 0;
  for (const tx of input.finTx) {
    if (tx.approval_status !== 'approved') continue;
    if (tx.transaction_type === 'actual_revenue') {
      actualRevenueMinor += tx.amount_minor;
    } else if (tx.transaction_type === 'actual_expense') {
      expensesMinor += tx.amount_minor;
    } else if (tx.transaction_type === 'reversal' && tx.parent_transaction_id) {
      const parent = txById.get(tx.parent_transaction_id);
      if (parent?.transaction_type === 'actual_revenue') actualRevenueMinor += tx.amount_minor;
      if (parent?.transaction_type === 'actual_expense') expensesMinor += tx.amount_minor;
    } else if (tx.transaction_type === 'adjustment' && tx.category_id) {
      const flow = catFlowMap.get(tx.category_id);
      if (flow === 'income') actualRevenueMinor += tx.amount_minor;
      if (flow === 'expense') expensesMinor += tx.amount_minor;
    }
  }

  let invoicedRevenueMinor = 0;
  let outstandingReceivablesMinor = 0;
  let overdueInvoicesCount = 0;
  for (const inv of input.invoices) {
    if (inv.status === 'void' || inv.status === 'draft') continue;
    invoicedRevenueMinor += inv.total_minor;
    const balance = Math.max(0, inv.total_minor - inv.paid_minor);
    outstandingReceivablesMinor += balance;
    if (balance > 0 && (inv.status === 'overdue' || inv.due_date < todayIso)) {
      overdueInvoicesCount += 1;
    }
  }

  const alerts: CeoDashboardMetrics['alerts'] = [];
  if (overdueTasks > 0) {
    alerts.push({
      id: 'alert-overdue-tasks',
      severity: 'critical',
      category: 'Operations',
      title: `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'} require attention`,
      detail: 'Tasks past their due date remain unresolved across active workflows.',
      actionPath: '/tasks?scope=overdue',
    });
  }
  if (overdueInvoicesCount > 0) {
    alerts.push({
      id: 'alert-overdue-invoices',
      severity: 'warning',
      category: 'Finance',
      title: `${overdueInvoicesCount} overdue client invoice${overdueInvoicesCount === 1 ? '' : 's'}`,
      detail: 'Unpaid invoices past due date are contributing to outstanding receivables.',
      actionPath: '/finance?tab=invoices',
    });
  }
  if (input.approvals.length > 0) {
    alerts.push({
      id: 'alert-pending-approvals',
      severity: 'info',
      category: 'Governance',
      title: `${input.approvals.length} pending approval request${input.approvals.length === 1 ? '' : 's'}`,
      detail: 'Requests awaiting authorized sign-off under separation-of-duties rules.',
      actionPath: '/approvals',
    });
  }

  return {
    activeTeamMembers,
    totalTeamMembers: input.profiles.length,
    activeProducts,
    activeProjects,
    completedTasks,
    pendingTasks,
    overdueTasks,
    products: input.products,
    pipelineByStage: Array.from(stageCounts.entries()).map(([stage, val]) => ({
      stage,
      count: val.count,
      valueMinor: val.valueMinor,
      currencyCode: val.currencyCode,
    })),
    totalPipelineMinor,
    actualRevenueMinor,
    invoicedRevenueMinor,
    expensesMinor,
    outstandingReceivablesMinor,
    currencyCode: input.currencyCode,
    pendingApprovals: input.approvals,
    upcomingMeetings: input.meetings,
    alerts,
  };
}

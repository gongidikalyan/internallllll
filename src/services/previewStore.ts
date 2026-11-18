import type {
  AnnouncementItem,
  ApprovalHistoryRecord,
  ApprovalRequestRecord,
  AttendanceRecord,
  AuditLogEntry,
  BudgetRecord,
  BusinessUnit,
  ClientCommunication,
  ClientContact,
  ClientRecord,
  Company,
  ContractRecord,
  DecisionActionRecord,
  DecisionRecord,
  Department,
  DocumentRecord,
  FeatureRecord,
  FinancialAccount,
  FinancialCategory,
  FinancialTransactionRecord,
  InitialCredentialNotice,
  InvoicePaymentRecord,
  InvoiceRecord,
  LeadRecord,
  LeaveRequestRecord,
  MeetingNoteRecord,
  MeetingParticipantRecord,
  MeetingRecord,
  MilestoneRecord,
  NotificationItem,
  Permission,
  ProductRecord,
  Profile,
  ProjectMember,
  ProjectRecord,
  ProposalRecord,
  ReleaseRecord,
  ResourceMembership,
  Role,
  RolePermission,
  TaskActivityItem,
  TaskAttachment,
  TaskComment,
  TaskDependency,
  TaskRecord,
  UserCredential,
  UserRole,
} from '../types/erp';

export interface PreviewDatabaseState {
  version: number;
  activeUserId: string | null;
  company: Company;
  business_units: BusinessUnit[];
  departments: Department[];
  profiles: Profile[];
  user_credentials: UserCredential[];
  initial_credentials_notice: InitialCredentialNotice[];
  roles: Role[];
  permissions: Permission[];
  role_permissions: RolePermission[];
  user_roles: UserRole[];
  resource_memberships: ResourceMembership[];
  products: ProductRecord[];
  projects: ProjectRecord[];
  project_members: ProjectMember[];
  milestones: MilestoneRecord[];
  features: FeatureRecord[];
  releases: ReleaseRecord[];
  tasks: TaskRecord[];
  task_comments: TaskComment[];
  task_attachments: TaskAttachment[];
  task_dependencies: TaskDependency[];
  task_activity: TaskActivityItem[];
  clients: ClientRecord[];
  client_contacts: ClientContact[];
  leads: LeadRecord[];
  proposals: ProposalRecord[];
  contracts: ContractRecord[];
  client_communications: ClientCommunication[];
  financial_accounts: FinancialAccount[];
  financial_categories: FinancialCategory[];
  financial_transactions: FinancialTransactionRecord[];
  budgets: BudgetRecord[];
  invoices: InvoiceRecord[];
  invoice_payments: InvoicePaymentRecord[];
  approval_requests: ApprovalRequestRecord[];
  approval_history: ApprovalHistoryRecord[];
  meetings: MeetingRecord[];
  meeting_participants: MeetingParticipantRecord[];
  meeting_notes: MeetingNoteRecord[];
  decisions: DecisionRecord[];
  decision_actions: DecisionActionRecord[];
  attendance_records: AttendanceRecord[];
  leave_requests: LeaveRequestRecord[];
  documents: DocumentRecord[];
  document_contents: Record<string, { dataUrl: string; fileName: string }>;
  notifications: NotificationItem[];
  announcements: AnnouncementItem[];
  audit_logs: AuditLogEntry[];
}

const STORAGE_KEY = 'company_os_db_v3';
const LEGACY_STORAGE_KEYS = ['company_os_preview_db_v1', 'company_os_db_v2'];
const NOW = new Date().toISOString();
const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSIONS: Permission[] = [
  { id: 'perm-overview-view', code: 'overview.view', module: 'overview', name: 'View Executive Overview', description: 'Access company-wide CEO dashboard metrics and operational summary.', is_sensitive: false },
  { id: 'perm-workspace-view', code: 'workspace.view', module: 'workspace', name: 'View Personal Workspace', description: 'Access personal workspace, tasks, meetings, and leave summary.', is_sensitive: false },
  { id: 'perm-team-view', code: 'team.view', module: 'team', name: 'View Team Directory', description: 'Browse company team directory, departments, and reporting hierarchy.', is_sensitive: false },
  { id: 'perm-team-manage', code: 'team.manage', module: 'team', name: 'Manage Team & Departments', description: 'Create and edit team member profiles, departments, and assignments.', is_sensitive: true },
  { id: 'perm-roles-view', code: 'roles.view', module: 'settings', name: 'View Roles & Permissions', description: 'Inspect organizational role definitions and permission matrix.', is_sensitive: false },
  { id: 'perm-roles-manage', code: 'roles.manage', module: 'settings', name: 'Manage Roles & Permissions', description: 'Create custom roles and configure role permission bindings.', is_sensitive: true },
  { id: 'perm-roles-assign', code: 'roles.assign', module: 'team', name: 'Assign User Roles', description: 'Assign or revoke non-escalating roles for team members.', is_sensitive: true },
  { id: 'perm-bu-manage', code: 'business_units.manage', module: 'settings', name: 'Manage Business Units', description: 'Create and update company business units.', is_sensitive: true },
  { id: 'perm-settings-manage', code: 'settings.manage', module: 'settings', name: 'Manage Company Profile & Settings', description: 'Update company legal profile, fiscal settings, and attendance policy.', is_sensitive: true },
  { id: 'perm-tasks-view', code: 'tasks.view', module: 'tasks', name: 'View Team Tasks', description: 'View task boards, tables, and schedules across accessible units.', is_sensitive: false },
  { id: 'perm-tasks-manage', code: 'tasks.manage', module: 'tasks', name: 'Manage Tasks', description: 'Create, assign, and update tasks.', is_sensitive: false },
  { id: 'perm-projects-view', code: 'projects.view', module: 'projects', name: 'View Projects', description: 'Access project timelines, milestones, and team allocations.', is_sensitive: false },
  { id: 'perm-projects-manage', code: 'projects.manage', module: 'projects', name: 'Manage Projects', description: 'Create and manage projects, budgets, and milestones.', is_sensitive: true },
  { id: 'perm-products-view', code: 'products.view', module: 'products', name: 'View Product Workspaces', description: 'Access WrindhaOS, Speed N Tension, Business OS, and product workspaces.', is_sensitive: false },
  { id: 'perm-products-manage', code: 'products.manage', module: 'products', name: 'Manage Products & Roadmaps', description: 'Edit product roadmaps, features, releases, and product workspaces.', is_sensitive: true },
  { id: 'perm-cs-view', code: 'client_services.view', module: 'client_services', name: 'View Client Services', description: 'View leads, client directory, proposals, and contracts.', is_sensitive: false },
  { id: 'perm-cs-manage', code: 'client_services.manage', module: 'client_services', name: 'Manage Client Pipeline', description: 'Manage leads, client requirements, communications, and draft proposals.', is_sensitive: false },
  { id: 'perm-prop-tech', code: 'proposals.tech_review', module: 'client_services', name: 'Technical Proposal Review', description: 'Approve technical feasibility and engineering estimates on client proposals.', is_sensitive: true },
  { id: 'perm-prop-comm', code: 'proposals.commercial_approve', module: 'client_services', name: 'Commercial Commitment Approval', description: 'Approve commercial pricing, proposals, and client contracts.', is_sensitive: true },
  { id: 'perm-fin-view', code: 'finance.view', module: 'finance', name: 'View Finance', description: 'View income, expenses, budgets, invoices, and receivables.', is_sensitive: true },
  { id: 'perm-fin-manage', code: 'finance.manage', module: 'finance', name: 'Manage Finance & Invoices', description: 'Record ledger transactions, adjustments, invoices, and payments.', is_sensitive: true },
  { id: 'perm-meet-view', code: 'meetings.view', module: 'meetings', name: 'View Meetings & Decisions', description: 'View schedules, meeting notes, and company decision register.', is_sensitive: false },
  { id: 'perm-meet-manage', code: 'meetings.manage', module: 'meetings', name: 'Manage Meetings & Decisions', description: 'Schedule meetings and publish official decisions.', is_sensitive: false },
  { id: 'perm-att-view', code: 'attendance.view', module: 'attendance', name: 'View Attendance & Leave', description: 'View personal attendance logs and holiday calendar.', is_sensitive: false },
  { id: 'perm-att-manage', code: 'attendance.manage', module: 'attendance', name: 'Manage Attendance & Leave Approvals', description: 'Approve leave requests and configure attendance reports.', is_sensitive: true },
  { id: 'perm-docs-view', code: 'documents.view', module: 'documents', name: 'View Company Documents', description: 'Browse and download authorized company documents.', is_sensitive: false },
  { id: 'perm-docs-manage', code: 'documents.manage', module: 'documents', name: 'Manage Company Documents', description: 'Upload, version, and control access to documents.', is_sensitive: true },
  { id: 'perm-rep-view', code: 'reports.view', module: 'reports', name: 'View Executive & Operational Reports', description: 'Access cross-unit KPI, financial, and delivery reports.', is_sensitive: true },
  { id: 'perm-app-view', code: 'approvals.view', module: 'approvals', name: 'View Approval Queue', description: 'View approval requests relevant to user or company governance.', is_sensitive: false },
  { id: 'perm-app-resolve', code: 'approvals.resolve', module: 'approvals', name: 'Resolve Approvals', description: 'Approve or reject pending workflow requests (subject to separation of duties).', is_sensitive: true },
  { id: 'perm-audit-view', code: 'audit.view', module: 'settings', name: 'View Audit Logs', description: 'Inspect immutable security and operational audit trail.', is_sensitive: true },
];

const ROLES: Role[] = [
  { id: 'role-ceo', company_id: COMPANY_ID, slug: 'ceo', name: 'CEO', description: 'Chief Executive Officer — company-wide executive oversight and strategic governance.', role_tier: 10, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-administrator', company_id: COMPANY_ID, slug: 'administrator', name: 'Administrator', description: 'System & ERP Administrator — company profile, business units, RBAC configuration, and audit oversight.', role_tier: 10, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-cto', company_id: COMPANY_ID, slug: 'cto', name: 'CTO', description: 'Chief Technology Officer — engineering architecture, technical review of client estimates, and security.', role_tier: 20, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-cpo', company_id: COMPANY_ID, slug: 'cpo', name: 'CPO', description: 'Chief Product Officer — product vision, roadmaps, features, and releases across internal products.', role_tier: 20, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-cbo', company_id: COMPANY_ID, slug: 'cbo', name: 'CBO', description: 'Chief Business Officer — commercial strategy, client services pipeline, and commercial commitments.', role_tier: 20, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-finance-manager', company_id: COMPANY_ID, slug: 'finance_manager', name: 'Finance Manager', description: 'Finance Manager — ledger integrity, budgets, invoicing, receivables, and financial approvals.', role_tier: 30, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-product-manager', company_id: COMPANY_ID, slug: 'product_manager', name: 'Product Manager', description: 'Product Manager — product backlog, milestones, releases, and product metrics.', role_tier: 40, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-project-manager', company_id: COMPANY_ID, slug: 'project_manager', name: 'Project Manager', description: 'Project Manager — project delivery, schedules, team allocations, and client milestones.', role_tier: 40, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
  { id: 'role-team-member', company_id: COMPANY_ID, slug: 'team_member', name: 'Team Member', description: 'Standard contributor — personal workspace, assigned tasks, projects, meetings, and attendance.', role_tier: 60, is_system_role: true, is_assignable: true, created_at: NOW, updated_at: NOW },
];

const ROLE_PERMISSION_CODES: Record<string, string[]> = {
  'role-ceo': [
    'overview.view', 'workspace.view', 'team.view', 'team.manage', 'roles.view', 'roles.assign',
    'business_units.manage', 'settings.manage', 'tasks.view', 'tasks.manage', 'projects.view', 'projects.manage',
    'products.view', 'products.manage', 'client_services.view', 'proposals.commercial_approve',
    'finance.view', 'meetings.view', 'meetings.manage', 'attendance.view', 'attendance.manage',
    'documents.view', 'documents.manage', 'reports.view', 'approvals.view', 'approvals.resolve', 'audit.view',
  ],
  'role-administrator': [
    'overview.view', 'workspace.view', 'team.view', 'team.manage', 'roles.view', 'roles.manage', 'roles.assign',
    'business_units.manage', 'settings.manage', 'documents.view', 'documents.manage',
    'attendance.view', 'attendance.manage', 'approvals.view', 'audit.view',
  ],
  'role-cto': [
    'overview.view', 'workspace.view', 'team.view', 'tasks.view', 'tasks.manage',
    'projects.view', 'projects.manage', 'products.view', 'products.manage',
    'client_services.view', 'proposals.tech_review', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'reports.view', 'approvals.view', 'approvals.resolve',
  ],
  'role-cpo': [
    'overview.view', 'workspace.view', 'team.view', 'tasks.view', 'tasks.manage',
    'projects.view', 'products.view', 'products.manage', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'reports.view', 'approvals.view',
  ],
  'role-cbo': [
    'overview.view', 'workspace.view', 'team.view', 'client_services.view', 'client_services.manage',
    'proposals.commercial_approve', 'finance.view', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'reports.view', 'approvals.view', 'approvals.resolve',
  ],
  'role-finance-manager': [
    'workspace.view', 'team.view', 'finance.view', 'finance.manage', 'client_services.view',
    'meetings.view', 'attendance.view', 'documents.view', 'documents.manage',
    'reports.view', 'approvals.view', 'approvals.resolve',
  ],
  'role-product-manager': [
    'workspace.view', 'team.view', 'tasks.view', 'tasks.manage', 'projects.view',
    'products.view', 'products.manage', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage',
  ],
  'role-project-manager': [
    'workspace.view', 'team.view', 'tasks.view', 'tasks.manage', 'projects.view', 'projects.manage',
    'client_services.view', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'approvals.view',
  ],
  'role-team-member': [
    'workspace.view', 'team.view', 'tasks.view', 'projects.view', 'products.view',
    'meetings.view', 'attendance.view', 'documents.view',
  ],
};

function buildInitialRolePermissions(): RolePermission[] {
  const bindings: RolePermission[] = [];
  for (const [roleId, codes] of Object.entries(ROLE_PERMISSION_CODES)) {
    for (const code of codes) {
      const perm = PERMISSIONS.find((p) => p.code === code);
      if (perm) {
        bindings.push({
          id: `rp-${roleId}-${perm.id}`,
          company_id: COMPANY_ID,
          role_id: roleId,
          permission_id: perm.id,
        });
      }
    }
  }
  return bindings;
}

export function createInitialPreviewState(): PreviewDatabaseState {
  return {
    version: 6,
    activeUserId: null,
    company: {
      id: COMPANY_ID,
      name: 'Company ERP',
      legal_name: 'Company ERP',
      slug: 'company-erp',
      registration_number: null,
      tax_id: null,
      default_currency: 'INR',
      fiscal_year_start_month: 1,
      timezone: 'UTC',
      headquarters_address: null,
      website_url: null,
      primary_contact_email: 'ceo@companyerp.com',
      attendance_checkin_required: false,
      created_at: NOW,
      updated_at: NOW,
    },
    business_units: [
      {
        id: 'bu-wrindhaos',
        company_id: COMPANY_ID,
        code: 'WRINDHA-OS',
        name: 'WrindhaOS',
        unit_type: 'saas_product',
        description: 'Productivity SaaS product platform.',
        status: 'active',
        lead_profile_id: 'user-cpo',
        budget_currency: 'INR',
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'bu-speed-n-tension',
        company_id: COMPANY_ID,
        code: 'SPEED-N-TENSION',
        name: 'Speed N Tension',
        unit_type: 'mobile_game',
        description: 'Mobile gaming product studio.',
        status: 'active',
        lead_profile_id: 'user-cpo',
        budget_currency: 'INR',
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'bu-business-os',
        company_id: COMPANY_ID,
        code: 'BUSINESS-OS',
        name: 'Business OS',
        unit_type: 'business_software',
        description: 'Small-business management software product.',
        status: 'active',
        lead_profile_id: 'user-cto',
        budget_currency: 'INR',
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'bu-client-services',
        company_id: COMPANY_ID,
        code: 'CLIENT-SERVICES',
        name: 'Client Services',
        unit_type: 'client_services',
        description: 'Website, application, and software development services.',
        status: 'active',
        lead_profile_id: 'user-cbo',
        budget_currency: 'INR',
        created_at: NOW,
        updated_at: NOW,
      },
    ],
    departments: [],
    profiles: [
      {
        id: 'user-ceo',
        company_id: COMPANY_ID,
        department_id: null,
        primary_business_unit_id: null,
        manager_id: null,
        employee_code: 'EMP-001',
        full_name: 'Chief Executive Officer',
        email: 'ceo@companyerp.com',
        job_title: 'Chief Executive Officer',
        employment_type: 'executive',
        status: 'active',
        availability: 'available',
        phone: null,
        location: 'Headquarters',
        timezone: 'UTC',
        avatar_url: null,
        joined_at: NOW.slice(0, 10),
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'user-cto',
        company_id: COMPANY_ID,
        department_id: null,
        primary_business_unit_id: 'bu-business-os',
        manager_id: 'user-ceo',
        employee_code: 'EMP-002',
        full_name: 'Chief Technology Officer',
        email: 'cto@companyerp.com',
        job_title: 'Chief Technology Officer',
        employment_type: 'executive',
        status: 'active',
        availability: 'available',
        phone: null,
        location: 'Headquarters',
        timezone: 'UTC',
        avatar_url: null,
        joined_at: NOW.slice(0, 10),
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'user-cbo',
        company_id: COMPANY_ID,
        department_id: null,
        primary_business_unit_id: 'bu-client-services',
        manager_id: 'user-ceo',
        employee_code: 'EMP-003',
        full_name: 'Chief Business Officer',
        email: 'cbo@companyerp.com',
        job_title: 'Chief Business Officer',
        employment_type: 'executive',
        status: 'active',
        availability: 'available',
        phone: null,
        location: 'Headquarters',
        timezone: 'UTC',
        avatar_url: null,
        joined_at: NOW.slice(0, 10),
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'user-cpo',
        company_id: COMPANY_ID,
        department_id: null,
        primary_business_unit_id: 'bu-wrindhaos',
        manager_id: 'user-ceo',
        employee_code: 'EMP-004',
        full_name: 'Chief Product Officer',
        email: 'cpo@companyerp.com',
        job_title: 'Chief Product Officer',
        employment_type: 'executive',
        status: 'active',
        availability: 'available',
        phone: null,
        location: 'Headquarters',
        timezone: 'UTC',
        avatar_url: null,
        joined_at: NOW.slice(0, 10),
        created_at: NOW,
        updated_at: NOW,
      },
    ],
    user_credentials: [],
    initial_credentials_notice: [],
    roles: ROLES,
    permissions: PERMISSIONS,
    role_permissions: buildInitialRolePermissions(),
    user_roles: [
      { id: 'ur-ceo', company_id: COMPANY_ID, user_id: 'user-ceo', role_id: 'role-ceo', business_unit_id: null, assigned_by: 'user-ceo', assigned_at: NOW },
      { id: 'ur-cto', company_id: COMPANY_ID, user_id: 'user-cto', role_id: 'role-cto', business_unit_id: null, assigned_by: 'user-ceo', assigned_at: NOW },
      { id: 'ur-cbo', company_id: COMPANY_ID, user_id: 'user-cbo', role_id: 'role-cbo', business_unit_id: null, assigned_by: 'user-ceo', assigned_at: NOW },
      { id: 'ur-cpo', company_id: COMPANY_ID, user_id: 'user-cpo', role_id: 'role-cpo', business_unit_id: null, assigned_by: 'user-ceo', assigned_at: NOW },
    ],
    resource_memberships: [],
    products: [
      {
        id: 'prod-wrindhaos',
        company_id: COMPANY_ID,
        business_unit_id: 'bu-wrindhaos',
        code: 'PROD-WRINDHA',
        name: 'WrindhaOS',
        category: 'saas',
        description: 'Productivity SaaS workspace for teams and knowledge workflows.',
        stage: 'development',
        health_status: 'on_track',
        progress_pct: 0,
        product_owner_id: 'user-cpo',
        tech_lead_id: 'user-cto',
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'prod-speed-n-tension',
        company_id: COMPANY_ID,
        business_unit_id: 'bu-speed-n-tension',
        code: 'PROD-SNT',
        name: 'Speed N Tension',
        category: 'mobile_game',
        description: 'Mobile gaming title and live-ops studio.',
        stage: 'development',
        health_status: 'on_track',
        progress_pct: 0,
        product_owner_id: 'user-cpo',
        tech_lead_id: 'user-cto',
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: 'prod-business-os',
        company_id: COMPANY_ID,
        business_unit_id: 'bu-business-os',
        code: 'PROD-BOS',
        name: 'Business OS',
        category: 'business_software',
        description: 'Small-business management software suite.',
        stage: 'development',
        health_status: 'on_track',
        progress_pct: 0,
        product_owner_id: 'user-cpo',
        tech_lead_id: 'user-cto',
        created_at: NOW,
        updated_at: NOW,
      },
    ],
    projects: [],
    project_members: [],
    milestones: [],
    features: [],
    releases: [],
    tasks: [],
    task_comments: [],
    task_attachments: [],
    task_dependencies: [],
    task_activity: [],
    clients: [],
    client_contacts: [],
    leads: [],
    proposals: [],
    contracts: [],
    client_communications: [],
    financial_accounts: [
      { id: 'fin-acct-bank', company_id: COMPANY_ID, code: '1000-BANK', name: 'Primary Operating Bank', account_type: 'bank', currency_code: 'INR', is_active: true, created_at: NOW },
      { id: 'fin-acct-reserve', company_id: COMPANY_ID, code: '1010-RESV', name: 'Treasury Reserve Account', account_type: 'reserve', currency_code: 'INR', is_active: true, created_at: NOW },
      { id: 'fin-acct-cash', company_id: COMPANY_ID, code: '1020-CASH', name: 'Operations Petty Cash', account_type: 'cash', currency_code: 'INR', is_active: true, created_at: NOW },
      { id: 'fin-acct-ar', company_id: COMPANY_ID, code: '1200-AR', name: 'Accounts Receivable Clearing', account_type: 'receivable', currency_code: 'INR', is_active: true, created_at: NOW },
    ],
    financial_categories: [
      { id: 'fin-cat-saas', company_id: COMPANY_ID, code: 'REV-SAAS', name: 'SaaS Subscription Revenue', flow_type: 'income', created_at: NOW },
      { id: 'fin-cat-client', company_id: COMPANY_ID, code: 'REV-CLIENT', name: 'Client Services & Retainers', flow_type: 'income', created_at: NOW },
      { id: 'fin-cat-game', company_id: COMPANY_ID, code: 'REV-GAME', name: 'Mobile Gaming & In-App Revenue', flow_type: 'income', created_at: NOW },
      { id: 'fin-cat-infra', company_id: COMPANY_ID, code: 'EXP-INFRA', name: 'Cloud & Infrastructure', flow_type: 'expense', created_at: NOW },
      { id: 'fin-cat-payroll', company_id: COMPANY_ID, code: 'EXP-PAYROLL', name: 'Engineering & Staff Payroll', flow_type: 'expense', created_at: NOW },
      { id: 'fin-cat-tools', company_id: COMPANY_ID, code: 'EXP-TOOLS', name: 'Software Licenses & Tooling', flow_type: 'expense', created_at: NOW },
      { id: 'fin-cat-mkt', company_id: COMPANY_ID, code: 'EXP-MKT', name: 'Marketing & Growth', flow_type: 'expense', created_at: NOW },
      { id: 'fin-cat-ops', company_id: COMPANY_ID, code: 'EXP-OPS', name: 'General & Administrative', flow_type: 'expense', created_at: NOW },
    ],
    financial_transactions: [],
    budgets: [],
    invoices: [],
    invoice_payments: [],
    approval_requests: [],
    approval_history: [],
    meetings: [],
    meeting_participants: [],
    meeting_notes: [],
    decisions: [],
    decision_actions: [],
    attendance_records: [],
    leave_requests: [],
    documents: [],
    document_contents: {},
    notifications: [],
    announcements: [],
    audit_logs: [],
  };
}

export function loadPreviewState(): PreviewDatabaseState {
  try {
    for (const oldKey of LEGACY_STORAGE_KEYS) {
      if (window.localStorage.getItem(oldKey)) {
        window.localStorage.removeItem(oldKey);
      }
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialPreviewState();
      savePreviewState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<PreviewDatabaseState>;
    if (!parsed || (parsed.version !== 3 && parsed.version !== 4 && parsed.version !== 5 && parsed.version !== 6) || !parsed.company) {
      const initial = createInitialPreviewState();
      savePreviewState(initial);
      return initial;
    }
    const base = createInitialPreviewState();
    const needsInrMigration = parsed.version === 3;
    const needsExecCredRefresh = (parsed.version ?? 0) < 6;
    const toInr = (code: string | undefined) => (!code || code === 'USD' ? 'INR' : code);
    const defaultExecIds = new Set(['user-ceo', 'user-cto', 'user-cbo', 'user-cpo']);
    const execEmailMap: Record<string, string> = {
      'user-ceo': 'ceo@companyerp.com',
      'user-cto': 'cto@companyerp.com',
      'user-cbo': 'cbo@companyerp.com',
      'user-cpo': 'cpo@companyerp.com',
    };
    const existingCreds = parsed.user_credentials ?? [];
    const migratedCreds = needsExecCredRefresh
      ? existingCreds.filter((c) => !defaultExecIds.has(c.user_id))
      : existingCreds;
    const migratedCompany = needsExecCredRefresh
      ? {
          ...parsed.company,
          name: parsed.company.name === 'Company OS' ? 'Company ERP' : parsed.company.name,
          legal_name: parsed.company.legal_name === 'Company OS' ? 'Company ERP' : parsed.company.legal_name,
          slug: parsed.company.slug === 'company-os' ? 'company-erp' : parsed.company.slug,
          primary_contact_email:
            parsed.company.primary_contact_email === 'ceo@companyos.com'
              ? 'ceo@companyerp.com'
              : parsed.company.primary_contact_email,
          default_currency: needsInrMigration ? toInr(parsed.company.default_currency) : parsed.company.default_currency,
        }
      : parsed.company;
    const migratedProfiles =
      parsed.profiles && parsed.profiles.length > 0
        ? (needsExecCredRefresh
            ? parsed.profiles.map((prof) => {
                const updatedEmail = execEmailMap[prof.id];
                if (updatedEmail && prof.email.endsWith('@companyos.com')) {
                  return { ...prof, email: updatedEmail };
                }
                return prof;
              })
            : parsed.profiles)
        : base.profiles;
    const hydrated: PreviewDatabaseState = {
      ...base,
      ...parsed,
      version: 6,
      company: migratedCompany,
      business_units: needsInrMigration && parsed.business_units
        ? parsed.business_units.map((bu) => ({ ...bu, budget_currency: toInr(bu.budget_currency) }))
        : (parsed.business_units ?? base.business_units),
      profiles: migratedProfiles,
      user_credentials: migratedCreds,
      initial_credentials_notice: [],
      user_roles: parsed.user_roles && parsed.user_roles.length > 0 ? parsed.user_roles : base.user_roles,
      departments: parsed.departments ?? [],
      products: parsed.products && parsed.products.length > 0 ? parsed.products : base.products,
      projects: needsInrMigration && parsed.projects
        ? parsed.projects.map((p) => ({ ...p, budget_currency: toInr(p.budget_currency) }))
        : (parsed.projects ?? []),
      project_members: parsed.project_members ?? [],
      milestones: parsed.milestones ?? [],
      features: parsed.features ?? [],
      releases: parsed.releases ?? [],
      resource_memberships: parsed.resource_memberships ?? [],
      task_comments: parsed.task_comments ?? [],
      task_attachments: parsed.task_attachments ?? [],
      task_dependencies: parsed.task_dependencies ?? [],
      task_activity: parsed.task_activity ?? [],
      clients: parsed.clients ?? [],
      client_contacts: parsed.client_contacts ?? [],
      leads: needsInrMigration && parsed.leads
        ? parsed.leads.map((l) => ({ ...l, currency_code: toInr(l.currency_code) }))
        : (parsed.leads ?? []),
      proposals: needsInrMigration && parsed.proposals
        ? parsed.proposals.map((pr) => ({ ...pr, currency_code: toInr(pr.currency_code) }))
        : (parsed.proposals ?? []),
      contracts: needsInrMigration && parsed.contracts
        ? parsed.contracts.map((c) => ({ ...c, currency_code: toInr(c.currency_code) }))
        : (parsed.contracts ?? []),
      client_communications: parsed.client_communications ?? [],
      financial_accounts:
        parsed.financial_accounts && parsed.financial_accounts.length > 0
          ? (needsInrMigration
              ? parsed.financial_accounts.map((a) => ({ ...a, currency_code: toInr(a.currency_code) }))
              : parsed.financial_accounts)
          : base.financial_accounts,
      financial_categories: parsed.financial_categories && parsed.financial_categories.length > 0 ? parsed.financial_categories : base.financial_categories,
      financial_transactions: needsInrMigration && parsed.financial_transactions
        ? parsed.financial_transactions.map((tx) => ({ ...tx, currency_code: toInr(tx.currency_code) }))
        : (parsed.financial_transactions ?? []),
      budgets: needsInrMigration && parsed.budgets
        ? parsed.budgets.map((b) => ({ ...b, currency_code: toInr(b.currency_code) }))
        : (parsed.budgets ?? []),
      invoices: needsInrMigration && parsed.invoices
        ? parsed.invoices.map((inv) => ({ ...inv, currency_code: toInr(inv.currency_code) }))
        : (parsed.invoices ?? []),
      invoice_payments: needsInrMigration && parsed.invoice_payments
        ? parsed.invoice_payments.map((pay) => ({ ...pay, currency_code: toInr(pay.currency_code) }))
        : (parsed.invoice_payments ?? []),
      approval_requests: parsed.approval_requests ?? [],
      approval_history: parsed.approval_history ?? [],
      meetings: parsed.meetings ?? [],
      meeting_participants: parsed.meeting_participants ?? [],
      meeting_notes: parsed.meeting_notes ?? [],
      decisions: parsed.decisions ?? [],
      decision_actions: parsed.decision_actions ?? [],
      attendance_records: parsed.attendance_records ?? [],
      leave_requests: parsed.leave_requests ?? [],
      documents: parsed.documents ?? [],
      document_contents: parsed.document_contents ?? {},
      announcements: parsed.announcements ?? [],
      notifications: parsed.notifications ?? [],
    };
    if (needsInrMigration || needsExecCredRefresh) {
      savePreviewState(hydrated);
    }
    return hydrated;
  } catch {
    return createInitialPreviewState();
  }
}

export function savePreviewState(state: PreviewDatabaseState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetPreviewState(): PreviewDatabaseState {
  const fresh = createInitialPreviewState();
  savePreviewState(fresh);
  return fresh;
}

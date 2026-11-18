export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'executive';
export type MemberStatus = 'active' | 'on_leave' | 'onboarding' | 'suspended' | 'offboarded';
export type AvailabilityStatus = 'available' | 'focused' | 'in_meeting' | 'away' | 'offline';
export type BusinessUnitType = 'saas_product' | 'mobile_game' | 'business_software' | 'client_services' | 'internal_ops' | 'other';
export type BusinessUnitStatus = 'active' | 'incubating' | 'paused' | 'archived';

export type TaskType = 'task' | 'bug' | 'improvement' | 'research';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'completed'
  | 'cancelled';

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  slug: string;
  registration_number: string | null;
  tax_id: string | null;
  default_currency: string;
  fiscal_year_start_month: number;
  timezone: string;
  headquarters_address: string | null;
  website_url: string | null;
  primary_contact_email: string | null;
  attendance_checkin_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessUnit {
  id: string;
  company_id: string;
  code: string;
  name: string;
  unit_type: BusinessUnitType;
  description: string | null;
  status: BusinessUnitStatus;
  lead_profile_id: string | null;
  budget_currency: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  code: string;
  name: string;
  description: string | null;
  head_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  department_id: string | null;
  primary_business_unit_id: string | null;
  manager_id: string | null;
  employee_code: string;
  full_name: string;
  email: string;
  job_title: string;
  employment_type: EmploymentType;
  status: MemberStatus;
  availability: AvailabilityStatus;
  phone: string | null;
  location: string | null;
  timezone: string;
  avatar_url: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  company_id: string;
  slug: string;
  name: string;
  description: string | null;
  role_tier: number;
  is_system_role: boolean;
  is_assignable: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  name: string;
  description: string;
  is_sensitive: boolean;
}

export interface RolePermission {
  id: string;
  company_id: string;
  role_id: string;
  permission_id: string;
}

export interface UserRole {
  id: string;
  company_id: string;
  user_id: string;
  role_id: string;
  business_unit_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
}

export interface UserCredential {
  id: string;
  user_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  must_change_password: boolean;
  password_updated_at: string;
  failed_attempts: number;
  last_login_at: string | null;
}

export interface CredentialStatusSummary {
  user_id: string;
  has_credentials: boolean;
  must_change_password: boolean;
  password_updated_at: string | null;
  last_login_at: string | null;
}

export interface InitialCredentialNotice {
  user_id: string;
  role_label: string;
  full_name: string;
  email: string;
  temp_password: string;
}

export interface ResourceMembership {
  id: string;
  company_id: string;
  user_id: string;
  resource_type: 'business_unit' | 'product' | 'project' | 'client' | 'document_folder';
  resource_id: string;
  access_level: 'viewer' | 'contributor' | 'manager' | 'owner';
  granted_by: string | null;
  created_at: string;
}

export interface TeamMemberRecord extends Profile {
  roles: Role[];
  department_name: string | null;
  business_unit_name: string | null;
  manager_name: string | null;
}

export type ProductStage = 'discovery' | 'development' | 'beta' | 'live' | 'maintenance' | 'sunsetting';
export type ProductHealth = 'on_track' | 'at_risk' | 'delayed';
export type ProjectType = 'internal' | 'product_engineering' | 'client_delivery' | 'operations';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface ProductRecord {
  id: string;
  company_id: string;
  business_unit_id: string;
  code: string;
  name: string;
  category: 'saas' | 'mobile_game' | 'business_software' | 'platform' | 'other';
  description: string | null;
  stage: ProductStage;
  health_status: ProductHealth;
  progress_pct: number;
  product_owner_id: string | null;
  tech_lead_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductSummary = ProductRecord;

export interface ProjectRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  product_id: string | null;
  client_id: string | null;
  code: string;
  name: string;
  description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  owner_id: string | null;
  project_manager_id: string | null;
  start_date: string | null;
  due_date: string | null;
  budget_minor: number;
  budget_currency: string;
  progress_pct: number;
  created_at: string;
  updated_at: string;
}

export type ProjectSummary = ProjectRecord;

export interface ProjectMember {
  id: string;
  company_id: string;
  project_id: string;
  profile_id: string;
  role_in_project: string;
  allocation_pct: number;
  joined_at: string;
}

export interface MilestoneRecord {
  id: string;
  company_id: string;
  project_id: string | null;
  product_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'missed';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureRecord {
  id: string;
  company_id: string;
  product_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: 'proposed' | 'scoped' | 'in_development' | 'testing' | 'released' | 'deferred';
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReleaseRecord {
  id: string;
  company_id: string;
  product_id: string;
  version_tag: string;
  title: string;
  release_notes: string | null;
  environment: 'alpha' | 'beta' | 'staging' | 'production';
  status: 'planned' | 'in_qa' | 'ready' | 'released' | 'rolled_back';
  target_date: string | null;
  released_at: string | null;
  release_manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  company_id: string;
  project_id: string | null;
  product_id: string | null;
  department_id: string | null;
  feature_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  assigned_to: string | null;
  created_by: string;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  completion_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  company_id: string;
  task_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface TaskAttachment {
  id: string;
  company_id: string;
  task_id: string;
  uploaded_by: string;
  uploader_name?: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface TaskDependency {
  id: string;
  company_id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'blocks' | 'relates_to';
  created_at: string;
}

export interface TaskActivityItem {
  id: string;
  company_id: string;
  task_id: string;
  actor_id: string | null;
  actor_name?: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export type LeadStage =
  | 'new_lead'
  | 'contacted'
  | 'qualified'
  | 'requirement_gathering'
  | 'proposal_sent'
  | 'negotiation'
  | 'won'
  | 'lost';

export type ClientStatus = 'prospect' | 'active' | 'inactive' | 'churned';

export type ProposalStatus =
  | 'draft'
  | 'pending_tech_review'
  | 'pending_commercial_approval'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired';

export type ContractStatus = 'draft' | 'pending_approval' | 'active' | 'completed' | 'terminated';

export type CommunicationChannel = 'email' | 'call' | 'meeting' | 'chat' | 'other';

export interface ClientRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  name: string;
  industry: string | null;
  website: string | null;
  billing_address: string | null;
  account_owner_id: string | null;
  status: ClientStatus;
  created_at: string;
  updated_at: string;
}

export interface ClientContact {
  id: string;
  company_id: string;
  client_id: string;
  full_name: string;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface LeadRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  client_id: string | null;
  organization_name: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  source: string | null;
  stage: LeadStage;
  estimated_value_minor: number;
  currency_code: string;
  owner_id: string | null;
  next_follow_up_at: string | null;
  requirements_summary: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadSummary = Pick<
  LeadRecord,
  'id' | 'company_id' | 'organization_name' | 'stage' | 'estimated_value_minor' | 'currency_code'
>;

export interface ProposalRecord {
  id: string;
  company_id: string;
  lead_id: string | null;
  client_id: string | null;
  proposal_number: string;
  title: string;
  scope_summary: string;
  estimated_hours: number | null;
  proposed_amount_minor: number;
  currency_code: string;
  technical_reviewed_by: string | null;
  technical_reviewed_at: string | null;
  commercial_approved_by: string | null;
  commercial_approved_at: string | null;
  status: ProposalStatus;
  valid_until: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractRecord {
  id: string;
  company_id: string;
  client_id: string;
  proposal_id: string | null;
  contract_number: string;
  title: string;
  contract_value_minor: number;
  currency_code: string;
  start_date: string;
  end_date: string | null;
  status: ContractStatus;
  approved_by: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientCommunication {
  id: string;
  company_id: string;
  client_id: string | null;
  lead_id: string | null;
  channel: CommunicationChannel;
  subject: string;
  summary: string;
  communicated_at: string;
  logged_by: string;
  created_at: string;
}

export type FinancialAccountType = 'bank' | 'cash' | 'receivable' | 'payable' | 'reserve';
export type FinancialFlowType = 'income' | 'expense';
export type FinancialTransactionType =
  | 'actual_revenue'
  | 'actual_expense'
  | 'planned_expense'
  | 'forecast_revenue'
  | 'adjustment'
  | 'reversal';
export type FinancialApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface FinancialAccount {
  id: string;
  company_id: string;
  code: string;
  name: string;
  account_type: FinancialAccountType;
  currency_code: string;
  is_active: boolean;
  created_at: string;
}

export interface FinancialCategory {
  id: string;
  company_id: string;
  code: string;
  name: string;
  flow_type: FinancialFlowType;
  created_at: string;
}

export interface FinancialTransactionRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  project_id: string | null;
  account_id: string;
  category_id: string;
  transaction_type: FinancialTransactionType;
  amount_minor: number;
  currency_code: string;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  parent_transaction_id: string | null;
  approval_status: FinancialApprovalStatus;
  recorded_by: string;
  approved_by: string | null;
  created_at: string;
}

export type FinancialTransactionSummary = Pick<
  FinancialTransactionRecord,
  'id' | 'company_id' | 'business_unit_id' | 'transaction_type' | 'amount_minor' | 'currency_code' | 'transaction_date' | 'approval_status'
>;

export type BudgetStatus = 'draft' | 'pending_approval' | 'approved' | 'locked';

export interface BudgetRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  department_id: string | null;
  project_id: string | null;
  fiscal_year: number;
  name: string;
  allocated_minor: number;
  currency_code: string;
  status: BudgetStatus;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';

export interface InvoiceRecord {
  id: string;
  company_id: string;
  client_id: string;
  project_id: string | null;
  business_unit_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  paid_minor: number;
  currency_code: string;
  status: InvoiceStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type InvoiceSummary = Pick<
  InvoiceRecord,
  'id' | 'company_id' | 'invoice_number' | 'total_minor' | 'paid_minor' | 'currency_code' | 'status' | 'due_date'
>;

export interface InvoicePaymentRecord {
  id: string;
  company_id: string;
  invoice_id: string;
  account_id: string;
  amount_minor: number;
  currency_code: string;
  payment_date: string;
  payment_method: string;
  reference_code: string | null;
  recorded_by: string;
  created_at: string;
}

export type ApprovalRequestType =
  | 'expense'
  | 'leave'
  | 'proposal'
  | 'budget'
  | 'sensitive_access'
  | 'company_decision';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalHistoryAction =
  | 'submitted'
  | 'commented'
  | 'reassigned'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface ApprovalRequestRecord {
  id: string;
  company_id: string;
  request_type: ApprovalRequestType;
  entity_type: string;
  entity_id: string;
  title: string;
  summary: string | null;
  requester_id: string;
  assigned_approver_id: string | null;
  status: ApprovalStatus;
  submitted_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export type ApprovalSummary = Pick<
  ApprovalRequestRecord,
  'id' | 'company_id' | 'request_type' | 'title' | 'requester_id' | 'assigned_approver_id' | 'status' | 'submitted_at'
>;

export interface ApprovalHistoryRecord {
  id: string;
  company_id: string;
  approval_request_id: string;
  actor_id: string;
  action: ApprovalHistoryAction;
  comment: string | null;
  created_at: string;
}

export type MeetingType = 'executive' | 'operational' | 'product' | 'client' | 'all_hands';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type RsvpStatus = 'invited' | 'accepted' | 'declined' | 'tentative';
export type DecisionStatus = 'proposed' | 'approved' | 'superseded' | 'revoked';
export type DecisionActionStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface MeetingRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  project_id: string | null;
  title: string;
  agenda: string | null;
  meeting_type: MeetingType;
  scheduled_start: string;
  scheduled_end: string;
  location_or_link: string | null;
  organizer_id: string;
  status: MeetingStatus;
  created_at: string;
  updated_at: string;
}

export type MeetingSummary = Pick<
  MeetingRecord,
  'id' | 'company_id' | 'title' | 'meeting_type' | 'scheduled_start' | 'scheduled_end' | 'location_or_link' | 'status'
>;

export interface MeetingParticipantRecord {
  id: string;
  company_id: string;
  meeting_id: string;
  profile_id: string;
  rsvp_status: RsvpStatus;
  attended: boolean | null;
}

export interface MeetingNoteRecord {
  id: string;
  company_id: string;
  meeting_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DecisionRecord {
  id: string;
  company_id: string;
  meeting_id: string | null;
  business_unit_id: string | null;
  title: string;
  context: string;
  outcome: string;
  status: DecisionStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionActionRecord {
  id: string;
  company_id: string;
  decision_id: string;
  title: string;
  owner_id: string;
  due_date: string | null;
  status: DecisionActionStatus;
  created_at: string;
  updated_at: string;
}

export type AttendanceStatus = 'present' | 'remote' | 'half_day' | 'absent' | 'holiday' | 'on_leave';
export type LeaveType = 'annual' | 'sick' | 'casual' | 'parental' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AttendanceRecord {
  id: string;
  company_id: string;
  profile_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus;
  notes: string | null;
  created_at: string;
}

export interface LeaveRequestRecord {
  id: string;
  company_id: string;
  profile_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type DocumentCategory = 'policy' | 'architecture' | 'product_spec' | 'contract' | 'finance' | 'hr' | 'general';
export type DocumentAccessScope = 'company' | 'business_unit' | 'project' | 'restricted';

export interface DocumentRecord {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  product_id: string | null;
  project_id: string | null;
  title: string;
  category: DocumentCategory;
  version_label: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  owner_id: string;
  access_scope: DocumentAccessScope;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  company_id: string;
  recipient_id: string;
  category: 'task' | 'approval' | 'meeting' | 'finance' | 'security' | 'client' | 'system';
  title: string;
  message: string;
  link_path: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface AnnouncementItem {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  author_id: string;
  author_name?: string;
  title: string;
  body: string;
  severity: 'info' | 'advisory' | 'urgent';
  published_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  company_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export interface CeoDashboardMetrics {
  activeTeamMembers: number;
  totalTeamMembers: number;
  activeProducts: number;
  activeProjects: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  products: ProductSummary[];
  pipelineByStage: Array<{ stage: string; count: number; valueMinor: number; currencyCode: string }>;
  totalPipelineMinor: number;
  actualRevenueMinor: number;
  invoicedRevenueMinor: number;
  expensesMinor: number;
  outstandingReceivablesMinor: number;
  currencyCode: string;
  pendingApprovals: ApprovalSummary[];
  upcomingMeetings: MeetingSummary[];
  alerts: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    detail: string;
    actionPath: string;
  }>;
}

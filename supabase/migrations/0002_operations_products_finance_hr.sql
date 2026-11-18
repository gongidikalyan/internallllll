-- ============================================================================
-- Migration 0002: Products, Projects, Tasks, Client Services, Finance,
-- Meetings, Decisions, Attendance/Leave, Documents & Approvals
-- Company ERP — PostgreSQL / Supabase Migration
-- ============================================================================

-- 13. products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('saas', 'mobile_game', 'business_software', 'platform', 'other')),
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'development' CHECK (stage IN ('discovery', 'development', 'beta', 'live', 'maintenance', 'sunsetting')),
  health_status TEXT NOT NULL DEFAULT 'on_track' CHECK (health_status IN ('on_track', 'at_risk', 'delayed')),
  progress_pct SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  product_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tech_lead_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_products_company_bu ON public.products(company_id, business_unit_id);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  client_id UUID, -- FK added after clients table creation
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL DEFAULT 'internal' CHECK (project_type IN ('internal', 'product_engineering', 'client_delivery', 'operations')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  budget_minor BIGINT NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
  budget_currency CHAR(3) NOT NULL DEFAULT 'INR',
  progress_pct SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_projects_company_status ON public.projects(company_id, status);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 15. project_members
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_project TEXT NOT NULL DEFAULT 'contributor',
  allocation_pct SMALLINT NOT NULL DEFAULT 100 CHECK (allocation_pct BETWEEN 0 AND 100),
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (project_id, profile_id)
);

CREATE INDEX idx_project_members_company_project ON public.project_members(company_id, project_id);

-- 16. milestones
CREATE TABLE public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'missed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (project_id IS NOT NULL OR product_id IS NOT NULL)
);

CREATE INDEX idx_milestones_company ON public.milestones(company_id);

CREATE TRIGGER trg_milestones_updated_at
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 17. features
CREATE TABLE public.features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'scoped', 'in_development', 'testing', 'released', 'deferred')),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_features_company_product ON public.features(company_id, product_id);

CREATE TRIGGER trg_features_updated_at
  BEFORE UPDATE ON public.features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 18. releases
CREATE TABLE public.releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version_tag TEXT NOT NULL,
  title TEXT NOT NULL,
  release_notes TEXT,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('alpha', 'beta', 'staging', 'production')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_qa', 'ready', 'released', 'rolled_back')),
  target_date DATE,
  released_at TIMESTAMPTZ,
  release_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, version_tag)
);

CREATE INDEX idx_releases_company_product ON public.releases(company_id, product_id);

CREATE TRIGGER trg_releases_updated_at
  BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 19. tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  feature_id UUID REFERENCES public.features(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'task' CHECK (task_type IN ('task', 'bug', 'improvement', 'research')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled')),
  start_date DATE,
  due_date DATE,
  estimated_hours NUMERIC(7,2) CHECK (estimated_hours >= 0),
  actual_hours NUMERIC(7,2) CHECK (actual_hours >= 0),
  completion_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_company_status ON public.tasks(company_id, status);
CREATE INDEX idx_tasks_assignee ON public.tasks(company_id, assigned_to);
CREATE INDEX idx_tasks_due_date ON public.tasks(company_id, due_date);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 20. task_dependencies
CREATE TABLE public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'relates_to')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

-- 21. task_comments
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 22. task_attachments
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. task_activity
CREATE TABLE public.task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  billing_address TEXT,
  account_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('prospect', 'active', 'inactive', 'churned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_company ON public.clients(company_id);

ALTER TABLE public.projects
  ADD CONSTRAINT fk_projects_client
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 25. client_contacts
CREATE TABLE public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role_title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  organization_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'new_lead' CHECK (stage IN (
    'new_lead', 'contacted', 'qualified', 'requirement_gathering',
    'proposal_sent', 'negotiation', 'won', 'lost'
  )),
  estimated_value_minor BIGINT NOT NULL DEFAULT 0 CHECK (estimated_value_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_follow_up_at TIMESTAMPTZ,
  requirements_summary TEXT,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_company_stage ON public.leads(company_id, stage);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 27. proposals
CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  proposal_number TEXT NOT NULL,
  title TEXT NOT NULL,
  scope_summary TEXT NOT NULL,
  estimated_hours NUMERIC(8,2) CHECK (estimated_hours >= 0),
  proposed_amount_minor BIGINT NOT NULL CHECK (proposed_amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  technical_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  technical_reviewed_at TIMESTAMPTZ,
  commercial_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  commercial_approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_tech_review', 'pending_commercial_approval', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, proposal_number)
);

CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 28. contracts
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_number TEXT NOT NULL,
  title TEXT NOT NULL,
  contract_value_minor BIGINT NOT NULL CHECK (contract_value_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'completed', 'terminated')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, contract_number)
);

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 29. client_communications
CREATE TABLE public.client_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'call', 'meeting', 'chat', 'other')),
  subject TEXT NOT NULL,
  summary TEXT NOT NULL,
  communicated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30. financial_accounts
CREATE TABLE public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'cash', 'receivable', 'payable', 'reserve')),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

-- 31. financial_categories
CREATE TABLE public.financial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('income', 'expense')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

-- 32. financial_transactions (immutable ledger; reversals reference parent_transaction_id)
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES public.financial_categories(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('actual_revenue', 'actual_expense', 'planned_expense', 'forecast_revenue', 'adjustment', 'reversal')),
  amount_minor BIGINT NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference_number TEXT,
  parent_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fin_tx_company_date ON public.financial_transactions(company_id, transaction_date DESC);

-- 33. budgets
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  fiscal_year SMALLINT NOT NULL,
  name TEXT NOT NULL,
  allocated_minor BIGINT NOT NULL CHECK (allocated_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'locked')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 34. invoices (invoiced revenue vs received cash kept strictly separated)
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  paid_minor BIGINT NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX idx_invoices_company_status ON public.invoices(company_id, status);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 35. invoice_payments
CREATE TABLE public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL,
  reference_code TEXT,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 36. meetings
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  agenda TEXT,
  meeting_type TEXT NOT NULL DEFAULT 'operational' CHECK (meeting_type IN ('executive', 'operational', 'product', 'client', 'all_hands')),
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  location_or_link TEXT,
  organizer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX idx_meetings_company_start ON public.meetings(company_id, scheduled_start);

CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 37. meeting_participants
CREATE TABLE public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rsvp_status TEXT NOT NULL DEFAULT 'invited' CHECK (rsvp_status IN ('invited', 'accepted', 'declined', 'tentative')),
  attended BOOLEAN,
  UNIQUE (meeting_id, profile_id)
);

-- 38. meeting_notes
CREATE TABLE public.meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_meeting_notes_updated_at
  BEFORE UPDATE ON public.meeting_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 39. decisions
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  outcome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'superseded', 'revoked')),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_decisions_updated_at
  BEFORE UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 40. decision_actions
CREATE TABLE public.decision_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_decision_actions_updated_at
  BEFORE UPDATE ON public.decision_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 41. attendance_records
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'remote', 'half_day', 'absent', 'holiday', 'on_leave')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, work_date)
);

-- 42. leave_requests
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'casual', 'parental', 'unpaid')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

-- 43. documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('policy', 'architecture', 'product_spec', 'contract', 'finance', 'hr', 'general')),
  version_label TEXT NOT NULL DEFAULT '1.0',
  storage_bucket TEXT NOT NULL DEFAULT 'company-documents',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  access_scope TEXT NOT NULL DEFAULT 'company' CHECK (access_scope IN ('company', 'business_unit', 'project', 'restricted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 44. approval_requests
CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('expense', 'leave', 'proposal', 'budget', 'sensitive_access', 'company_decision')),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Separation of duties: requester cannot resolve their own approval request
  CHECK (resolved_by IS NULL OR resolved_by <> requester_id)
);

CREATE INDEX idx_approval_requests_company_status ON public.approval_requests(company_id, status);

-- 45. approval_history
CREATE TABLE public.approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'commented', 'reassigned', 'approved', 'rejected', 'cancelled')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

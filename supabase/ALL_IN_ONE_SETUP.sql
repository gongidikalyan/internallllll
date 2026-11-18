-- ============================================================================
-- Company ERP — Combined Supabase Setup Script (Migrations 0001 to 0005)
-- Run this entire file once in Supabase Dashboard -> SQL Editor.
-- Next: Create the 4 executive users in Authentication -> Users,
--       then run: SELECT public.link_initial_executives();
-- ============================================================================

-- ============================================================================
-- Migration 0001: Core Identity, Organization, RBAC & Audit Foundations
-- Company ERP — PostgreSQL / Supabase Migration
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper trigger function to maintain updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. companies
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  registration_number TEXT,
  tax_id TEXT,
  default_currency CHAR(3) NOT NULL DEFAULT 'INR',
  fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  headquarters_address TEXT,
  website_url TEXT,
  primary_contact_email TEXT,
  attendance_checkin_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. business_units
CREATE TABLE public.business_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('saas_product', 'mobile_game', 'business_software', 'client_services', 'internal_ops', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'incubating', 'paused', 'archived')),
  lead_profile_id UUID, -- FK added after profiles table creation
  budget_currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code),
  UNIQUE (company_id, name)
);

CREATE INDEX idx_business_units_company_id ON public.business_units(company_id);

CREATE TRIGGER trg_business_units_updated_at
  BEFORE UPDATE ON public.business_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  head_profile_id UUID, -- FK added after profiles table creation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_departments_company_id ON public.departments(company_id);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. profiles (linked 1:1 to auth.users when provisioned via Supabase Auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  primary_business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  job_title TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'executive')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'onboarding', 'suspended', 'offboarded')),
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'focused', 'in_meeting', 'away', 'offline')),
  phone TEXT,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  avatar_url TEXT,
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_code),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX idx_profiles_department_id ON public.profiles(department_id);
CREATE INDEX idx_profiles_manager_id ON public.profiles(manager_id);

ALTER TABLE public.business_units
  ADD CONSTRAINT fk_business_units_lead
  FOREIGN KEY (lead_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.departments
  ADD CONSTRAINT fk_departments_head
  FOREIGN KEY (head_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. roles
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  role_tier SMALLINT NOT NULL DEFAULT 50 CHECK (role_tier BETWEEN 1 AND 100),
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  is_assignable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, slug),
  UNIQUE (company_id, name)
);

CREATE INDEX idx_roles_company_id ON public.roles(company_id);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. permissions (canonical system-wide permission catalog)
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. role_permissions
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_company_role ON public.role_permissions(company_id, role_id);

-- 8. user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_id, business_unit_id)
);

CREATE INDEX idx_user_roles_company_user ON public.user_roles(company_id, user_id);

-- 9. resource_memberships (fine-grained resource access for products, projects, clients, business units)
CREATE TABLE public.resource_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('business_unit', 'product', 'project', 'client', 'document_folder')),
  resource_id UUID NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('viewer', 'contributor', 'manager', 'owner')),
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, resource_type, resource_id)
);

CREATE INDEX idx_resource_memberships_lookup ON public.resource_memberships(company_id, resource_type, resource_id);
CREATE INDEX idx_resource_memberships_user ON public.resource_memberships(company_id, user_id);

-- 10. announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'advisory', 'urgent')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_company ON public.announcements(company_id, published_at DESC);

-- 11. notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('task', 'approval', 'meeting', 'finance', 'security', 'client', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(company_id, recipient_id, is_read, created_at DESC);

-- 12. audit_logs (immutable append-only trail)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(company_id, entity_type, entity_id);

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

-- ============================================================================
-- Migration 0003: Security Helper Functions, Anti-Privilege-Escalation,
-- Row Level Security (RLS) on All Tables & Private Storage Policies
-- ============================================================================

-- 1. Resolve authenticated user's company_id
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND status <> 'offboarded'
  LIMIT 1;
$$;

-- 2. Check if authenticated user has a specific permission code
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.profiles prof ON prof.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND prof.status IN ('active', 'on_leave', 'onboarding')
      AND p.code = p_permission_code
  );
$$;

-- 3. Lowest numeric role_tier (1 = highest authority, 100 = lowest)
CREATE OR REPLACE FUNCTION public.min_user_role_tier()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MIN(r.role_tier), 100)
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid();
$$;

-- 4. Anti-privilege-escalation check for role assignment
CREATE OR REPLACE FUNCTION public.can_assign_role(p_target_role_id UUID, p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_permission('roles.assign')
    AND p_target_user_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.roles r
      WHERE r.id = p_target_role_id
        AND r.company_id = public.current_company_id()
        AND r.is_assignable = TRUE
        AND r.role_tier >= public.min_user_role_tier()
    );
$$;

-- 5. Enforce anti-privilege-escalation at trigger level as defense-in-depth
CREATE OR REPLACE FUNCTION public.guard_user_roles_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service-level migrations/bootstrap when auth.uid() IS NULL
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id <> public.current_company_id() THEN
      RAISE EXCEPTION 'Cross-company role assignment is prohibited';
    END IF;
    IF NOT public.can_assign_role(NEW.role_id, NEW.user_id) THEN
      RAISE EXCEPTION 'Insufficient authority or self-escalation attempt blocked';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.company_id <> public.current_company_id() THEN
      RAISE EXCEPTION 'Cross-company role revocation is prohibited';
    END IF;
    IF NOT public.can_assign_role(OLD.role_id, OLD.user_id) THEN
      RAISE EXCEPTION 'Insufficient authority to revoke this role';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_user_roles
  BEFORE INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_mutation();

-- 6. Prevent financial ledger deletion (immutable history)
CREATE OR REPLACE FUNCTION public.prevent_financial_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Financial records cannot be deleted; record an approved adjustment or reversal instead';
END;
$$;

CREATE TRIGGER trg_no_delete_fin_tx
  BEFORE DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_invoice_payments
  BEFORE DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

-- ============================================================================
-- Enable RLS on ALL 45 Tables
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
  all_tables TEXT[] := ARRAY[
    'companies', 'business_units', 'departments', 'profiles', 'roles',
    'permissions', 'role_permissions', 'user_roles', 'resource_memberships',
    'announcements', 'notifications', 'audit_logs', 'products', 'projects',
    'project_members', 'milestones', 'features', 'releases', 'tasks',
    'task_dependencies', 'task_comments', 'task_attachments', 'task_activity',
    'clients', 'client_contacts', 'leads', 'proposals', 'contracts',
    'client_communications', 'financial_accounts', 'financial_categories',
    'financial_transactions', 'budgets', 'invoices', 'invoice_payments',
    'meetings', 'meeting_participants', 'meeting_notes', 'decisions',
    'decision_actions', 'attendance_records', 'leave_requests', 'documents',
    'approval_requests', 'approval_history'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END;
$$;

-- ============================================================================
-- Core Phase 1 & Foundation Policies
-- ============================================================================

-- companies: members can view own company; only settings.manage can update
CREATE POLICY "companies_select_own" ON public.companies
  FOR SELECT USING (id = public.current_company_id());

CREATE POLICY "companies_update_admin" ON public.companies
  FOR UPDATE USING (id = public.current_company_id() AND public.has_permission('settings.manage'))
  WITH CHECK (id = public.current_company_id() AND public.has_permission('settings.manage'));

-- business_units
CREATE POLICY "bu_select_company" ON public.business_units
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "bu_manage_admin" ON public.business_units
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('business_units.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('business_units.manage'));

-- departments
CREATE POLICY "departments_select_company" ON public.departments
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "departments_manage_admin" ON public.departments
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('team.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('team.manage'));

-- profiles: members view own company directory; self can update safe availability/phone fields; team.manage can manage profiles
CREATE POLICY "profiles_select_company" ON public.profiles
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND public.has_permission('team.manage'));

CREATE POLICY "profiles_update_admin_or_self" ON public.profiles
  FOR UPDATE USING (
    company_id = public.current_company_id()
    AND (id = auth.uid() OR public.has_permission('team.manage'))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (id = auth.uid() OR public.has_permission('team.manage'))
  );

-- permissions (read-only reference catalog for authenticated users)
CREATE POLICY "permissions_select_authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (TRUE);

-- roles
CREATE POLICY "roles_select_company" ON public.roles
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "roles_manage_admin" ON public.roles
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('roles.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('roles.manage'));

-- role_permissions
CREATE POLICY "role_permissions_select_company" ON public.role_permissions
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "role_permissions_manage_admin" ON public.role_permissions
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('roles.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('roles.manage'));

-- user_roles
CREATE POLICY "user_roles_select_company" ON public.user_roles
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "user_roles_insert_guarded" ON public.user_roles
  FOR INSERT WITH CHECK (
    company_id = public.current_company_id()
    AND public.can_assign_role(role_id, user_id)
  );

CREATE POLICY "user_roles_delete_guarded" ON public.user_roles
  FOR DELETE USING (
    company_id = public.current_company_id()
    AND public.can_assign_role(role_id, user_id)
  );

-- resource_memberships
CREATE POLICY "resource_memberships_select_company" ON public.resource_memberships
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "resource_memberships_manage" ON public.resource_memberships
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('team.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('team.manage'));

-- announcements & notifications
CREATE POLICY "announcements_select_company" ON public.announcements
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "announcements_manage" ON public.announcements
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('settings.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('settings.manage'));

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (company_id = public.current_company_id() AND recipient_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (company_id = public.current_company_id() AND recipient_id = auth.uid())
  WITH CHECK (company_id = public.current_company_id() AND recipient_id = auth.uid());

-- audit_logs (read-only for authorized audit viewers, append-only via authenticated insert)
CREATE POLICY "audit_logs_select_authorized" ON public.audit_logs
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('audit.view'));

CREATE POLICY "audit_logs_insert_company" ON public.audit_logs
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND actor_id = auth.uid());

-- ============================================================================
-- Operational Module Policies (Company-Isolated + Permission-Scoped)
-- ============================================================================

-- products, features, releases
CREATE POLICY "products_select" ON public.products
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('products.view') OR public.has_permission('overview.view')));
CREATE POLICY "products_write" ON public.products
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('products.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('products.manage'));

CREATE POLICY "features_select" ON public.features
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('products.view'));
CREATE POLICY "features_write" ON public.features
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('products.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('products.manage'));

CREATE POLICY "releases_select" ON public.releases
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('products.view'));
CREATE POLICY "releases_write" ON public.releases
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('products.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('products.manage'));

-- projects, project_members, milestones
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('projects.view') OR public.has_permission('overview.view')));
CREATE POLICY "projects_write" ON public.projects
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('projects.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('projects.manage'));

CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('projects.view'));
CREATE POLICY "project_members_write" ON public.project_members
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('projects.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('projects.manage'));

CREATE POLICY "milestones_select" ON public.milestones
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('projects.view') OR public.has_permission('products.view')));
CREATE POLICY "milestones_write" ON public.milestones
  FOR ALL USING (company_id = public.current_company_id() AND (public.has_permission('projects.manage') OR public.has_permission('products.manage')))
  WITH CHECK (company_id = public.current_company_id() AND (public.has_permission('projects.manage') OR public.has_permission('products.manage')));

-- tasks & related tables
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (company_id = public.current_company_id() AND (assigned_to = auth.uid() OR created_by = auth.uid() OR public.has_permission('tasks.view')));
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND public.has_permission('tasks.manage'));
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (company_id = public.current_company_id() AND (assigned_to = auth.uid() OR public.has_permission('tasks.manage')))
  WITH CHECK (company_id = public.current_company_id() AND (assigned_to = auth.uid() OR public.has_permission('tasks.manage')));

CREATE POLICY "task_dependencies_company" ON public.task_dependencies
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('tasks.view'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('tasks.manage'));

CREATE POLICY "task_comments_company" ON public.task_comments
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('tasks.view'))
  WITH CHECK (company_id = public.current_company_id() AND author_id = auth.uid());

CREATE POLICY "task_attachments_company" ON public.task_attachments
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('tasks.view'))
  WITH CHECK (company_id = public.current_company_id() AND uploaded_by = auth.uid());

CREATE POLICY "task_activity_company" ON public.task_activity
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('tasks.view'));
CREATE POLICY "task_activity_insert" ON public.task_activity
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND actor_id = auth.uid());

-- client services (leads, clients, contacts, proposals, contracts, communications)
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('client_services.view'));
CREATE POLICY "clients_write" ON public.clients
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('client_services.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('client_services.manage'));

CREATE POLICY "client_contacts_select" ON public.client_contacts
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('client_services.view'));
CREATE POLICY "client_contacts_write" ON public.client_contacts
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('client_services.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('client_services.manage'));

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('client_services.view') OR public.has_permission('overview.view')));
CREATE POLICY "leads_write" ON public.leads
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('client_services.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('client_services.manage'));

CREATE POLICY "proposals_select" ON public.proposals
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('client_services.view'));
CREATE POLICY "proposals_write" ON public.proposals
  FOR ALL USING (company_id = public.current_company_id() AND (public.has_permission('client_services.manage') OR public.has_permission('proposals.tech_review') OR public.has_permission('proposals.commercial_approve')))
  WITH CHECK (company_id = public.current_company_id() AND (public.has_permission('client_services.manage') OR public.has_permission('proposals.tech_review') OR public.has_permission('proposals.commercial_approve')));

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('client_services.view'));
CREATE POLICY "contracts_write" ON public.contracts
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('proposals.commercial_approve'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('proposals.commercial_approve'));

CREATE POLICY "client_communications_select" ON public.client_communications
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('client_services.view'));
CREATE POLICY "client_communications_insert" ON public.client_communications
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND public.has_permission('client_services.manage') AND logged_by = auth.uid());

-- finance (strictly protected by finance.view / finance.manage / overview.view)
CREATE POLICY "fin_accounts_select" ON public.financial_accounts
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('finance.view'));
CREATE POLICY "fin_accounts_write" ON public.financial_accounts
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('finance.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('finance.manage'));

CREATE POLICY "fin_categories_select" ON public.financial_categories
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('finance.view'));
CREATE POLICY "fin_categories_write" ON public.financial_categories
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('finance.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('finance.manage'));

CREATE POLICY "fin_tx_select" ON public.financial_transactions
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('finance.view') OR public.has_permission('overview.view')));
CREATE POLICY "fin_tx_insert" ON public.financial_transactions
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND public.has_permission('finance.manage') AND recorded_by = auth.uid());

CREATE POLICY "budgets_select" ON public.budgets
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('finance.view'));
CREATE POLICY "budgets_write" ON public.budgets
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('finance.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('finance.manage'));

CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('finance.view') OR public.has_permission('overview.view')));
CREATE POLICY "invoices_write" ON public.invoices
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('finance.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('finance.manage'));

CREATE POLICY "invoice_payments_select" ON public.invoice_payments
  FOR SELECT USING (company_id = public.current_company_id() AND public.has_permission('finance.view'));
CREATE POLICY "invoice_payments_insert" ON public.invoice_payments
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND public.has_permission('finance.manage') AND recorded_by = auth.uid());

-- meetings & decisions
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('meetings.view') OR public.has_permission('overview.view')));
CREATE POLICY "meetings_write" ON public.meetings
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('meetings.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('meetings.manage'));

CREATE POLICY "meeting_participants_company" ON public.meeting_participants
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('meetings.view'))
  WITH CHECK (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('meetings.manage')));

CREATE POLICY "meeting_notes_company" ON public.meeting_notes
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('meetings.view'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('meetings.view'));

CREATE POLICY "decisions_company" ON public.decisions
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('meetings.view'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('meetings.manage'));

CREATE POLICY "decision_actions_company" ON public.decision_actions
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('meetings.view'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('meetings.manage'));

-- attendance & leave
CREATE POLICY "attendance_select" ON public.attendance_records
  FOR SELECT USING (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('attendance.manage')));
CREATE POLICY "attendance_insert_own" ON public.attendance_records
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('attendance.manage')));
CREATE POLICY "attendance_update_own" ON public.attendance_records
  FOR UPDATE USING (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('attendance.manage')))
  WITH CHECK (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('attendance.manage')));

CREATE POLICY "leave_select" ON public.leave_requests
  FOR SELECT USING (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('attendance.manage')));
CREATE POLICY "leave_insert_own" ON public.leave_requests
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND profile_id = auth.uid());
CREATE POLICY "leave_update_reviewer" ON public.leave_requests
  FOR UPDATE USING (company_id = public.current_company_id() AND (profile_id = auth.uid() OR public.has_permission('attendance.manage')))
  WITH CHECK (company_id = public.current_company_id() AND (profile_id = auth.uid() OR (public.has_permission('attendance.manage') AND profile_id <> auth.uid())));

-- documents
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    company_id = public.current_company_id()
    AND public.has_permission('documents.view')
    AND (
      access_scope <> 'restricted'
      OR owner_id = auth.uid()
      OR public.has_permission('documents.manage')
      OR public.has_permission('audit.view')
      OR EXISTS (
        SELECT 1 FROM public.resource_memberships rm
        WHERE rm.company_id = documents.company_id
          AND rm.user_id = auth.uid()
          AND (
            (rm.resource_type = 'business_unit' AND rm.resource_id = documents.business_unit_id)
            OR (rm.resource_type = 'project' AND rm.resource_id = documents.project_id)
          )
      )
    )
  );
CREATE POLICY "documents_write" ON public.documents
  FOR ALL USING (company_id = public.current_company_id() AND public.has_permission('documents.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('documents.manage'));

-- approvals (enforcing separation of duties)
CREATE POLICY "approvals_select" ON public.approval_requests
  FOR SELECT USING (
    company_id = public.current_company_id()
    AND (requester_id = auth.uid() OR assigned_approver_id = auth.uid() OR public.has_permission('approvals.view') OR public.has_permission('overview.view'))
  );

CREATE POLICY "approvals_insert_requester" ON public.approval_requests
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND requester_id = auth.uid());

CREATE POLICY "approvals_update_approver" ON public.approval_requests
  FOR UPDATE USING (
    company_id = public.current_company_id()
    AND requester_id <> auth.uid()
    AND public.has_permission('approvals.resolve')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND requester_id <> auth.uid()
    AND public.has_permission('approvals.resolve')
  );

CREATE POLICY "approval_history_select" ON public.approval_history
  FOR SELECT USING (company_id = public.current_company_id() AND (public.has_permission('approvals.view') OR EXISTS (
    SELECT 1 FROM public.approval_requests ar WHERE ar.id = approval_request_id AND ar.requester_id = auth.uid()
  )));

CREATE POLICY "approval_history_insert" ON public.approval_history
  FOR INSERT WITH CHECK (company_id = public.current_company_id() AND actor_id = auth.uid());

-- ============================================================================
-- Private Supabase Storage Buckets & Policies
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('company-documents', 'company-documents', FALSE),
  ('task-attachments', 'task-attachments', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_company_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('company-documents', 'task-attachments')
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

CREATE POLICY "storage_company_docs_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('company-documents', 'task-attachments')
    AND (storage.foldername(name))[1] = public.current_company_id()::text
    AND (public.has_permission('documents.manage') OR public.has_permission('tasks.manage'))
  );

-- ============================================================================
-- Migration 0004: Canonical Permissions Catalog, Initial Company,
-- 4 Initial Business Units & 9 Initial Organizational Roles
-- ============================================================================

-- 1. Seed canonical permissions catalog
INSERT INTO public.permissions (code, module, name, description, is_sensitive) VALUES
  ('overview.view', 'overview', 'View Executive Overview', 'Access company-wide CEO dashboard metrics and operational summary.', FALSE),
  ('workspace.view', 'workspace', 'View Personal Workspace', 'Access personal workspace, tasks, meetings, and leave summary.', FALSE),
  ('team.view', 'team', 'View Team Directory', 'Browse company team directory, departments, and reporting hierarchy.', FALSE),
  ('team.manage', 'team', 'Manage Team & Departments', 'Create and edit team member profiles, departments, and assignments.', TRUE),
  ('roles.view', 'settings', 'View Roles & Permissions', 'Inspect organizational role definitions and permission matrix.', FALSE),
  ('roles.manage', 'settings', 'Manage Roles & Permissions', 'Create custom roles and configure role permission bindings.', TRUE),
  ('roles.assign', 'team', 'Assign User Roles', 'Assign or revoke non-escalating roles for team members.', TRUE),
  ('business_units.manage', 'settings', 'Manage Business Units', 'Create and update company business units.', TRUE),
  ('settings.manage', 'settings', 'Manage Company Profile & Settings', 'Update company legal profile, fiscal settings, and attendance policy.', TRUE),
  ('tasks.view', 'tasks', 'View Team Tasks', 'View task boards, tables, and schedules across accessible units.', FALSE),
  ('tasks.manage', 'tasks', 'Manage Tasks', 'Create, assign, and update tasks.', FALSE),
  ('projects.view', 'projects', 'View Projects', 'Access project timelines, milestones, and team allocations.', FALSE),
  ('projects.manage', 'projects', 'Manage Projects', 'Create and manage projects, budgets, and milestones.', TRUE),
  ('products.view', 'products', 'View Product Workspaces', 'Access WrindhaOS, Speed N Tension, Business OS, and product workspaces.', FALSE),
  ('products.manage', 'products', 'Manage Products & Roadmaps', 'Edit product roadmaps, features, releases, and product workspaces.', TRUE),
  ('client_services.view', 'client_services', 'View Client Services', 'View leads, client directory, proposals, and contracts.', FALSE),
  ('client_services.manage', 'client_services', 'Manage Client Pipeline', 'Manage leads, client requirements, communications, and draft proposals.', FALSE),
  ('proposals.tech_review', 'client_services', 'Technical Proposal Review', 'Approve technical feasibility and engineering estimates on client proposals.', TRUE),
  ('proposals.commercial_approve', 'client_services', 'Commercial Commitment Approval', 'Approve commercial pricing, proposals, and client contracts.', TRUE),
  ('finance.view', 'finance', 'View Finance', 'View income, expenses, budgets, invoices, and receivables.', TRUE),
  ('finance.manage', 'finance', 'Manage Finance & Invoices', 'Record ledger transactions, adjustments, invoices, and payments.', TRUE),
  ('meetings.view', 'meetings', 'View Meetings & Decisions', 'View schedules, meeting notes, and company decision register.', FALSE),
  ('meetings.manage', 'meetings', 'Manage Meetings & Decisions', 'Schedule meetings and publish official decisions.', FALSE),
  ('attendance.view', 'attendance', 'View Attendance & Leave', 'View personal attendance logs and holiday calendar.', FALSE),
  ('attendance.manage', 'attendance', 'Manage Attendance & Leave Approvals', 'Approve leave requests and configure attendance reports.', TRUE),
  ('documents.view', 'documents', 'View Company Documents', 'Browse and download authorized company documents.', FALSE),
  ('documents.manage', 'documents', 'Manage Company Documents', 'Upload, version, and control access to documents.', TRUE),
  ('reports.view', 'reports', 'View Executive & Operational Reports', 'Access cross-unit KPI, financial, and delivery reports.', TRUE),
  ('approvals.view', 'approvals', 'View Approval Queue', 'View approval requests relevant to user or company governance.', FALSE),
  ('approvals.resolve', 'approvals', 'Resolve Approvals', 'Approve or reject pending workflow requests (subject to separation of duties).', TRUE),
  ('audit.view', 'settings', 'View Audit Logs', 'Inspect immutable security and operational audit trail.', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Bootstrap default company, business units, departments, and roles idempotently
DO $$
DECLARE
  v_company_id UUID;
  v_role_ceo UUID;
  v_role_admin UUID;
  v_role_cto UUID;
  v_role_cpo UUID;
  v_role_cbo UUID;
  v_role_fin UUID;
  v_role_pm UUID;
  v_role_pjm UUID;
  v_role_tm UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug IN ('company-erp', 'company-os') LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    UPDATE public.companies
    SET name = 'Company ERP',
        legal_name = 'Company ERP Technologies Pvt. Ltd.',
        slug = 'company-erp',
        primary_contact_email = COALESCE(NULLIF(primary_contact_email, 'ceo@companyos.com'), 'ceo@companyerp.com')
    WHERE id = v_company_id AND (slug = 'company-os' OR name = 'Company OS');
  ELSE
    INSERT INTO public.companies (
      name, legal_name, slug, default_currency, fiscal_year_start_month, timezone, primary_contact_email, attendance_checkin_required
    ) VALUES (
      'Company ERP', 'Company ERP Technologies Pvt. Ltd.', 'company-erp', 'INR', 1, 'UTC', 'ceo@companyerp.com', FALSE
    )
    RETURNING id INTO v_company_id;
  END IF;

  -- 4 Initial Business Units
  INSERT INTO public.business_units (company_id, code, name, unit_type, description, status) VALUES
    (v_company_id, 'WRINDHA-OS', 'WrindhaOS', 'saas_product', 'Productivity SaaS product platform.', 'active'),
    (v_company_id, 'SPEED-N-TENSION', 'Speed N Tension', 'mobile_game', 'Mobile gaming product studio.', 'active'),
    (v_company_id, 'BUSINESS-OS', 'Business OS', 'business_software', 'Small-business management software product.', 'active'),
    (v_company_id, 'CLIENT-SERVICES', 'Client Services', 'client_services', 'Website, application, and custom software development services.', 'active')
  ON CONFLICT (company_id, code) DO NOTHING;

  -- 9 Initial Organizational Roles (CBO and CPO strictly separated from CTO)
  INSERT INTO public.roles (company_id, slug, name, description, role_tier, is_system_role) VALUES
    (v_company_id, 'ceo', 'CEO', 'Chief Executive Officer — company-wide executive oversight and strategic governance.', 10, TRUE),
    (v_company_id, 'administrator', 'Administrator', 'System & ERP Administrator — company profile, business units, RBAC configuration, and audit oversight.', 10, TRUE),
    (v_company_id, 'cto', 'CTO', 'Chief Technology Officer — engineering architecture, technical review of client estimates, and security.', 20, TRUE),
    (v_company_id, 'cpo', 'CPO', 'Chief Product Officer — product vision, roadmaps, features, and releases across internal products.', 20, TRUE),
    (v_company_id, 'cbo', 'CBO', 'Chief Business Officer — commercial strategy, client services pipeline, and commercial commitments.', 20, TRUE),
    (v_company_id, 'finance_manager', 'Finance Manager', 'Finance Manager — ledger integrity, budgets, invoicing, receivables, and financial approvals.', 30, TRUE),
    (v_company_id, 'product_manager', 'Product Manager', 'Product Manager — product backlog, milestones, releases, and product metrics.', 40, TRUE),
    (v_company_id, 'project_manager', 'Project Manager', 'Project Manager — project delivery, schedules, team allocations, and client milestones.', 40, TRUE),
    (v_company_id, 'team_member', 'Team Member', 'Standard contributor — personal workspace, assigned tasks, projects, meetings, and attendance.', 60, TRUE)
  ON CONFLICT (company_id, slug) DO NOTHING;

  SELECT id INTO v_role_ceo FROM public.roles WHERE company_id = v_company_id AND slug = 'ceo';
  SELECT id INTO v_role_admin FROM public.roles WHERE company_id = v_company_id AND slug = 'administrator';
  SELECT id INTO v_role_cto FROM public.roles WHERE company_id = v_company_id AND slug = 'cto';
  SELECT id INTO v_role_cpo FROM public.roles WHERE company_id = v_company_id AND slug = 'cpo';
  SELECT id INTO v_role_cbo FROM public.roles WHERE company_id = v_company_id AND slug = 'cbo';
  SELECT id INTO v_role_fin FROM public.roles WHERE company_id = v_company_id AND slug = 'finance_manager';
  SELECT id INTO v_role_pm FROM public.roles WHERE company_id = v_company_id AND slug = 'product_manager';
  SELECT id INTO v_role_pjm FROM public.roles WHERE company_id = v_company_id AND slug = 'project_manager';
  SELECT id INTO v_role_tm FROM public.roles WHERE company_id = v_company_id AND slug = 'team_member';

  -- Bind permissions: CEO (full strategic & executive visibility + approvals)
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_ceo, id FROM public.permissions
  WHERE code IN (
    'overview.view', 'workspace.view', 'team.view', 'team.manage', 'roles.view', 'roles.assign',
    'business_units.manage', 'settings.manage', 'tasks.view', 'tasks.manage', 'projects.view', 'projects.manage',
    'products.view', 'products.manage', 'client_services.view', 'proposals.commercial_approve',
    'finance.view', 'meetings.view', 'meetings.manage', 'attendance.view', 'attendance.manage',
    'documents.view', 'documents.manage', 'reports.view', 'approvals.view', 'approvals.resolve', 'audit.view'
  ) ON CONFLICT DO NOTHING;

  -- Administrator (system governance, RBAC, team onboarding, company profile)
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_admin, id FROM public.permissions
  WHERE code IN (
    'overview.view', 'workspace.view', 'team.view', 'team.manage', 'roles.view', 'roles.manage', 'roles.assign',
    'business_units.manage', 'settings.manage', 'documents.view', 'documents.manage',
    'attendance.view', 'attendance.manage', 'approvals.view', 'audit.view'
  ) ON CONFLICT DO NOTHING;

  -- CTO (engineering, projects, technical proposal review — NO commercial/finance write authority)
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_cto, id FROM public.permissions
  WHERE code IN (
    'overview.view', 'workspace.view', 'team.view', 'tasks.view', 'tasks.manage',
    'projects.view', 'projects.manage', 'products.view', 'products.manage',
    'client_services.view', 'proposals.tech_review', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'reports.view', 'approvals.view', 'approvals.resolve'
  ) ON CONFLICT DO NOTHING;

  -- CPO (product management, roadmaps, features, releases — distinct from CTO & CBO)
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_cpo, id FROM public.permissions
  WHERE code IN (
    'overview.view', 'workspace.view', 'team.view', 'tasks.view', 'tasks.manage',
    'projects.view', 'products.view', 'products.manage', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'reports.view', 'approvals.view'
  ) ON CONFLICT DO NOTHING;

  -- CBO (commercial, client services, commercial approvals — NO CTO technical review or product engineering)
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_cbo, id FROM public.permissions
  WHERE code IN (
    'overview.view', 'workspace.view', 'team.view', 'client_services.view', 'client_services.manage',
    'proposals.commercial_approve', 'finance.view', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'reports.view', 'approvals.view', 'approvals.resolve'
  ) ON CONFLICT DO NOTHING;

  -- Finance Manager
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_fin, id FROM public.permissions
  WHERE code IN (
    'workspace.view', 'team.view', 'finance.view', 'finance.manage', 'client_services.view',
    'meetings.view', 'attendance.view', 'documents.view', 'documents.manage',
    'reports.view', 'approvals.view', 'approvals.resolve'
  ) ON CONFLICT DO NOTHING;

  -- Product Manager
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_pm, id FROM public.permissions
  WHERE code IN (
    'workspace.view', 'team.view', 'tasks.view', 'tasks.manage', 'projects.view',
    'products.view', 'products.manage', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage'
  ) ON CONFLICT DO NOTHING;

  -- Project Manager
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_pjm, id FROM public.permissions
  WHERE code IN (
    'workspace.view', 'team.view', 'tasks.view', 'tasks.manage', 'projects.view', 'projects.manage',
    'client_services.view', 'meetings.view', 'meetings.manage',
    'attendance.view', 'documents.view', 'documents.manage', 'approvals.view'
  ) ON CONFLICT DO NOTHING;

  -- Team Member
  INSERT INTO public.role_permissions (company_id, role_id, permission_id)
  SELECT v_company_id, v_role_tm, id FROM public.permissions
  WHERE code IN (
    'workspace.view', 'team.view', 'tasks.view', 'projects.view', 'products.view',
    'meetings.view', 'attendance.view', 'documents.view'
  ) ON CONFLICT DO NOTHING;

  -- Initial Product Workspaces (WrindhaOS, Speed N Tension, Business OS)
  INSERT INTO public.products (company_id, business_unit_id, code, name, category, description, stage, health_status, progress_pct)
  SELECT v_company_id, id, 'PROD-WRINDHA', 'WrindhaOS', 'saas', 'Productivity SaaS workspace for teams and knowledge workflows.', 'development', 'on_track', 0
  FROM public.business_units WHERE company_id = v_company_id AND code = 'WRINDHA-OS'
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.products (company_id, business_unit_id, code, name, category, description, stage, health_status, progress_pct)
  SELECT v_company_id, id, 'PROD-SNT', 'Speed N Tension', 'mobile_game', 'Mobile gaming title and live-ops studio.', 'development', 'on_track', 0
  FROM public.business_units WHERE company_id = v_company_id AND code = 'SPEED-N-TENSION'
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.products (company_id, business_unit_id, code, name, category, description, stage, health_status, progress_pct)
  SELECT v_company_id, id, 'PROD-BOS', 'Business OS', 'business_software', 'Small-business management software suite.', 'development', 'on_track', 0
  FROM public.business_units WHERE company_id = v_company_id AND code = 'BUSINESS-OS'
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

-- ============================================================================
-- Migration 0005: Default INR Financial Accounts, Categories &
-- Executive Profile Linking Helper
-- ============================================================================

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug IN ('company-erp', 'company-os') LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Run migration 0004_seed_initial_data.sql before 0005.';
  END IF;

  -- Default INR Financial Accounts
  INSERT INTO public.financial_accounts (company_id, code, name, account_type, currency_code, is_active) VALUES
    (v_company_id, '1000-BANK', 'Primary Operating Bank', 'bank', 'INR', TRUE),
    (v_company_id, '1010-RESV', 'Treasury Reserve Account', 'reserve', 'INR', TRUE),
    (v_company_id, '1020-CASH', 'Operations Petty Cash', 'cash', 'INR', TRUE),
    (v_company_id, '1200-AR', 'Accounts Receivable Clearing', 'receivable', 'INR', TRUE)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Default Financial Categories
  INSERT INTO public.financial_categories (company_id, code, name, flow_type) VALUES
    (v_company_id, 'REV-SAAS', 'SaaS Subscription Revenue', 'income'),
    (v_company_id, 'REV-CLIENT', 'Client Services & Retainers', 'income'),
    (v_company_id, 'REV-GAME', 'Mobile Gaming & In-App Revenue', 'income'),
    (v_company_id, 'EXP-INFRA', 'Cloud & Infrastructure', 'expense'),
    (v_company_id, 'EXP-PAYROLL', 'Engineering & Staff Payroll', 'expense'),
    (v_company_id, 'EXP-TOOLS', 'Software Licenses & Tooling', 'expense'),
    (v_company_id, 'EXP-MKT', 'Marketing & Growth', 'expense'),
    (v_company_id, 'EXP-OPS', 'General & Administrative', 'expense')
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

-- Helper function: Links existing Supabase auth.users (ceo/cto/cbo/cpo@companyerp.com)
-- to profiles and user_roles idempotently.
CREATE OR REPLACE FUNCTION public.link_initial_executives()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id UUID;
  v_ceo_id UUID;
  v_cto_id UUID;
  v_cbo_id UUID;
  v_cpo_id UUID;
  v_role_ceo UUID;
  v_role_cto UUID;
  v_role_cbo UUID;
  v_role_cpo UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug IN ('company-erp', 'company-os') LIMIT 1;
  SELECT id INTO v_ceo_id FROM auth.users WHERE lower(email) = 'ceo@companyerp.com' LIMIT 1;
  SELECT id INTO v_cto_id FROM auth.users WHERE lower(email) = 'cto@companyerp.com' LIMIT 1;
  SELECT id INTO v_cbo_id FROM auth.users WHERE lower(email) = 'cbo@companyerp.com' LIMIT 1;
  SELECT id INTO v_cpo_id FROM auth.users WHERE lower(email) = 'cpo@companyerp.com' LIMIT 1;

  SELECT id INTO v_role_ceo FROM public.roles WHERE company_id = v_company_id AND slug = 'ceo';
  SELECT id INTO v_role_cto FROM public.roles WHERE company_id = v_company_id AND slug = 'cto';
  SELECT id INTO v_role_cbo FROM public.roles WHERE company_id = v_company_id AND slug = 'cbo';
  SELECT id INTO v_role_cpo FROM public.roles WHERE company_id = v_company_id AND slug = 'cpo';

  IF v_ceo_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, employee_code, full_name, email, job_title, employment_type, status, availability, location)
    VALUES (v_ceo_id, v_company_id, 'EMP-001', 'Chief Executive Officer', 'ceo@companyerp.com', 'Chief Executive Officer', 'executive', 'active', 'available', 'Headquarters')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    INSERT INTO public.user_roles (company_id, user_id, role_id)
    VALUES (v_company_id, v_ceo_id, v_role_ceo)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_cto_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, manager_id, employee_code, full_name, email, job_title, employment_type, status, availability, location)
    VALUES (v_cto_id, v_company_id, v_ceo_id, 'EMP-002', 'Chief Technology Officer', 'cto@companyerp.com', 'Chief Technology Officer', 'executive', 'active', 'available', 'Headquarters')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    INSERT INTO public.user_roles (company_id, user_id, role_id)
    VALUES (v_company_id, v_cto_id, v_role_cto)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_cbo_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, manager_id, employee_code, full_name, email, job_title, employment_type, status, availability, location)
    VALUES (v_cbo_id, v_company_id, v_ceo_id, 'EMP-003', 'Chief Business Officer', 'cbo@companyerp.com', 'Chief Business Officer', 'executive', 'active', 'available', 'Headquarters')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    INSERT INTO public.user_roles (company_id, user_id, role_id)
    VALUES (v_company_id, v_cbo_id, v_role_cbo)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_cpo_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, manager_id, employee_code, full_name, email, job_title, employment_type, status, availability, location)
    VALUES (v_cpo_id, v_company_id, v_ceo_id, 'EMP-004', 'Chief Product Officer', 'cpo@companyerp.com', 'Chief Product Officer', 'executive', 'active', 'available', 'Headquarters')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    INSERT INTO public.user_roles (company_id, user_id, role_id)
    VALUES (v_company_id, v_cpo_id, v_role_cpo)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ============================================================================
-- Migration 0006: Add DELETE RLS policies for tasks & storage objects
-- ============================================================================

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    company_id = public.current_company_id()
    AND public.has_permission('tasks.manage')
  );

DROP POLICY IF EXISTS "storage_company_docs_delete" ON storage.objects;
CREATE POLICY "storage_company_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('company-documents', 'task-attachments')
    AND (storage.foldername(name))[1] = public.current_company_id()::text
    AND (public.has_permission('documents.manage') OR public.has_permission('tasks.manage'))
  );

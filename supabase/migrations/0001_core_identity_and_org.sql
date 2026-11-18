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

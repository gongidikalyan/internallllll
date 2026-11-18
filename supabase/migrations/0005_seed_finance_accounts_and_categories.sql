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

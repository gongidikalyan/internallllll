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

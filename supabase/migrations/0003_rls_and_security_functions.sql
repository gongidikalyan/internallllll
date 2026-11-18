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

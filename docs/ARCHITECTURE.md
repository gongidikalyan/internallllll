# Company OS — Architecture & Phase 1 Engineering Specification

## 1. Application Architecture

**Company OS** is a multi-module internal Enterprise Resource Planning (ERP) platform engineered with a strict separation between presentation, client state/query caching, typed domain services, and PostgreSQL Row Level Security (RLS).

- **Client Runtime**: React 19 + TypeScript (Strict Mode) + Vite SPA.
- **Routing**: React Router v7 with permission-guarded route wrappers (`ProtectedRoute`, `PermissionGuard`).
- **Server State & Caching**: TanStack Query (`@tanstack/react-query`) managing query keys scoped by `company_id` and `user_id`, automatic invalidation on mutations, and deterministic loading/empty/error states.
- **Form Validation**: React Hook Form + Zod schema validation on every write form prior to persistence.
- **Backend & Persistence**:
  - **Production Mode**: Supabase Auth (JWT sessions), PostgreSQL with RLS across all 45 normalized tables, and Supabase Storage private buckets (`company-documents`, `task-attachments`) accessed exclusively via signed URLs.
  - **Development Preview Mode**: Automatically activated when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are unconfigured. Uses a schema-faithful, `localStorage`-persisted preview adapter that mirrors the exact PostgreSQL repository interface and executes identical RBAC and anti-privilege-escalation checks while clearly displaying a persistent preview-mode banner.

## 2. Folder Structure

```text
/
├── docs/
│   └── ARCHITECTURE.md             # System architecture, ER relationships, RBAC & UI spec
├── supabase/
│   └── migrations/
│       ├── 0001_core_identity_and_org.sql
│       ├── 0002_operations_products_finance_hr.sql
│       ├── 0003_rls_and_security_functions.sql
│       └── 0004_seed_initial_data.sql
├── src/
│   ├── components/
│   │   ├── layout/                 # AppShell, Sidebar, TopBar, Breadcrumbs, ThemeToggle, GlobalSearch
│   │   └── ui/                     # Reusable primitives (DataTable, StatBlock, ModalDrawer, EmptyState)
│   ├── contexts/
│   │   ├── AuthContext.tsx         # Auth session, active profile, resolved permissions, RBAC helpers
│   │   └── ThemeContext.tsx        # Light / Dark mode state synced with <html>.dark
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client initialization & config detection
│   │   ├── currency.ts             # Integer minor-unit currency formatting (no float arithmetic)
│   │   └── navigation.ts           # Canonical sidebar module registry with permission requirements
│   ├── modules/
│   │   ├── auth/                   # SignInPage (Supabase Auth + Preview Persona Selector)
│   │   ├── overview/               # CEO Dashboard (real computed metrics from repository)
│   │   ├── workspace/              # My Workspace (personal profile, roles, permissions, deadlines)
│   │   ├── team/                   # Team Directory, Profiles, Department & Role Assignment
│   │   ├── settings/               # Company Profile, Business Units, Roles & Permissions Matrix
│   │   └── roadmap/                # Phase 2–6 Module Readiness Blueprint views (clearly labelled)
│   ├── services/
│   │   ├── erpRepository.ts        # Unified data repository (Supabase queries + Preview adapter)
│   │   └── previewStore.ts         # Schema-aligned localStorage store for Development Preview Mode
│   └── types/
│       └── erp.ts                  # Strict TypeScript interfaces matching PostgreSQL schema
```

## 3. Database Relationship Design

All 45 normalized PostgreSQL tables use UUID primary keys, explicit foreign keys, `CHECK` constraints, `TIMESTAMPTZ` audit columns, and `company_id` tenant isolation:

- **Organization Core**: `companies` 1─* `business_units` 1─* `departments` 1─* `profiles`.
- **RBAC & Access Control**: `roles` *─* `permissions` via `role_permissions`; `profiles` *─* `roles` via `user_roles` (with optional `business_unit_id` scope); `resource_memberships` for granular product/project/client/folder access.
- **Products & Delivery**: `business_units` 1─* `products` (WrindhaOS, Speed N Tension, Business OS) *─* `features` / `releases` / `milestones`; `projects` *─* `project_members` / `tasks` / `task_dependencies` / `task_comments` / `task_attachments` / `task_activity`.
- **Client Services**: `clients` 1─* `client_contacts`, `leads` ─> `proposals` (with separate `technical_reviewed_by` and `commercial_approved_by` columns) ─> `contracts`, plus `client_communications`.
- **Finance (Integer Minor Units)**: `financial_accounts` & `financial_categories` ─> `financial_transactions` (`amount_minor BIGINT`, `currency_code CHAR(3)`, immutable ledger with `parent_transaction_id` for reversals/adjustments), `budgets`, `invoices` 1─* `invoice_payments` (strictly separating `total_minor` invoiced from `paid_minor` received cash).
- **Governance, HR & Storage**: `meetings` 1─* `meeting_participants` / `meeting_notes` ─> `decisions` 1─* `decision_actions`; `attendance_records`, `leave_requests`, `documents` (private Supabase Storage metadata), `approval_requests` 1─* `approval_history` (enforcing `resolved_by <> requester_id`), `announcements`, `notifications`, and `audit_logs`.

## 4. Authentication & Authorization Design

- **Authentication**: Supabase Auth JWT sessions (`supabase.auth.getSession` / `onAuthStateChange`). Never stores service-role keys in frontend code.
- **Database Enforcement (Final Authority)**: Every table has `ENABLE ROW LEVEL SECURITY`. Security-definer functions `public.current_company_id()`, `public.has_permission(code)`, `public.min_user_role_tier()`, and `public.can_assign_role(role_id, user_id)` verify company isolation, role permissions, and hierarchy tiers on every query and mutation.
- **Role Separation**: `CBO` holds commercial, client pipeline, and commercial approval authority (`client_services.*`, `proposals.commercial_approve`), whereas `CTO` holds engineering and technical estimate review authority (`products.*`, `projects.*`, `proposals.tech_review`), and `CPO` governs product roadmaps and releases. No role name is hardcoded in authorization checks—only permission codes.
- **Anti-Privilege-Escalation**: Database trigger `trg_guard_user_roles` blocks any user from assigning a role to themselves or assigning a role with a higher privilege tier (`role_tier < current_user_min_tier`).

## 5. UI Design System

- **Theme**: Deep Ocean Navy (`#0B3B66`) primary accent on crisp Slate off-white (`#F8FAFC` / `#FFFFFF`) light canvas, with optional Abyssal Navy (`#060D1A` / `#0C1729`) dark mode via `.dark` class.
- **Typography**: `Plus Jakarta Sans` (display & headings), `Public Sans` (body & dense enterprise tables), and `IBM Plex Mono` (`tabular-nums` for currency, counts, IDs, and timestamps).
- **Layout Discipline**: Fixed 256px collapsible sidebar (auto-hiding unauthorized modules), 1-row top bar with breadcrumbs, global search, notification drawer, theme switch, and user profile menu. Zero pill-badge clutter, zero nested card sandwiches, explicit text labels alongside semantic colors.

## 6. Implementation Milestones

- **Phase 1 (Current)**: Project foundation, strict TypeScript setup, full 45-table SQL migrations + RLS, Auth + RBAC engine, Company Profile, Business Units, Team Profiles, Roles & Permissions Matrix, CEO Dashboard, My Workspace.
- **Phase 2**: Full Team Directory workflows, Task Management (Kanban, Table, Calendar, Comments, Dependencies), Notification Center.
- **Phase 3**: Projects & Milestones, Individual Product Workspaces (WrindhaOS, Speed N Tension, Business OS), Roadmaps, Releases & Bug Tracking.
- **Phase 4**: Client Services CRM (Leads pipeline, Clients, Technical/Commercial Proposal workflow, Contracts).
- **Phase 5**: Finance Ledger, Budgets, Invoicing, Partial Payments, Receivables, Centralized Approvals.
- **Phase 6**: Meetings & Decision Register, Attendance & Leave Management, Private Document Library (Supabase Storage), Executive Reports.
- **Phase 7**: Security audit, E2E authorization tests, query indexing & performance tuning, production deployment.

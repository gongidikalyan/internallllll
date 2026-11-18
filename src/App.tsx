import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppShell } from './components/layout/AppShell';
import { EmptyState } from './components/ui/EmptyState';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SignInPage } from './modules/auth/SignInPage';
import { OverviewPage } from './modules/overview/OverviewPage';
import { WorkspacePage } from './modules/workspace/WorkspacePage';
import { TeamPage } from './modules/team/TeamPage';
import { TasksPage } from './modules/tasks/TasksPage';
import { ProjectsPage } from './modules/projects/ProjectsPage';
import { ProductsPage } from './modules/products/ProductsPage';
import { ClientServicesPage } from './modules/client-services/ClientServicesPage';
import { FinancePage } from './modules/finance/FinancePage';
import { MeetingsPage } from './modules/meetings/MeetingsPage';
import { AttendancePage } from './modules/attendance/AttendancePage';
import { DocumentsPage } from './modules/documents/DocumentsPage';
import { ReportsPage } from './modules/reports/ReportsPage';
import { ApprovalsPage } from './modules/approvals/ApprovalsPage';
import { NotificationsPage } from './modules/notifications/NotificationsPage';
import { SettingsPage } from './modules/settings/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ProtectedShell({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-xs text-slate-600 dark:bg-[#060D1A] dark:text-slate-300">
        Verifying session and company permissions...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

function PermissionGuard({
  requiredPermissions,
  children,
}: {
  requiredPermissions: string[];
  children: ReactNode;
}) {
  const { hasAnyPermission } = useAuth();

  if (!hasAnyPermission(requiredPermissions)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access Restricted"
        description="Your current organizational role does not grant permission to view this module. Access is enforced by role-based permissions."
      />
    );
  }

  return <>{children}</>;
}

function DefaultRedirect() {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={hasPermission('overview.view') ? '/overview' : '/workspace'} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <Routes>
                <Route path="/login" element={<SignInPage />} />

              <Route
                path="/overview"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['overview.view']}>
                      <OverviewPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/workspace"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['workspace.view']}>
                      <WorkspacePage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/team"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['team.view']}>
                      <TeamPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/tasks"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['tasks.view', 'workspace.view']}>
                      <TasksPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/projects"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['projects.view']}>
                      <ProjectsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/products"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['products.view']}>
                      <ProductsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/client-services"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['client_services.view']}>
                      <ClientServicesPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/finance"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['finance.view']}>
                      <FinancePage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/meetings"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['meetings.view']}>
                      <MeetingsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/attendance"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['attendance.view']}>
                      <AttendancePage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/documents"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['documents.view']}>
                      <DocumentsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/reports"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['reports.view']}>
                      <ReportsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/approvals"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['approvals.view']}>
                      <ApprovalsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/notifications"
                element={
                  <ProtectedShell>
                    <PermissionGuard requiredPermissions={['workspace.view']}>
                      <NotificationsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedShell>
                    <PermissionGuard
                      requiredPermissions={['settings.manage', 'roles.view', 'business_units.manage', 'audit.view']}
                    >
                      <SettingsPage />
                    </PermissionGuard>
                  </ProtectedShell>
                }
              />

              <Route path="/" element={<DefaultRedirect />} />
              <Route path="*" element={<DefaultRedirect />} />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { NAVIGATION_MODULES } from '../../lib/navigation';
import { erpRepository } from '../../services/erpRepository';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const {
    profile,
    companyId,
    roles,
    hasAnyPermission,
    isPreviewMode,
    mustChangePassword,
    changeOwnPassword,
    signOut,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const authorizedModules = useMemo(
    () => NAVIGATION_MODULES.filter((mod) => hasAnyPermission(mod.requiredPermissions)),
    [hasAnyPermission]
  );

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team_members_search', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['team.view']),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks_search', companyId],
    queryFn: () => erpRepository.listTasks(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['tasks.view', 'workspace.view']),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_search', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['projects.view']),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products_search', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['products.view']),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads_search', companyId],
    queryFn: () => erpRepository.listLeads(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['client_services.view']),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_search', companyId],
    queryFn: () => erpRepository.listClients(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['client_services.view']),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices_search', companyId],
    queryFn: () => erpRepository.listInvoices(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['finance.view']),
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ['approvals_search', companyId],
    queryFn: () => erpRepository.listApprovalRequests(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['approvals.view']),
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings_search', companyId],
    queryFn: () => erpRepository.listMeetings(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['meetings.view']),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['documents_search', companyId],
    queryFn: () => erpRepository.listDocuments(companyId!),
    enabled: Boolean(companyId) && hasAnyPermission(['documents.view']),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', companyId, profile?.id],
    queryFn: () => erpRepository.listNotifications(companyId!, profile!.id),
    enabled: Boolean(companyId && profile?.id),
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!companyId || !profile) return;
      await erpRepository.markNotificationRead(companyId, profile.id, notificationId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: Array<{ id: string; label: string; category: string; path: string }> = [];

    for (const mod of authorizedModules) {
      if (mod.label.toLowerCase().includes(q) || mod.description.toLowerCase().includes(q)) {
        results.push({
          id: `mod-${mod.id}`,
          label: mod.label,
          category: mod.implemented ? 'Module' : `Module · Phase ${mod.phase}`,
          path: mod.path,
        });
      }
    }

    for (const bu of businessUnits) {
      if (bu.name.toLowerCase().includes(q) || bu.code.toLowerCase().includes(q)) {
        results.push({
          id: `bu-${bu.id}`,
          label: `${bu.name} (${bu.code})`,
          category: 'Business Unit',
          path: '/settings?tab=business-units',
        });
      }
    }

    for (const member of teamMembers) {
      if (
        member.full_name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        member.job_title.toLowerCase().includes(q)
      ) {
        results.push({
          id: `member-${member.id}`,
          label: `${member.full_name} — ${member.job_title}`,
          category: 'Team Member',
          path: `/team?member=${member.id}`,
        });
      }
    }

    for (const prod of products) {
      if (prod.name.toLowerCase().includes(q) || prod.code.toLowerCase().includes(q)) {
        results.push({
          id: `prod-${prod.id}`,
          label: `${prod.name} (${prod.code})`,
          category: `Product · ${prod.stage}`,
          path: `/products?product=${prod.id}`,
        });
      }
    }

    for (const proj of projects) {
      if (proj.name.toLowerCase().includes(q) || proj.code.toLowerCase().includes(q)) {
        results.push({
          id: `proj-${proj.id}`,
          label: `${proj.code} · ${proj.name}`,
          category: `Project · ${proj.status.replace('_', ' ')}`,
          path: `/projects?project=${proj.id}`,
        });
      }
    }

    for (const task of tasks) {
      if (task.title.toLowerCase().includes(q)) {
        results.push({
          id: `task-${task.id}`,
          label: task.title,
          category: `Task · ${task.status.replace('_', ' ')}`,
          path: `/tasks?task=${task.id}`,
        });
      }
    }

    for (const lead of leads) {
      if (
        lead.organization_name.toLowerCase().includes(q) ||
        lead.contact_name.toLowerCase().includes(q)
      ) {
        results.push({
          id: `lead-${lead.id}`,
          label: `${lead.organization_name} (${lead.contact_name})`,
          category: `Lead · ${lead.stage.replace(/_/g, ' ')}`,
          path: `/client-services?lead=${lead.id}`,
        });
      }
    }

    for (const client of clients) {
      if (
        client.name.toLowerCase().includes(q) ||
        (client.industry ?? '').toLowerCase().includes(q)
      ) {
        results.push({
          id: `client-${client.id}`,
          label: client.name,
          category: `Client · ${client.status}`,
          path: `/client-services?client=${client.id}`,
        });
      }
    }

    for (const inv of invoices) {
      if (inv.invoice_number.toLowerCase().includes(q)) {
        results.push({
          id: `inv-${inv.id}`,
          label: `Invoice ${inv.invoice_number}`,
          category: `Finance · ${inv.status.replace('_', ' ')}`,
          path: `/finance?invoice=${inv.id}`,
        });
      }
    }

    for (const req of approvals) {
      if (req.title.toLowerCase().includes(q)) {
        results.push({
          id: `app-${req.id}`,
          label: req.title,
          category: `Approval · ${req.status}`,
          path: `/approvals?request=${req.id}`,
        });
      }
    }

    for (const mtg of meetings) {
      if (mtg.title.toLowerCase().includes(q)) {
        results.push({
          id: `mtg-${mtg.id}`,
          label: mtg.title,
          category: `Meeting · ${mtg.meeting_type}`,
          path: `/meetings?meeting=${mtg.id}`,
        });
      }
    }

    for (const doc of documents) {
      if (doc.title.toLowerCase().includes(q)) {
        results.push({
          id: `doc-${doc.id}`,
          label: `${doc.title} (v${doc.version_label})`,
          category: `Document · ${doc.category.replace('_', ' ')}`,
          path: `/documents?doc=${doc.id}`,
        });
      }
    }

    return results.slice(0, 8);
  }, [searchQuery, authorizedModules, businessUnits, teamMembers, products, projects, tasks, leads, clients, invoices, approvals, meetings, documents]);

  const currentModule = useMemo(
    () =>
      NAVIGATION_MODULES.find((m) => location.pathname === m.path || location.pathname.startsWith(`${m.path}/`)) ??
      authorizedModules[0],
    [location.pathname, authorizedModules]
  );

  const initials = useMemo(() => {
    const name = profile?.full_name ?? 'User';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [profile?.full_name]);

  const primaryRoleName = roles[0]?.name ?? 'Unassigned Role';

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    await signOut();
    navigate('/login');
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.trim().length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordModalOpen(false);
        setPasswordSuccess(false);
      }, 1000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-[#060D1A] dark:text-slate-100">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Deep Ocean Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#122D4F] bg-[#07192F] text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary Navigation"
      >
        <div className="flex h-14 items-center justify-between border-b border-[#122D4F] px-5">
          <Link
            to="/overview"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <svg className="h-6 w-6 shrink-0 text-sky-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2.5" y="2.5" width="19" height="19" rx="3" stroke="currentColor" strokeWidth="1.75" />
              <path d="M7.5 12H16.5M12 7.5V16.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <span className="font-display text-base font-semibold tracking-tight whitespace-nowrap">
              Company ERP
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded p-1.5 text-slate-300 hover:bg-[#102948] hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {authorizedModules.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[#0F3560] text-white'
                          : 'text-slate-300 hover:bg-[#0D2542] hover:text-white'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-sky-300" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {!item.implemented ? (
                      <span className="ml-2 font-mono text-[11px] text-slate-400">P{item.phase}</span>
                    ) : item.id === 'notifications' && unreadCount > 0 ? (
                      <span className="ml-2 font-mono text-[11px] text-sky-300">{unreadCount}</span>
                    ) : null}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[#122D4F] px-4 py-3 text-xs text-slate-300">
          <div className="truncate font-medium text-white">{profile?.full_name}</div>
          <div className="mt-0.5 truncate text-slate-400">{primaryRoleName}</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 lg:hidden dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              <Link
                to="/overview"
                className="text-slate-500 hover:text-slate-900 whitespace-nowrap dark:text-slate-400 dark:hover:text-slate-100"
              >
                Company ERP
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {currentModule?.label ?? 'Workspace'}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Search */}
            <div className="relative hidden md:block md:w-64 lg:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                placeholder="Search modules, tasks, units, team..."
                aria-label="Global search"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B66] focus:bg-white focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100 dark:focus:border-sky-500"
              />
              {searchFocused && searchQuery.trim().length > 0 ? (
                <div className="absolute right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-[#1E3252] dark:bg-[#0C1729]">
                  {searchResults.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                      No matching modules, tasks, business units, or team records.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                      {searchResults.map((res) => (
                        <li key={res.id}>
                          <button
                            type="button"
                            onMouseDown={() => {
                              setSearchQuery('');
                              navigate(res.path);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-[#13233C]"
                          >
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {res.label}
                            </span>
                            <span className="ml-2 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                              {res.category}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {/* Notification Center */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setProfileMenuOpen(false);
                }}
                className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-slate-600 hover:bg-slate-100 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                aria-label="Open notification center"
                aria-expanded={notificationsOpen}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="font-mono text-[11px] font-semibold text-[#0B3B66] dark:text-sky-400">
                    {unreadCount}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-slate-200 bg-white p-4 shadow-lg dark:border-[#1E3252] dark:bg-[#0C1729]">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-[#1E3252]">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Notifications ({unreadCount} unread)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate('/notifications');
                      }}
                      className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                    >
                      View all
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      You have no notifications yet.
                    </div>
                  ) : (
                    <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-[#1E3252]">
                      {notifications.slice(0, 5).map((n) => (
                        <li key={n.id} className="py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (!n.is_read) markReadMutation.mutate(n.id);
                              setNotificationsOpen(false);
                              if (n.link_path) navigate(n.link_path);
                            }}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className={`font-medium ${n.is_read ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                                {n.title}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {n.is_read ? 'Read' : 'Unread'}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {n.message}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((prev) => !prev);
                  setNotificationsOpen(false);
                }}
                className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-2.5 text-left hover:bg-slate-100 dark:border-[#1E3252] dark:hover:bg-[#13233C]"
                aria-expanded={profileMenuOpen}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#0B3B66] font-mono text-[11px] font-semibold text-white dark:bg-sky-600">
                  {initials}
                </span>
                <span className="hidden max-w-[140px] truncate text-xs font-medium text-slate-800 sm:inline dark:text-slate-200">
                  {profile?.full_name}
                </span>
              </button>

              {profileMenuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-[#1E3252] dark:bg-[#0C1729]">
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-[#1E3252]">
                    <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {profile?.full_name}
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {profile?.email}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-[#0B3B66] dark:text-sky-400">
                      {roles.map((r) => r.name).join(' · ') || 'No Role'}
                    </div>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigate('/workspace');
                      }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#13233C]"
                    >
                      <UserIcon className="h-3.5 w-3.5" />
                      My Workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setPasswordError(null);
                        setPasswordSuccess(false);
                        setPasswordModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#13233C]"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Change Password
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {isPreviewMode ? (
          <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-2 text-xs text-amber-900 sm:px-6 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="font-semibold">Local Persistence Mode:</strong> Supabase credentials are not configured. Accounts and records persist locally in browser storage.
              </span>
              {hasAnyPermission(['settings.manage', 'roles.view']) ? (
                <Link
                  to="/settings?tab=environment"
                  className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-white"
                >
                  Connection &amp; Environment Details
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {mustChangePassword ? (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900 sm:px-6 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="font-semibold">Password Update Recommended:</strong> You signed in with a temporary password issued by an administrator.
              </span>
              <button
                type="button"
                onClick={() => {
                  setPasswordError(null);
                  setPasswordSuccess(false);
                  setPasswordModalOpen(true);
                }}
                className="font-medium underline underline-offset-2 hover:text-sky-950 dark:hover:text-white"
              >
                Update My Password
              </button>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Self-Service Change Password Modal */}
      {passwordModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Update Account Password
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
                aria-label="Close password modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordChangeSubmit} className="mt-4 space-y-4">
              {passwordError ? (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  {passwordError}
                </div>
              ) : null}
              {passwordSuccess ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  Password updated successfully.
                </div>
              ) : null}

              {isPreviewMode ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Current Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  New Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

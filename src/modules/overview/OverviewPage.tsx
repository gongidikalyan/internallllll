import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  FolderKanban,
  Handshake,
  Package,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatMinorCurrency } from '../../lib/currency';
import { BUSINESS_UNIT_LABELS } from '../../lib/navigation';
import { erpRepository } from '../../services/erpRepository';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

export function OverviewPage() {
  const { companyId, hasPermission } = useAuth();

  const companyQuery = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => erpRepository.getCompany(companyId!),
    enabled: Boolean(companyId),
  });

  const businessUnitsQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const metricsQuery = useQuery({
    queryKey: ['ceo_metrics', companyId],
    queryFn: () => erpRepository.getCeoDashboardMetrics(companyId!),
    enabled: Boolean(companyId),
  });

  if (metricsQuery.isLoading || companyQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-[#13233C]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (metricsQuery.error || !metricsQuery.data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Unable to load executive overview"
        description={
          metricsQuery.error instanceof Error
            ? metricsQuery.error.message
            : 'Database query failed while loading company metrics.'
        }
      />
    );
  }

  const m = metricsQuery.data;
  const company = companyQuery.data;
  const businessUnits = businessUnitsQuery.data ?? [];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Executive Overview · {company?.legal_name ?? 'Company ERP'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            CEO Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {hasPermission('reports.view') ? (
            <Link
              to="/reports"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
            >
              Executive Reports
            </Link>
          ) : null}
          {hasPermission('team.view') ? (
            <Link
              to="/team"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
            >
              Manage Team
            </Link>
          ) : null}
          {hasPermission('business_units.manage') ? (
            <Link
              to="/settings?tab=business-units"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              Configure Business Units
            </Link>
          ) : null}
        </div>
      </div>

      {/* Primary Operational KPI Grid */}
      <section aria-label="Operational Summary Metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiTile
            label="Active Team Members"
            value={String(m.activeTeamMembers)}
            subtext={`${m.totalTeamMembers} total profiles`}
            icon={Users}
          />
          <KpiTile
            label="Active Products"
            value={String(m.activeProducts)}
            subtext="Tracked product workspaces"
            icon={Package}
          />
          <KpiTile
            label="Active Projects"
            value={String(m.activeProjects)}
            subtext="Planning & active delivery"
            icon={FolderKanban}
          />
          <KpiTile
            label="Completed Tasks"
            value={String(m.completedTasks)}
            subtext="Calculated from tasks"
            icon={CheckCircle2}
          />
          <KpiTile
            label="Pending Tasks"
            value={String(m.pendingTasks)}
            subtext="Backlog to In Review"
            icon={FolderKanban}
          />
          <KpiTile
            label="Overdue Tasks"
            value={String(m.overdueTasks)}
            subtext={m.overdueTasks > 0 ? 'Requires attention' : 'Nominal'}
            tone={m.overdueTasks > 0 ? 'critical' : 'nominal'}
            icon={AlertTriangle}
          />
        </div>
      </section>

      {/* Financial Snapshot Strip (Integer Minor Units, Strictly Separated Cash vs Invoiced vs Receivables) */}
      <section aria-label="Financial Summary">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Financial Position
          </h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              Currency: {m.currencyCode} · Approved ledger &amp; issued invoices
            </span>
            {hasPermission('finance.view') ? (
              <Link
                to="/finance"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
              >
                Open Finance
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Actual Revenue (Received)"
            value={formatMinorCurrency(m.actualRevenueMinor, m.currencyCode)}
            subtext="Excludes unpaid invoices"
            icon={Wallet}
          />
          <KpiTile
            label="Actual Expenses"
            value={formatMinorCurrency(m.expensesMinor, m.currencyCode)}
            subtext="Approved expenditure"
            icon={Wallet}
          />
          <KpiTile
            label="Outstanding Receivables"
            value={formatMinorCurrency(m.outstandingReceivablesMinor, m.currencyCode)}
            subtext={`Invoiced: ${formatMinorCurrency(m.invoicedRevenueMinor, m.currencyCode)}`}
            tone={m.outstandingReceivablesMinor > 0 ? 'warning' : 'neutral'}
            icon={Wallet}
          />
          <KpiTile
            label="Client Pipeline Value"
            value={formatMinorCurrency(m.totalPipelineMinor, m.currencyCode)}
            subtext={`${m.pipelineByStage.reduce((acc, s) => acc + s.count, 0)} active leads`}
            icon={Handshake}
          />
        </div>
      </section>

      {/* Business Units Overview Table */}
      <section aria-label="Business Units" className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Business Units
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Active operating units configured in the company directory.
            </p>
          </div>
          {hasPermission('business_units.manage') ? (
            <Link
              to="/settings?tab=business-units"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
            >
              Manage Units
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
        {businessUnits.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No business units created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Business Unit</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Currency</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {businessUnits.map((bu) => (
                  <tr key={bu.id} className="hover:bg-slate-50/80 dark:hover:bg-[#102038]">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {bu.code}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{bu.name}</div>
                      {bu.description ? (
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{bu.description}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {BUSINESS_UNIT_LABELS[bu.unit_type] ?? bu.unit_type}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {bu.budget_currency}
                    </td>
                    <td className="px-5 py-3">
                      <StatusText
                        tone={bu.status === 'active' ? 'nominal' : bu.status === 'paused' ? 'warning' : 'neutral'}
                        label={bu.status.charAt(0).toUpperCase() + bu.status.slice(1)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Product Progress & Client Pipeline Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Product Progress
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {m.products.length} tracked
            </span>
          </div>
          {m.products.length === 0 ? (
            <div className="py-8 text-center">
              <Building2 className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                No product records logged yet
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Product workspaces for WrindhaOS, Speed N Tension, and Business OS will populate here in Phase 3.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {m.products.map((prod) => (
                <li key={prod.id} className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-b-0 dark:border-[#1E3252]">
                  <div>
                    <Link
                      to={`/products?product=${prod.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-[#0B3B66] hover:underline dark:text-white dark:hover:text-sky-400"
                    >
                      {prod.name}
                    </Link>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {prod.stage} · {prod.health_status.replace('_', ' ')}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {prod.progress_pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Client Pipeline
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {formatMinorCurrency(m.totalPipelineMinor, m.currencyCode)}
              </span>
              {hasPermission('client_services.view') ? (
                <Link
                  to="/client-services"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  Open Pipeline
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
          {m.pipelineByStage.length === 0 ? (
            <div className="py-8 text-center">
              <Handshake className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                No client leads recorded yet
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Client Services pipeline stages calculate automatically as leads are added.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {m.pipelineByStage.map((stage) => (
                <li key={stage.stage} className="flex items-center justify-between text-xs">
                  <Link
                    to="/client-services"
                    className="capitalize text-slate-700 hover:text-[#0B3B66] hover:underline dark:text-slate-300 dark:hover:text-sky-400"
                  >
                    {stage.stage.replace(/_/g, ' ')} ({stage.count})
                  </Link>
                  <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-white">
                    {formatMinorCurrency(stage.valueMinor, stage.currencyCode)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Pending Approvals, Upcoming Meetings & Important Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Pending Approvals
            </h2>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {m.pendingApprovals.length}
              </span>
              {hasPermission('approvals.view') ? (
                <Link
                  to="/approvals"
                  className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  Open Queue
                </Link>
              ) : null}
            </div>
          </div>
          {m.pendingApprovals.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              No pending approval requests in queue.
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {m.pendingApprovals.map((app) => (
                <li key={app.id} className="border-b border-slate-100 pb-2 text-xs last:border-b-0 dark:border-[#1E3252]">
                  <Link
                    to={`/approvals?request=${app.id}`}
                    className="font-medium text-slate-900 hover:text-[#0B3B66] hover:underline dark:text-white dark:hover:text-sky-400"
                  >
                    {app.title}
                  </Link>
                  <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                    {app.request_type.replace('_', ' ')} · {app.submitted_at.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Upcoming Meetings
            </h2>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {m.upcomingMeetings.length}
              </span>
              {hasPermission('meetings.view') ? (
                <Link
                  to="/meetings"
                  className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  Open Schedule
                </Link>
              ) : null}
            </div>
          </div>
          {m.upcomingMeetings.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              No upcoming scheduled meetings.
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {m.upcomingMeetings.map((mtg) => (
                <li key={mtg.id} className="border-b border-slate-100 pb-2 text-xs last:border-b-0 dark:border-[#1E3252]">
                  <Link
                    to={`/meetings?meeting=${mtg.id}`}
                    className="font-medium text-slate-900 hover:text-[#0B3B66] hover:underline dark:text-white dark:hover:text-sky-400"
                  >
                    {mtg.title}
                  </Link>
                  <div className="mt-0.5 font-mono text-slate-500 dark:text-slate-400">
                    {new Date(mtg.scheduled_start).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Important Alerts
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {m.alerts.length}
            </span>
          </div>
          {m.alerts.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              No operational or financial alerts triggered.
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {m.alerts.map((alert) => (
                <li key={alert.id} className="border-b border-slate-100 pb-2.5 text-xs last:border-b-0 dark:border-[#1E3252]">
                  <div className="flex items-center justify-between gap-2">
                    <StatusText
                      tone={alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'neutral'}
                      label={alert.category}
                    />
                    <Link to={alert.actionPath} className="text-[#0B3B66] hover:underline dark:text-sky-400">
                      Inspect
                    </Link>
                  </div>
                  <div className="mt-1 font-medium text-slate-900 dark:text-white">{alert.title}</div>
                  <div className="mt-0.5 text-slate-500 dark:text-slate-400">{alert.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  subtext: string;
  icon: typeof Users;
  tone?: 'nominal' | 'warning' | 'critical' | 'neutral';
}

function KpiTile({ label, value, subtext, icon: Icon, tone = 'neutral' }: KpiTileProps) {
  const valueTone =
    tone === 'critical'
      ? 'text-red-700 dark:text-red-400'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-400'
        : tone === 'nominal'
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-slate-900 dark:text-white';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${valueTone}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtext}</div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Briefcase,
  Building2,
  Download,
  Handshake,
  Package,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatMinorCurrency } from '../../lib/currency';
import { downloadCsvReport, minorToDecimalString } from '../../lib/csv';
import { BUSINESS_UNIT_LABELS } from '../../lib/navigation';
import { erpRepository } from '../../services/erpRepository';
import { StatusText } from '../../components/ui/StatusText';
import type { LeadStage } from '../../types/erp';

type ReportTab = 'executive' | 'delivery' | 'commercial' | 'people';
type DatePreset = 'all' | '30d' | '90d' | 'ytd' | 'custom';

const PIPELINE_ORDER: LeadStage[] = [
  'new_lead',
  'contacted',
  'qualified',
  'requirement_gathering',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
];

function subtractDaysIso(days: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const { companyId } = useAuth();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [activeTab, setActiveTab] = useState<ReportTab>('executive');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState(`${todayIso.slice(0, 4)}-01-01`);
  const [customEnd, setCustomEnd] = useState(todayIso);

  const rangeBounds = useMemo(() => {
    if (datePreset === '30d') return { start: subtractDaysIso(30), end: todayIso };
    if (datePreset === '90d') return { start: subtractDaysIso(90), end: todayIso };
    if (datePreset === 'ytd') return { start: `${todayIso.slice(0, 4)}-01-01`, end: todayIso };
    if (datePreset === 'custom') return { start: customStart, end: customEnd };
    return { start: '', end: '' };
  }, [datePreset, customStart, customEnd, todayIso]);

  const inDateRange = (isoDate: string | null | undefined): boolean => {
    if (!isoDate) return datePreset === 'all';
    const d = isoDate.slice(0, 10);
    if (rangeBounds.start && d < rangeBounds.start) return false;
    if (rangeBounds.end && d > rangeBounds.end) return false;
    return true;
  };

  const companyQuery = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => erpRepository.getCompany(companyId!),
    enabled: Boolean(companyId),
  });
  const buQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });
  const deptQuery = useQuery({
    queryKey: ['departments', companyId],
    queryFn: () => erpRepository.listDepartments(companyId!),
    enabled: Boolean(companyId),
  });
  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });
  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId),
  });
  const featuresQuery = useQuery({
    queryKey: ['features', companyId],
    queryFn: () => erpRepository.listFeatures(companyId!),
    enabled: Boolean(companyId),
  });
  const releasesQuery = useQuery({
    queryKey: ['releases', companyId],
    queryFn: () => erpRepository.listReleases(companyId!),
    enabled: Boolean(companyId),
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });
  const tasksQuery = useQuery({
    queryKey: ['tasks', companyId],
    queryFn: () => erpRepository.listTasks(companyId!),
    enabled: Boolean(companyId),
  });
  const leadsQuery = useQuery({
    queryKey: ['leads', companyId],
    queryFn: () => erpRepository.listLeads(companyId!),
    enabled: Boolean(companyId),
  });
  const proposalsQuery = useQuery({
    queryKey: ['proposals', companyId],
    queryFn: () => erpRepository.listProposals(companyId!),
    enabled: Boolean(companyId),
  });
  const contractsQuery = useQuery({
    queryKey: ['contracts', companyId],
    queryFn: () => erpRepository.listContracts(companyId!),
    enabled: Boolean(companyId),
  });
  const txQuery = useQuery({
    queryKey: ['financial_transactions', companyId],
    queryFn: () => erpRepository.listFinancialTransactions(companyId!),
    enabled: Boolean(companyId),
  });
  const categoriesQuery = useQuery({
    queryKey: ['financial_categories', companyId],
    queryFn: () => erpRepository.listFinancialCategories(companyId!),
    enabled: Boolean(companyId),
  });
  const budgetsQuery = useQuery({
    queryKey: ['budgets', companyId],
    queryFn: () => erpRepository.listBudgets(companyId!),
    enabled: Boolean(companyId),
  });
  const invoicesQuery = useQuery({
    queryKey: ['invoices', companyId],
    queryFn: () => erpRepository.listInvoices(companyId!),
    enabled: Boolean(companyId),
  });
  const attendanceQuery = useQuery({
    queryKey: ['attendance_records', companyId, 'reports'],
    queryFn: () => erpRepository.listAttendanceRecords(companyId!),
    enabled: Boolean(companyId),
  });
  const leaveQuery = useQuery({
    queryKey: ['leave_requests', companyId, 'reports'],
    queryFn: () => erpRepository.listLeaveRequests(companyId!),
    enabled: Boolean(companyId),
  });
  const approvalsQuery = useQuery({
    queryKey: ['approval_requests', companyId],
    queryFn: () => erpRepository.listApprovalRequests(companyId!),
    enabled: Boolean(companyId),
  });
  const decisionsQuery = useQuery({
    queryKey: ['decisions', companyId],
    queryFn: () => erpRepository.listDecisions(companyId!),
    enabled: Boolean(companyId),
  });
  const decisionActionsQuery = useQuery({
    queryKey: ['decision_actions', companyId],
    queryFn: () => erpRepository.listDecisionActions(companyId!),
    enabled: Boolean(companyId),
  });

  const currencyCode = companyQuery.data?.default_currency ?? 'INR';
  const businessUnits = buQuery.data ?? [];
  const departments = deptQuery.data ?? [];
  const teamMembers = teamQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const features = featuresQuery.data ?? [];
  const releases = releasesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const leads = leadsQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];
  const allTx = txQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];
  const allInvoices = invoicesQuery.data ?? [];
  const attendanceRecords = attendanceQuery.data ?? [];
  const leaveRequests = leaveQuery.data ?? [];
  const approvals = approvalsQuery.data ?? [];
  const decisions = decisionsQuery.data ?? [];
  const decisionActions = decisionActionsQuery.data ?? [];

  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);
  const txById = useMemo(() => new Map(allTx.map((t) => [t.id, t])), [allTx]);
  const catFlowMap = useMemo(() => new Map(categories.map((c) => [c.id, c.flow_type])), [categories]);

  const filteredTx = useMemo(
    () => allTx.filter((t) => t.approval_status === 'approved' && inDateRange(t.transaction_date)),
    [allTx, datePreset, rangeBounds]
  );

  const filteredInvoices = useMemo(
    () => allInvoices.filter((i) => i.status !== 'void' && i.status !== 'draft' && inDateRange(i.issue_date)),
    [allInvoices, datePreset, rangeBounds]
  );

  const filteredTasks = useMemo(
    () => tasks.filter((t) => inDateRange(t.created_at)),
    [tasks, datePreset, rangeBounds]
  );

  const filteredAttendance = useMemo(
    () => attendanceRecords.filter((a) => inDateRange(a.work_date)),
    [attendanceRecords, datePreset, rangeBounds]
  );

  const resolveSignedImpact = (tx: (typeof allTx)[number]): { revenue: number; expense: number } => {
    if (tx.transaction_type === 'actual_revenue') return { revenue: tx.amount_minor, expense: 0 };
    if (tx.transaction_type === 'actual_expense') return { revenue: 0, expense: tx.amount_minor };
    if (tx.transaction_type === 'reversal' && tx.parent_transaction_id) {
      const parent = txById.get(tx.parent_transaction_id);
      if (parent?.transaction_type === 'actual_revenue') return { revenue: tx.amount_minor, expense: 0 };
      if (parent?.transaction_type === 'actual_expense') return { revenue: 0, expense: tx.amount_minor };
    }
    if (tx.transaction_type === 'adjustment') {
      const flow = catFlowMap.get(tx.category_id);
      if (flow === 'income') return { revenue: tx.amount_minor, expense: 0 };
      if (flow === 'expense') return { revenue: 0, expense: tx.amount_minor };
    }
    return { revenue: 0, expense: 0 };
  };

  // Period Financial Totals
  const financialTotals = useMemo(() => {
    let revenueMinor = 0;
    let expenseMinor = 0;
    for (const tx of filteredTx) {
      const impact = resolveSignedImpact(tx);
      revenueMinor += impact.revenue;
      expenseMinor += impact.expense;
    }
    let invoicedMinor = 0;
    let receivablesMinor = 0;
    for (const inv of filteredInvoices) {
      invoicedMinor += inv.total_minor;
      receivablesMinor += Math.max(0, inv.total_minor - inv.paid_minor);
    }
    return {
      revenueMinor,
      expenseMinor,
      netMinor: revenueMinor - expenseMinor,
      invoicedMinor,
      receivablesMinor,
    };
  }, [filteredTx, filteredInvoices, txById, catFlowMap]);

  // Business Unit Matrix
  const unitRows = useMemo(() => {
    return businessUnits.map((bu) => {
      const unitTx = filteredTx.filter((t) => t.business_unit_id === bu.id);
      let revenueMinor = 0;
      let expenseMinor = 0;
      for (const tx of unitTx) {
        const impact = resolveSignedImpact(tx);
        revenueMinor += impact.revenue;
        expenseMinor += impact.expense;
      }
      const budgetMinor = budgets
        .filter((b) => b.business_unit_id === bu.id && (b.status === 'approved' || b.status === 'locked'))
        .reduce((acc, b) => acc + b.allocated_minor, 0);
      const receivablesMinor = filteredInvoices
        .filter((i) => i.business_unit_id === bu.id)
        .reduce((acc, i) => acc + Math.max(0, i.total_minor - i.paid_minor), 0);

      const unitProjects = projects.filter((p) => p.business_unit_id === bu.id);
      const activeProjects = unitProjects.filter((p) => p.status === 'active' || p.status === 'planning').length;
      const unitProductIds = new Set(products.filter((pr) => pr.business_unit_id === bu.id).map((pr) => pr.id));
      const unitProjectIds = new Set(unitProjects.map((p) => p.id));
      const unitTasks = filteredTasks.filter(
        (t) => (t.project_id && unitProjectIds.has(t.project_id)) || (t.product_id && unitProductIds.has(t.product_id))
      );
      const completedTasks = unitTasks.filter((t) => t.status === 'completed').length;
      const completionRate = unitTasks.length > 0 ? Math.round((completedTasks / unitTasks.length) * 100) : 0;

      return {
        bu,
        revenueMinor,
        expenseMinor,
        netMinor: revenueMinor - expenseMinor,
        budgetMinor,
        receivablesMinor,
        activeProjects,
        totalTasks: unitTasks.length,
        completionRate,
      };
    });
  }, [businessUnits, filteredTx, budgets, filteredInvoices, projects, products, filteredTasks]);

  // Product Delivery Rows
  const productRows = useMemo(() => {
    return products.map((pr) => {
      const prFeatures = features.filter((f) => f.product_id === pr.id);
      const releasedFeatures = prFeatures.filter((f) => f.status === 'released').length;
      const prTasks = tasks.filter((t) => t.product_id === pr.id);
      const openBugs = prTasks.filter(
        (t) => t.task_type === 'bug' && t.status !== 'completed' && t.status !== 'cancelled'
      ).length;
      const prReleases = releases.filter((r) => r.product_id === pr.id);
      return {
        product: pr,
        totalFeatures: prFeatures.length,
        releasedFeatures,
        openBugs,
        releaseCount: prReleases.length,
      };
    });
  }, [products, features, tasks, releases]);

  // Project Delivery Rows
  const projectRows = useMemo(() => {
    return projects.map((proj) => {
      let approvedSpendMinor = 0;
      for (const tx of allTx) {
        if (tx.project_id !== proj.id || tx.approval_status !== 'approved') continue;
        approvedSpendMinor += resolveSignedImpact(tx).expense;
      }
      const projTasks = tasks.filter((t) => t.project_id === proj.id);
      const overdueCount = projTasks.filter(
        (t) =>
          t.due_date &&
          t.due_date < todayIso &&
          t.status !== 'completed' &&
          t.status !== 'cancelled'
      ).length;
      return {
        project: proj,
        approvedSpendMinor,
        taskCount: projTasks.length,
        overdueCount,
      };
    });
  }, [projects, allTx, tasks, todayIso]);

  // Pipeline Rows
  const pipelineRows = useMemo(() => {
    const activeLeads = leads.filter((l) => inDateRange(l.created_at));
    const totalVal = activeLeads.reduce((acc, l) => acc + l.estimated_value_minor, 0);
    return PIPELINE_ORDER.map((stage) => {
      const stageLeads = activeLeads.filter((l) => l.stage === stage);
      const valueMinor = stageLeads.reduce((acc, l) => acc + l.estimated_value_minor, 0);
      const sharePct = totalVal > 0 ? Math.round((valueMinor / totalVal) * 100) : 0;
      return { stage, count: stageLeads.length, valueMinor, sharePct };
    });
  }, [leads, datePreset, rangeBounds]);

  const handleExportUnitCsv = () => {
    downloadCsvReport(
      `company_os_business_unit_report_${todayIso}`,
      [
        'Unit Code',
        'Business Unit',
        'Category',
        'Currency',
        'Actual Revenue',
        'Actual Expenses',
        'Net Position',
        'Approved Budget',
        'Outstanding Receivables',
        'Active Projects',
        'Tasks Tracked',
        'Task Completion %',
      ],
      unitRows.map((r) => [
        r.bu.code,
        r.bu.name,
        BUSINESS_UNIT_LABELS[r.bu.unit_type] ?? r.bu.unit_type,
        r.bu.budget_currency,
        minorToDecimalString(r.revenueMinor, currencyCode),
        minorToDecimalString(r.expenseMinor, currencyCode),
        minorToDecimalString(r.netMinor, currencyCode),
        minorToDecimalString(r.budgetMinor, currencyCode),
        minorToDecimalString(r.receivablesMinor, currencyCode),
        r.activeProjects,
        r.totalTasks,
        r.completionRate,
      ])
    );
  };

  const handleExportDeliveryCsv = () => {
    downloadCsvReport(
      `company_os_delivery_report_${todayIso}`,
      [
        'Project Code',
        'Project Name',
        'Type',
        'Status',
        'Progress %',
        'Budget',
        'Approved Spend',
        'Tasks',
        'Overdue Tasks',
        'Due Date',
      ],
      projectRows.map((r) => [
        r.project.code,
        r.project.name,
        r.project.project_type,
        r.project.status,
        r.project.progress_pct,
        minorToDecimalString(r.project.budget_minor, r.project.budget_currency),
        minorToDecimalString(r.approvedSpendMinor, r.project.budget_currency),
        r.taskCount,
        r.overdueCount,
        r.project.due_date ?? '',
      ])
    );
  };

  const handleExportCommercialCsv = () => {
    downloadCsvReport(
      `company_os_pipeline_report_${todayIso}`,
      ['Pipeline Stage', 'Lead Count', 'Estimated Value', 'Currency', 'Pipeline Share %'],
      pipelineRows.map((r) => [
        r.stage.replace(/_/g, ' '),
        r.count,
        minorToDecimalString(r.valueMinor, currencyCode),
        currencyCode,
        r.sharePct,
      ])
    );
  };

  const handleExportPeopleCsv = () => {
    downloadCsvReport(
      `company_os_department_staffing_report_${todayIso}`,
      ['Department Code', 'Department Name', 'Active Staff', 'Total Roster'],
      departments.map((d) => {
        const members = teamMembers.filter((m) => m.department_id === d.id);
        const active = members.filter((m) => m.status === 'active').length;
        return [d.code, d.name, active, members.length];
      })
    );
  };

  const handleExportActiveTabCsv = () => {
    if (activeTab === 'delivery') {
      handleExportDeliveryCsv();
    } else if (activeTab === 'commercial') {
      handleExportCommercialCsv();
    } else if (activeTab === 'people') {
      handleExportPeopleCsv();
    } else {
      handleExportUnitCsv();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Analytics &amp; Reporting · Computed Directly from Ledger, Delivery &amp; HR Records
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Executive &amp; Operational Reports
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            aria-label="Reporting window"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
          >
            <option value="all">All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">Custom Range</option>
          </select>

          {datePreset === 'custom' ? (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 font-mono text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 font-mono text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleExportActiveTabCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Period Summary KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Approved Revenue</span>
            <Wallet className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMinorCurrency(financialTotals.revenueMinor, currencyCode)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Approved Expenses</span>
            <Wallet className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatMinorCurrency(financialTotals.expenseMinor, currencyCode)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Net Operating Position</span>
            <BarChart3 className="h-4 w-4 text-slate-400" />
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              financialTotals.netMinor >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatMinorCurrency(financialTotals.netMinor, currencyCode)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Outstanding Receivables</span>
            <Wallet className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {formatMinorCurrency(financialTotals.receivablesMinor, currencyCode)}
          </div>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-[#1E3252]">
        <button
          type="button"
          onClick={() => setActiveTab('executive')}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'executive'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Business Unit P&amp;L &amp; Operations
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('delivery')}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'delivery'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Products &amp; Project Delivery
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('commercial')}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'commercial'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Client Pipeline &amp; Contracts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('people')}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'people'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          People, Attendance &amp; Governance
        </button>
      </div>

      {/* TAB 1: Business Unit P&L */}
      {activeTab === 'executive' ? (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Business Unit Financial &amp; Operational Matrix
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {businessUnits.length} business units · Currency: {currencyCode}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Business Unit</th>
                  <th className="px-5 py-3 text-right font-medium">Revenue</th>
                  <th className="px-5 py-3 text-right font-medium">Expenses</th>
                  <th className="px-5 py-3 text-right font-medium">Net</th>
                  <th className="px-5 py-3 text-right font-medium">Approved Budget</th>
                  <th className="px-5 py-3 text-right font-medium">Receivables</th>
                  <th className="px-5 py-3 text-right font-medium">Active Projects</th>
                  <th className="px-5 py-3 text-right font-medium">Task Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {unitRows.map((row) => (
                  <tr key={row.bu.id} className="hover:bg-slate-50/70 dark:hover:bg-[#102038]">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{row.bu.name}</div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {row.bu.code} · {BUSINESS_UNIT_LABELS[row.bu.unit_type] ?? row.bu.unit_type}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatMinorCurrency(row.revenueMinor, currencyCode)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {formatMinorCurrency(row.expenseMinor, currencyCode)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono font-medium tabular-nums ${
                        row.netMinor >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {formatMinorCurrency(row.netMinor, currencyCode)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMinorCurrency(row.budgetMinor, currencyCode)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      {formatMinorCurrency(row.receivablesMinor, currencyCode)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.activeProjects}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.totalTasks > 0 ? `${row.completionRate}% (${row.totalTasks})` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* TAB 2: Products & Project Delivery */}
      {activeTab === 'delivery' ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <Package className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Product Portfolio Health
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">Stage</th>
                    <th className="px-5 py-3 font-medium">Health</th>
                    <th className="px-5 py-3 text-right font-medium">Progress</th>
                    <th className="px-5 py-3 text-right font-medium">Features (Released / Total)</th>
                    <th className="px-5 py-3 text-right font-medium">Open Bugs</th>
                    <th className="px-5 py-3 text-right font-medium">Releases</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {productRows.map((row) => (
                    <tr key={row.product.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{row.product.name}</div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {row.product.code}
                        </div>
                      </td>
                      <td className="px-5 py-3 capitalize text-slate-700 dark:text-slate-300">
                        {row.product.stage}
                      </td>
                      <td className="px-5 py-3">
                        <StatusText
                          tone={
                            row.product.health_status === 'on_track'
                              ? 'nominal'
                              : row.product.health_status === 'at_risk'
                                ? 'warning'
                                : 'critical'
                          }
                          label={row.product.health_status.replace('_', ' ')}
                        />
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {row.product.progress_pct}%
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {row.releasedFeatures} / {row.totalFeatures}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {row.openBugs}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {row.releaseCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <Briefcase className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Project Delivery &amp; Cost Utilization ({projectRows.length})
              </h2>
            </div>
            {projectRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No projects created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                      <th className="px-5 py-3 font-medium">Project</th>
                      <th className="px-5 py-3 font-medium">Manager</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Budget</th>
                      <th className="px-5 py-3 text-right font-medium">Approved Spend</th>
                      <th className="px-5 py-3 text-right font-medium">Progress</th>
                      <th className="px-5 py-3 text-right font-medium">Overdue Tasks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                    {projectRows.map((row) => (
                      <tr key={row.project.id}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{row.project.name}</div>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {row.project.code}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                          {row.project.project_manager_id
                            ? memberMap.get(row.project.project_manager_id)?.full_name ?? 'Manager'
                            : 'Unassigned'}
                        </td>
                        <td className="px-5 py-3 capitalize text-slate-700 dark:text-slate-300">
                          {row.project.status.replace('_', ' ')}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMinorCurrency(row.project.budget_minor, row.project.budget_currency)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatMinorCurrency(row.approvedSpendMinor, row.project.budget_currency)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.project.progress_pct}%
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.overdueCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* TAB 3: Client Pipeline & Contracts */}
      {activeTab === 'commercial' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729] lg:col-span-7">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <Handshake className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Lead Pipeline Stage Conversion
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                    <th className="px-5 py-3 font-medium">Stage</th>
                    <th className="px-5 py-3 text-right font-medium">Leads</th>
                    <th className="px-5 py-3 text-right font-medium">Estimated Value</th>
                    <th className="px-5 py-3 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {pipelineRows.map((row) => (
                    <tr key={row.stage}>
                      <td className="px-5 py-2.5 font-medium capitalize text-slate-900 dark:text-white">
                        {row.stage.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {row.count}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatMinorCurrency(row.valueMinor, currencyCode)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {row.sharePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729] lg:col-span-5">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Proposals &amp; Active Contracts
            </h2>
            <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Total Proposals</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {proposals.length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Awaiting Technical Review</dt>
                <dd className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                  {proposals.filter((p) => p.status === 'pending_tech_review').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Awaiting Commercial Approval</dt>
                <dd className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                  {proposals.filter((p) => p.status === 'pending_commercial_approval').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Accepted Proposals</dt>
                <dd className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {proposals.filter((p) => p.status === 'accepted').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Active Contracts</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {contracts.filter((c) => c.status === 'active').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Active Contract Value</dt>
                <dd className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMinorCurrency(
                    contracts
                      .filter((c) => c.status === 'active')
                      .reduce((acc, c) => acc + c.contract_value_minor, 0),
                    currencyCode
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}

      {/* TAB 4: People, Attendance & Governance */}
      {activeTab === 'people' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <Users className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Department Staffing &amp; Attendance Utilization
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-[#1E3252] dark:text-slate-400">
                    <th className="py-2 font-medium">Department</th>
                    <th className="py-2 text-right font-medium">Active Staff</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {departments.map((d) => {
                    const members = teamMembers.filter((m) => m.department_id === d.id);
                    const active = members.filter((m) => m.status === 'active').length;
                    return (
                      <tr key={d.id}>
                        <td className="py-2 font-medium text-slate-900 dark:text-white">{d.name}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {active}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {members.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4 text-xs dark:border-[#1E3252]">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Attendance Logs in Period ({filteredAttendance.length})
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="rounded border border-slate-200 p-2 dark:border-[#1E3252]">
                  <div className="text-slate-500">Office</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {filteredAttendance.filter((a) => a.status === 'present').length}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-2 dark:border-[#1E3252]">
                  <div className="text-slate-500">Remote</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {filteredAttendance.filter((a) => a.status === 'remote').length}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-2 dark:border-[#1E3252]">
                  <div className="text-slate-500">Approved Leave</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {leaveRequests.filter((l) => l.status === 'approved').length}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <ShieldCheck className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Governance, Approvals &amp; Decision Execution
              </h2>
            </div>
            <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Pending Approval Requests</dt>
                <dd className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {approvals.filter((a) => a.status === 'pending').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Approved Governance Requests</dt>
                <dd className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {approvals.filter((a) => a.status === 'approved').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Rejected Requests</dt>
                <dd className="font-mono tabular-nums text-red-700 dark:text-red-400">
                  {approvals.filter((a) => a.status === 'rejected').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Official Approved Decisions</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {decisions.filter((d) => d.status === 'approved').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Open Decision Action Items</dt>
                <dd className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                  {decisionActions.filter((a) => a.status === 'open' || a.status === 'in_progress').length}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Completed Decision Actions</dt>
                <dd className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {decisionActions.filter((a) => a.status === 'completed').length}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}

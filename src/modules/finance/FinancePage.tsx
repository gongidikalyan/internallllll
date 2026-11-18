import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowDownUp,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatMinorCurrency } from '../../lib/currency';
import { erpRepository } from '../../services/erpRepository';
import type {
  BudgetRecord,
  BudgetStatus,
  FinancialTransactionRecord,
  FinancialTransactionType,
  InvoiceRecord,
  InvoiceStatus,
} from '../../types/erp';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type FinanceTab = 'ledger' | 'invoices' | 'budgets' | 'units_projects' | 'accounts';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

function majorToMinor(rawMajor: string | undefined, currencyCode: string, allowNegative = false): number {
  const cleaned = (rawMajor ?? '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return 0;
  if (!allowNegative && parsed < 0) return 0;
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 1 : 100;
  return Math.round(parsed * multiplier);
}

const TX_TYPE_LABELS: Record<FinancialTransactionType, string> = {
  actual_revenue: 'Actual Revenue',
  actual_expense: 'Actual Expense',
  planned_expense: 'Planned Expense',
  forecast_revenue: 'Forecast Revenue',
  adjustment: 'Ledger Adjustment',
  reversal: 'Immutable Reversal',
};

const INVOICE_STATUS_TONES: Record<InvoiceStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  draft: 'neutral',
  issued: 'warning',
  partially_paid: 'warning',
  paid: 'nominal',
  overdue: 'critical',
  void: 'neutral',
};

const BUDGET_STATUS_TONES: Record<BudgetStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'nominal',
  locked: 'nominal',
};

const createTxSchema = z.object({
  transaction_type: z.enum([
    'actual_revenue',
    'actual_expense',
    'planned_expense',
    'forecast_revenue',
    'adjustment',
  ]),
  account_id: z.string().min(1, 'Select a financial account.'),
  category_id: z.string().min(1, 'Select a category.'),
  business_unit_id: z.string().optional(),
  project_id: z.string().optional(),
  amount_major: z.string().min(1, 'Amount is required.'),
  currency_code: z.string().min(3).max(3),
  transaction_date: z.string().min(1, 'Date is required.'),
  description: z.string().min(3, 'Enter a clear transaction description.'),
  reference_number: z.string().optional(),
  submit_for_approval: z.boolean(),
  assigned_approver_id: z.string().optional(),
});

type CreateTxForm = z.infer<typeof createTxSchema>;

const createBudgetSchema = z.object({
  name: z.string().min(2, 'Budget name is required.'),
  fiscal_year: z.string().min(4),
  business_unit_id: z.string().optional(),
  department_id: z.string().optional(),
  project_id: z.string().optional(),
  allocated_major: z.string().min(1, 'Allocation amount is required.'),
  currency_code: z.string().min(3).max(3),
  status: z.enum(['draft', 'pending_approval']),
  assigned_approver_id: z.string().optional(),
});

type CreateBudgetForm = z.infer<typeof createBudgetSchema>;

const createInvoiceSchema = z.object({
  client_id: z.string().min(1, 'Select a client account.'),
  business_unit_id: z.string().optional(),
  project_id: z.string().optional(),
  invoice_number: z.string().min(2, 'Invoice number is required.'),
  issue_date: z.string().min(1, 'Issue date is required.'),
  due_date: z.string().min(1, 'Due date is required.'),
  subtotal_major: z.string().min(1, 'Subtotal is required.'),
  tax_major: z.string().optional(),
  currency_code: z.string().min(3).max(3),
  issue_immediately: z.boolean(),
});

type CreateInvoiceForm = z.infer<typeof createInvoiceSchema>;

export function FinancePage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<FinanceTab>('ledger');
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [actionError, setActionError] = useState<string | null>(null);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [reversalTarget, setReversalTarget] = useState<FinancialTransactionRecord | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRecord | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(searchParams.get('invoice'));

  // Payment modal state
  const [payAccountId, setPayAccountId] = useState('');
  const [payCategoryId, setPayCategoryId] = useState('');
  const [payAmountMajor, setPayAmountMajor] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payRef, setPayRef] = useState('');

  // Account & Category creation inline state
  const [acctCode, setAcctCode] = useState('');
  const [acctName, setAcctName] = useState('');
  const [acctType, setAcctType] = useState<'bank' | 'cash' | 'receivable' | 'payable' | 'reserve'>('bank');
  const [catCode, setCatCode] = useState('');
  const [catName, setCatName] = useState('');
  const [catFlow, setCatFlow] = useState<'income' | 'expense'>('expense');

  useEffect(() => {
    const pTab = searchParams.get('tab') as FinanceTab | null;
    const pInvoice = searchParams.get('invoice');
    if (pTab && ['ledger', 'invoices', 'budgets', 'units_projects', 'accounts'].includes(pTab)) {
      setActiveTab(pTab);
    }
    if (pInvoice) {
      setActiveTab('invoices');
      setSelectedInvoiceId(pInvoice);
    }
  }, [searchParams]);

  const canManageFinance = hasPermission('finance.manage');

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

  const departmentsQuery = useQuery({
    queryKey: ['departments', companyId],
    queryFn: () => erpRepository.listDepartments(companyId!),
    enabled: Boolean(companyId),
  });

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', companyId],
    queryFn: () => erpRepository.listClients(companyId!),
    enabled: Boolean(companyId),
  });

  const accountsQuery = useQuery({
    queryKey: ['financial_accounts', companyId],
    queryFn: () => erpRepository.listFinancialAccounts(companyId!),
    enabled: Boolean(companyId),
  });

  const categoriesQuery = useQuery({
    queryKey: ['financial_categories', companyId],
    queryFn: () => erpRepository.listFinancialCategories(companyId!),
    enabled: Boolean(companyId),
  });

  const transactionsQuery = useQuery({
    queryKey: ['financial_transactions', companyId],
    queryFn: () => erpRepository.listFinancialTransactions(companyId!),
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

  const paymentsQuery = useQuery({
    queryKey: ['invoice_payments', companyId],
    queryFn: () => erpRepository.listInvoicePayments(companyId!),
    enabled: Boolean(companyId),
  });

  const defaultCurrency = companyQuery.data?.default_currency ?? 'INR';
  const businessUnits = businessUnitsQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const teamMembers = teamQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const unitMap = useMemo(() => new Map(businessUnits.map((b) => [b.id, b])), [businessUnits]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);
  const txMap = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);

  const approverCandidates = useMemo(
    () =>
      teamMembers.filter(
        (m) =>
          m.id !== currentUser?.id &&
          m.roles.some((r) => ['ceo', 'finance_manager', 'cbo', 'cto'].includes(r.slug))
      ),
    [teamMembers, currentUser?.id]
  );

  // Aggregate integer minor-unit KPIs
  const summary = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    let actualRevenueMinor = 0;
    let actualExpensesMinor = 0;
    let plannedExpensesMinor = 0;
    let forecastRevenueMinor = 0;
    let pendingTxCount = 0;

    for (const tx of transactions) {
      if (tx.approval_status === 'pending') {
        pendingTxCount += 1;
        continue;
      }
      if (tx.approval_status !== 'approved') continue;

      if (tx.transaction_type === 'actual_revenue') {
        actualRevenueMinor += tx.amount_minor;
      } else if (tx.transaction_type === 'actual_expense') {
        actualExpensesMinor += tx.amount_minor;
      } else if (tx.transaction_type === 'planned_expense') {
        plannedExpensesMinor += tx.amount_minor;
      } else if (tx.transaction_type === 'forecast_revenue') {
        forecastRevenueMinor += tx.amount_minor;
      } else if (tx.transaction_type === 'reversal' && tx.parent_transaction_id) {
        const parent = txMap.get(tx.parent_transaction_id);
        if (parent?.transaction_type === 'actual_revenue') actualRevenueMinor += tx.amount_minor;
        if (parent?.transaction_type === 'actual_expense') actualExpensesMinor += tx.amount_minor;
      } else if (tx.transaction_type === 'adjustment') {
        const cat = categoryMap.get(tx.category_id);
        if (cat?.flow_type === 'income') actualRevenueMinor += tx.amount_minor;
        if (cat?.flow_type === 'expense') actualExpensesMinor += tx.amount_minor;
      }
    }

    let invoicedMinor = 0;
    let receivablesMinor = 0;
    let overdueReceivablesMinor = 0;
    for (const inv of invoices) {
      if (inv.status === 'draft' || inv.status === 'void') continue;
      invoicedMinor += inv.total_minor;
      const balance = Math.max(0, inv.total_minor - inv.paid_minor);
      receivablesMinor += balance;
      if (balance > 0 && (inv.status === 'overdue' || inv.due_date < todayIso)) {
        overdueReceivablesMinor += balance;
      }
    }

    const totalApprovedBudgetMinor = budgets
      .filter((b) => b.status === 'approved' || b.status === 'locked')
      .reduce((sum, b) => sum + b.allocated_minor, 0);

    return {
      actualRevenueMinor,
      actualExpensesMinor,
      netCashflowMinor: actualRevenueMinor - actualExpensesMinor,
      plannedExpensesMinor,
      forecastRevenueMinor,
      pendingTxCount,
      invoicedMinor,
      receivablesMinor,
      overdueReceivablesMinor,
      totalApprovedBudgetMinor,
    };
  }, [transactions, txMap, categoryMap, invoices, budgets]);

  // Business Unit Rollup
  const unitRollups = useMemo(() => {
    return businessUnits.map((bu) => {
      const buTxs = transactions.filter((t) => t.business_unit_id === bu.id);
      let actualRev = 0;
      let actualExp = 0;
      let plannedExp = 0;
      let forecastRev = 0;

      for (const tx of buTxs) {
        if (tx.approval_status === 'approved') {
          if (tx.transaction_type === 'actual_revenue') actualRev += tx.amount_minor;
          if (tx.transaction_type === 'actual_expense') actualExp += tx.amount_minor;
          if (tx.transaction_type === 'reversal' && tx.parent_transaction_id) {
            const parent = txMap.get(tx.parent_transaction_id);
            if (parent?.transaction_type === 'actual_revenue') actualRev += tx.amount_minor;
            if (parent?.transaction_type === 'actual_expense') actualExp += tx.amount_minor;
          }
          if (tx.transaction_type === 'adjustment') {
            const cat = categoryMap.get(tx.category_id);
            if (cat?.flow_type === 'income') actualRev += tx.amount_minor;
            if (cat?.flow_type === 'expense') actualExp += tx.amount_minor;
          }
        }
        if (tx.transaction_type === 'planned_expense') plannedExp += tx.amount_minor;
        if (tx.transaction_type === 'forecast_revenue') forecastRev += tx.amount_minor;
      }

      const allocatedBudget = budgets
        .filter((b) => b.business_unit_id === bu.id && (b.status === 'approved' || b.status === 'locked'))
        .reduce((sum, b) => sum + b.allocated_minor, 0);

      const receivables = invoices
        .filter((i) => i.business_unit_id === bu.id && i.status !== 'draft' && i.status !== 'void')
        .reduce((sum, i) => sum + Math.max(0, i.total_minor - i.paid_minor), 0);

      return {
        bu,
        actualRev,
        actualExp,
        net: actualRev - actualExp,
        plannedExp,
        forecastRev,
        allocatedBudget,
        receivables,
      };
    });
  }, [businessUnits, transactions, txMap, categoryMap, budgets, invoices]);

  // Project Cost Rollup
  const projectRollups = useMemo(() => {
    return projects.map((proj) => {
      const pTxs = transactions.filter((t) => t.project_id === proj.id);
      let actualCost = 0;
      let plannedCost = 0;
      let cashReceived = 0;

      for (const tx of pTxs) {
        if (tx.approval_status === 'approved') {
          if (tx.transaction_type === 'actual_expense') actualCost += tx.amount_minor;
          if (tx.transaction_type === 'actual_revenue') cashReceived += tx.amount_minor;
          if (tx.transaction_type === 'reversal' && tx.parent_transaction_id) {
            const parent = txMap.get(tx.parent_transaction_id);
            if (parent?.transaction_type === 'actual_expense') actualCost += tx.amount_minor;
            if (parent?.transaction_type === 'actual_revenue') cashReceived += tx.amount_minor;
          }
        }
        if (tx.transaction_type === 'planned_expense') plannedCost += tx.amount_minor;
      }

      const invoiced = invoices
        .filter((i) => i.project_id === proj.id && i.status !== 'draft' && i.status !== 'void')
        .reduce((sum, i) => sum + i.total_minor, 0);

      return {
        proj,
        actualCost,
        plannedCost,
        cashReceived,
        invoiced,
        variance: proj.budget_minor - actualCost,
      };
    });
  }, [projects, transactions, txMap, invoices]);

  const filteredTransactions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (unitFilter !== 'all' && tx.business_unit_id !== unitFilter) return false;
      if (typeFilter !== 'all' && tx.transaction_type !== typeFilter) return false;
      if (q) {
        const cat = categoryMap.get(tx.category_id)?.name.toLowerCase() ?? '';
        const acct = accountMap.get(tx.account_id)?.name.toLowerCase() ?? '';
        const ref = (tx.reference_number ?? '').toLowerCase();
        if (
          !tx.description.toLowerCase().includes(q) &&
          !cat.includes(q) &&
          !acct.includes(q) &&
          !ref.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, unitFilter, typeFilter, searchTerm, categoryMap, accountMap]);

  const filteredInvoices = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const q = searchTerm.trim().toLowerCase();
    return invoices.filter((inv) => {
      const effectiveStatus: InvoiceStatus =
        inv.status !== 'paid' && inv.status !== 'void' && inv.status !== 'draft' && inv.due_date < todayIso
          ? 'overdue'
          : inv.status;
      if (invoiceStatusFilter !== 'all' && effectiveStatus !== invoiceStatusFilter) return false;
      if (unitFilter !== 'all' && inv.business_unit_id !== unitFilter) return false;
      if (q) {
        const clientName = clientMap.get(inv.client_id)?.name.toLowerCase() ?? '';
        if (!inv.invoice_number.toLowerCase().includes(q) && !clientName.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, invoiceStatusFilter, unitFilter, searchTerm, clientMap]);

  const selectedInvoice = useMemo(
    () => invoices.find((i) => i.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId]
  );

  const selectedInvoicePayments = useMemo(
    () => (selectedInvoice ? payments.filter((p) => p.invoice_id === selectedInvoice.id) : []),
    [payments, selectedInvoice]
  );

  const invalidateFinance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['financial_accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['financial_categories'] }),
      queryClient.invalidateQueries({ queryKey: ['financial_transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['invoice_payments'] }),
      queryClient.invalidateQueries({ queryKey: ['approval_requests'] }),
      queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['bu_finance'] }),
    ]);
  };

  // Forms
  const txForm = useForm<CreateTxForm>({
    resolver: zodResolver(createTxSchema),
    defaultValues: {
      transaction_type: 'actual_expense',
      account_id: accounts[0]?.id ?? '',
      category_id: categories[0]?.id ?? '',
      business_unit_id: '',
      project_id: '',
      amount_major: '',
      currency_code: defaultCurrency,
      transaction_date: new Date().toISOString().slice(0, 10),
      description: '',
      reference_number: '',
      submit_for_approval: true,
      assigned_approver_id: '',
    },
  });

  useEffect(() => {
    if (txModalOpen) {
      txForm.reset({
        transaction_type: 'actual_expense',
        account_id: accounts[0]?.id ?? '',
        category_id: categories.find((c) => c.flow_type === 'expense')?.id ?? categories[0]?.id ?? '',
        business_unit_id: '',
        project_id: '',
        amount_major: '',
        currency_code: defaultCurrency,
        transaction_date: new Date().toISOString().slice(0, 10),
        description: '',
        reference_number: '',
        submit_for_approval: true,
        assigned_approver_id: approverCandidates[0]?.id ?? '',
      });
    }
  }, [txModalOpen, accounts, categories, defaultCurrency, approverCandidates, txForm]);

  const budgetForm = useForm<CreateBudgetForm>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      name: '',
      fiscal_year: String(new Date().getFullYear()),
      business_unit_id: '',
      department_id: '',
      project_id: '',
      allocated_major: '',
      currency_code: defaultCurrency,
      status: 'pending_approval',
      assigned_approver_id: '',
    },
  });

  const invoiceForm = useForm<CreateInvoiceForm>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      client_id: clients[0]?.id ?? '',
      business_unit_id: businessUnits.find((b) => b.unit_type === 'client_services')?.id ?? '',
      project_id: '',
      invoice_number: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
      subtotal_major: '',
      tax_major: '0',
      currency_code: defaultCurrency,
      issue_immediately: true,
    },
  });

  useEffect(() => {
    if (invoiceModalOpen) {
      invoiceForm.reset({
        client_id: clients[0]?.id ?? '',
        business_unit_id: businessUnits.find((b) => b.unit_type === 'client_services')?.id ?? '',
        project_id: '',
        invoice_number: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
        subtotal_major: '',
        tax_major: '0',
        currency_code: defaultCurrency,
        issue_immediately: true,
      });
    }
  }, [invoiceModalOpen, clients, businessUnits, invoices.length, defaultCurrency, invoiceForm]);

  // Mutations
  const createTxMutation = useMutation({
    mutationFn: async (vals: CreateTxForm) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      const allowNegative = vals.transaction_type === 'adjustment';
      const amountMinor = majorToMinor(vals.amount_major, vals.currency_code, allowNegative);
      return erpRepository.createFinancialTransaction(currentUser.id, companyId, {
        business_unit_id: vals.business_unit_id || null,
        project_id: vals.project_id || null,
        account_id: vals.account_id,
        category_id: vals.category_id,
        transaction_type: vals.transaction_type,
        amount_minor: amountMinor,
        currency_code: vals.currency_code,
        transaction_date: vals.transaction_date,
        description: vals.description,
        reference_number: vals.reference_number || null,
        submit_for_approval: vals.submit_for_approval,
        assigned_approver_id: vals.assigned_approver_id || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setTxModalOpen(false);
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to record transaction.'),
  });

  const reverseTxMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !reversalTarget) throw new Error('Reversal target missing.');
      return erpRepository.reverseFinancialTransaction(currentUser.id, companyId, reversalTarget.id, reversalReason);
    },
    onSuccess: async () => {
      setActionError(null);
      setReversalTarget(null);
      setReversalReason('');
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to reverse transaction.'),
  });

  const createBudgetMutation = useMutation({
    mutationFn: async (vals: CreateBudgetForm) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.createBudget(currentUser.id, companyId, {
        business_unit_id: vals.business_unit_id || null,
        department_id: vals.department_id || null,
        project_id: vals.project_id || null,
        fiscal_year: Number(vals.fiscal_year) || new Date().getFullYear(),
        name: vals.name,
        allocated_minor: majorToMinor(vals.allocated_major, vals.currency_code),
        currency_code: vals.currency_code,
        status: vals.status,
        assigned_approver_id: vals.assigned_approver_id || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setBudgetModalOpen(false);
      budgetForm.reset();
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to create budget.'),
  });

  const budgetStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BudgetStatus }) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.updateBudgetStatus(currentUser.id, companyId, id, status);
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update budget status.'),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (vals: CreateInvoiceForm) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.createInvoice(currentUser.id, companyId, {
        client_id: vals.client_id,
        business_unit_id: vals.business_unit_id || null,
        project_id: vals.project_id || null,
        invoice_number: vals.invoice_number,
        issue_date: vals.issue_date,
        due_date: vals.due_date,
        subtotal_minor: majorToMinor(vals.subtotal_major, vals.currency_code),
        tax_minor: majorToMinor(vals.tax_major, vals.currency_code),
        currency_code: vals.currency_code,
        issue_immediately: vals.issue_immediately,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setInvoiceModalOpen(false);
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to create invoice.'),
  });

  const issueInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.issueInvoice(currentUser.id, companyId, invoiceId);
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to issue invoice.'),
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.voidInvoice(currentUser.id, companyId, invoiceId);
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to void invoice.'),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !paymentTarget) throw new Error('Missing payment target.');
      return erpRepository.recordInvoicePayment(currentUser.id, companyId, {
        invoice_id: paymentTarget.id,
        account_id: payAccountId,
        revenue_category_id: payCategoryId || null,
        amount_minor: majorToMinor(payAmountMajor, paymentTarget.currency_code),
        payment_date: payDate,
        payment_method: payMethod,
        reference_code: payRef || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setPaymentTarget(null);
      setPayAmountMajor('');
      setPayRef('');
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to record payment.'),
  });

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.createFinancialAccount(currentUser.id, companyId, {
        code: acctCode,
        name: acctName,
        account_type: acctType,
        currency_code: defaultCurrency,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setAcctCode('');
      setAcctName('');
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to add account.'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.createFinancialCategory(currentUser.id, companyId, {
        code: catCode,
        name: catName,
        flow_type: catFlow,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setCatCode('');
      setCatName('');
      await invalidateFinance();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to add category.'),
  });

  const openPaymentModal = (inv: InvoiceRecord) => {
    const remaining = Math.max(0, inv.total_minor - inv.paid_minor);
    const divisor = ZERO_DECIMAL_CURRENCIES.has(inv.currency_code.toUpperCase()) ? 1 : 100;
    setPaymentTarget(inv);
    setPayAccountId(accounts.find((a) => a.account_type === 'bank')?.id ?? accounts[0]?.id ?? '');
    setPayCategoryId(
      categories.find((c) => c.code === 'REV-CLIENT')?.id ??
        categories.find((c) => c.flow_type === 'income')?.id ??
        ''
    );
    setPayAmountMajor(divisor === 1 ? String(remaining) : (remaining / divisor).toFixed(2));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('Bank Transfer');
    setPayRef('');
  };

  const exportLedgerCsv = () => {
    const header = [
      'Date',
      'Type',
      'Status',
      'Description',
      'Business Unit',
      'Account',
      'Category',
      'Reference',
      'Currency',
      'AmountMinor',
    ];
    const rows = filteredTransactions.map((tx) => [
      tx.transaction_date,
      tx.transaction_type,
      tx.approval_status,
      `"${tx.description.replace(/"/g, '""')}"`,
      tx.business_unit_id ? unitMap.get(tx.business_unit_id)?.name ?? '' : 'Company-Wide',
      accountMap.get(tx.account_id)?.name ?? '',
      categoryMap.get(tx.category_id)?.name ?? '',
      tx.reference_number ?? '',
      tx.currency_code,
      String(tx.amount_minor),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `company-erp-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const computeBudgetSpend = (budget: BudgetRecord): number => {
    let spent = 0;
    for (const tx of transactions) {
      if (tx.approval_status !== 'approved') continue;
      if (Number(tx.transaction_date.slice(0, 4)) !== budget.fiscal_year) continue;
      if (budget.project_id && tx.project_id !== budget.project_id) continue;
      if (budget.business_unit_id && tx.business_unit_id !== budget.business_unit_id) continue;
      if (tx.transaction_type === 'actual_expense') {
        spent += tx.amount_minor;
      } else if (tx.transaction_type === 'reversal' && tx.parent_transaction_id) {
        const parent = txMap.get(tx.parent_transaction_id);
        if (parent?.transaction_type === 'actual_expense') spent += tx.amount_minor;
      }
    }
    return spent;
  };

  if (transactionsQuery.isLoading || accountsQuery.isLoading || invoicesQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-[#13233C]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Financial Governance · Integer Minor Units ({defaultCurrency})
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Finance &amp; Treasury
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {hasPermission('approvals.view') ? (
            <Link
              to="/approvals"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
            >
              Approvals Queue
              {summary.pendingTxCount > 0 ? (
                <span className="font-mono text-amber-700 dark:text-amber-400">({summary.pendingTxCount})</span>
              ) : null}
            </Link>
          ) : null}
          {canManageFinance ? (
            <>
              <button
                type="button"
                onClick={() => setInvoiceModalOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
              >
                <Receipt className="h-3.5 w-3.5" />
                New Invoice
              </button>
              <button
                type="button"
                onClick={() => setTxModalOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Record Entry
              </button>
            </>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-3 font-medium underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* KPI Strip (Strictly separates received cash vs invoiced vs receivables) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Received Revenue</span>
            <Wallet className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMinorCurrency(summary.actualRevenueMinor, defaultCurrency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Approved cash inflow</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Approved Expenses</span>
            <ArrowDownUp className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatMinorCurrency(summary.actualExpensesMinor, defaultCurrency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.pendingTxCount} pending approval
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Net Cash Position</span>
            <Landmark className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div
            className={`mt-2 font-mono text-xl font-semibold tabular-nums ${
              summary.netCashflowMinor >= 0
                ? 'text-slate-900 dark:text-white'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatMinorCurrency(summary.netCashflowMinor, defaultCurrency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Actual revenue less expenses</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Invoiced Revenue</span>
            <Receipt className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatMinorCurrency(summary.invoicedMinor, defaultCurrency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Issued client billing</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Receivables</span>
            <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div
            className={`mt-2 font-mono text-xl font-semibold tabular-nums ${
              summary.overdueReceivablesMinor > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {formatMinorCurrency(summary.receivablesMinor, defaultCurrency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Overdue: {formatMinorCurrency(summary.overdueReceivablesMinor, defaultCurrency)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Approved Budgets</span>
            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatMinorCurrency(summary.totalApprovedBudgetMinor, defaultCurrency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {budgets.filter((b) => b.status === 'approved' || b.status === 'locked').length} active allocations
          </div>
        </div>
      </div>

      {/* Navigation Tabs + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-[#1E3252]">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#091221]">
          {(
            [
              { id: 'ledger', label: `Immutable Ledger (${transactions.length})` },
              { id: 'invoices', label: `Invoices & Receivables (${invoices.length})` },
              { id: 'budgets', label: `Budgets (${budgets.length})` },
              { id: 'units_projects', label: 'Units & Project Costs' },
              { id: 'accounts', label: 'Accounts & Exports' },
            ] as Array<{ id: FinanceTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-[#13233C] dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === 'ledger' || activeTab === 'invoices') ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'ledger' ? 'Search ledger or ref...' : 'Search invoice or client...'}
                className="h-8 w-52 rounded-md border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
              />
            </div>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filter by business unit"
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
            >
              <option value="all">All Business Units</option>
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
            {activeTab === 'ledger' ? (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by transaction type"
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
              >
                <option value="all">All Entry Types</option>
                {Object.entries(TX_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                aria-label="Filter by invoice status"
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
            )}
          </div>
        ) : null}
      </div>

      {/* TAB 1: IMMUTABLE LEDGER */}
      {activeTab === 'ledger' ? (
        filteredTransactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No ledger transactions recorded"
            description="Every income, expense, forecast, adjustment, and reversal entry is recorded as an immutable ledger row in integer minor currency units."
            action={
              canManageFinance ? (
                <button
                  type="button"
                  onClick={() => setTxModalOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Record First Entry
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description &amp; Scope</th>
                  <th className="px-4 py-3">Account / Category</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {filteredTransactions.map((tx) => {
                  const unit = tx.business_unit_id ? unitMap.get(tx.business_unit_id) : null;
                  const proj = tx.project_id ? projectMap.get(tx.project_id) : null;
                  const acct = accountMap.get(tx.account_id);
                  const cat = categoryMap.get(tx.category_id);
                  const isReversed = transactions.some(
                    (other) => other.parent_transaction_id === tx.id && other.transaction_type === 'reversal'
                  );
                  const canReverse =
                    canManageFinance &&
                    tx.transaction_type !== 'reversal' &&
                    tx.approval_status === 'approved' &&
                    !isReversed;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-[#102038]">
                      <td className="px-4 py-3 font-mono whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {tx.transaction_date}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {TX_TYPE_LABELS[tx.transaction_type]}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{tx.description}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {unit ? unit.name : 'Company-Wide'}
                          {proj ? ` · ${proj.code}` : ''}
                          {tx.reference_number ? ` · Ref ${tx.reference_number}` : ''}
                          {` · By ${memberMap.get(tx.recorded_by)?.full_name ?? 'Member'}`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800 dark:text-slate-200">{acct?.name ?? 'Account'}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {cat?.name ?? 'Category'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusText
                          tone={
                            tx.approval_status === 'approved'
                              ? 'nominal'
                              : tx.approval_status === 'rejected'
                                ? 'critical'
                                : 'warning'
                          }
                          label={tx.approval_status.charAt(0).toUpperCase() + tx.approval_status.slice(1)}
                        />
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                          tx.transaction_type === 'actual_revenue' || tx.transaction_type === 'forecast_revenue'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : tx.transaction_type === 'reversal'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatMinorCurrency(tx.amount_minor, tx.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isReversed ? (
                          <span className="text-[11px] text-slate-400">Reversed</span>
                        ) : canReverse ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReversalTarget(tx);
                              setReversalReason('');
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reverse
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Immutable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* TAB 2: INVOICES & PARTIAL PAYMENTS */}
      {activeTab === 'invoices' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className={selectedInvoice ? 'lg:col-span-2' : 'lg:col-span-3'}>
            {filteredInvoices.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No invoices found"
                description="Create client invoices to track billed amounts separately from collected cash payments and monitor outstanding receivables."
                action={
                  canManageFinance ? (
                    <button
                      type="button"
                      onClick={() => setInvoiceModalOpen(true)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create Client Invoice
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Client &amp; Unit</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Receivable</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                    {filteredInvoices.map((inv) => {
                      const todayIso = new Date().toISOString().slice(0, 10);
                      const effectiveStatus: InvoiceStatus =
                        inv.status !== 'paid' &&
                        inv.status !== 'void' &&
                        inv.status !== 'draft' &&
                        inv.due_date < todayIso
                          ? 'overdue'
                          : inv.status;
                      const balance =
                        inv.status === 'void' || inv.status === 'draft'
                          ? 0
                          : Math.max(0, inv.total_minor - inv.paid_minor);
                      const client = clientMap.get(inv.client_id);
                      const unit = inv.business_unit_id ? unitMap.get(inv.business_unit_id) : null;

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50/70 dark:hover:bg-[#102038] ${
                            selectedInvoiceId === inv.id ? 'bg-slate-50 dark:bg-[#102038]' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoiceId(inv.id)}
                              className="font-mono font-semibold text-[#0B3B66] hover:underline dark:text-sky-400"
                            >
                              {inv.invoice_number}
                            </button>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                              Issued {inv.issue_date}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {client?.name ?? 'Client'}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {unit?.name ?? 'Company'}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {inv.due_date}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusText
                              tone={INVOICE_STATUS_TONES[effectiveStatus]}
                              label={effectiveStatus.replace('_', ' ')}
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatMinorCurrency(inv.total_minor, inv.currency_code)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatMinorCurrency(inv.paid_minor, inv.currency_code)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMinorCurrency(balance, inv.currency_code)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {canManageFinance && inv.status === 'draft' ? (
                                <button
                                  type="button"
                                  onClick={() => issueInvoiceMutation.mutate(inv.id)}
                                  className="font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                                >
                                  Issue
                                </button>
                              ) : null}
                              {canManageFinance &&
                              (inv.status === 'issued' ||
                                inv.status === 'partially_paid' ||
                                inv.status === 'overdue') &&
                              balance > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => openPaymentModal(inv)}
                                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                                >
                                  Record Payment
                                </button>
                              ) : null}
                              {canManageFinance && inv.paid_minor === 0 && inv.status !== 'void' ? (
                                <button
                                  type="button"
                                  onClick={() => voidInvoiceMutation.mutate(inv.id)}
                                  className="text-slate-500 hover:text-red-700 hover:underline dark:text-slate-400 dark:hover:text-red-400"
                                >
                                  Void
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedInvoice ? (
            <aside className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <div>
                  <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {selectedInvoice.invoice_number}
                  </div>
                  <h2 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                    {clientMap.get(selectedInvoice.client_id)?.name ?? 'Client Invoice'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceId(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
                  aria-label="Close invoice drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Subtotal</dt>
                  <dd className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatMinorCurrency(selectedInvoice.subtotal_minor, selectedInvoice.currency_code)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Tax</dt>
                  <dd className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatMinorCurrency(selectedInvoice.tax_minor, selectedInvoice.currency_code)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold dark:border-[#1E3252]">
                  <dt className="text-slate-700 dark:text-slate-200">Total Billed</dt>
                  <dd className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatMinorCurrency(selectedInvoice.total_minor, selectedInvoice.currency_code)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Paid to Date</dt>
                  <dd className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatMinorCurrency(selectedInvoice.paid_minor, selectedInvoice.currency_code)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Remaining Receivable</dt>
                  <dd className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatMinorCurrency(
                      Math.max(0, selectedInvoice.total_minor - selectedInvoice.paid_minor),
                      selectedInvoice.currency_code
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Payment History ({selectedInvoicePayments.length})
                  </h3>
                  {canManageFinance &&
                  selectedInvoice.status !== 'draft' &&
                  selectedInvoice.status !== 'void' &&
                  selectedInvoice.paid_minor < selectedInvoice.total_minor ? (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(selectedInvoice)}
                      className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                    >
                      + Partial / Full Payment
                    </button>
                  ) : null}
                </div>

                {selectedInvoicePayments.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    No cash payments collected on this invoice yet.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                    {selectedInvoicePayments.map((pay) => (
                      <li key={pay.id} className="py-2.5">
                        <div className="flex items-center justify-between font-medium text-slate-900 dark:text-white">
                          <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatMinorCurrency(pay.amount_minor, pay.currency_code)}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {pay.payment_date}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {pay.payment_method}
                          {pay.reference_code ? ` · Ref ${pay.reference_code}` : ''}
                          {' · '}
                          {accountMap.get(pay.account_id)?.name ?? 'Account'}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}

      {/* TAB 3: BUDGETS */}
      {activeTab === 'budgets' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Budgets track allocated limits against approved expenses by fiscal year, business unit, department, or project.
            </p>
            {canManageFinance ? (
              <button
                type="button"
                onClick={() => setBudgetModalOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-3.5 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Budget
              </button>
            ) : null}
          </div>

          {budgets.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No budgets configured"
              description="Define fiscal year budgets per business unit, department, or project and submit them through separation-of-duties approval."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                    <th className="px-4 py-3">FY</th>
                    <th className="px-4 py-3">Budget &amp; Scope</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Allocated</th>
                    <th className="px-4 py-3 text-right">Actual Spend</th>
                    <th className="px-4 py-3 text-right">Remaining</th>
                    <th className="px-4 py-3 text-right">Governance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {budgets.map((b) => {
                    const spent = computeBudgetSpend(b);
                    const remaining = b.allocated_minor - spent;
                    const utilPct = b.allocated_minor > 0 ? Math.min(100, Math.round((spent / b.allocated_minor) * 100)) : 0;
                    const scopeParts = [
                      b.business_unit_id ? unitMap.get(b.business_unit_id)?.name : null,
                      b.department_id ? deptMap.get(b.department_id)?.name : null,
                      b.project_id ? projectMap.get(b.project_id)?.code : null,
                    ].filter(Boolean);

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-[#102038]">
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                          FY {b.fiscal_year}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{b.name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {scopeParts.length > 0 ? scopeParts.join(' · ') : 'Company-Wide'}
                            {' · '}
                            <span className="font-mono tabular-nums">{utilPct}% utilized</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusText
                            tone={BUDGET_STATUS_TONES[b.status]}
                            label={b.status.replace('_', ' ')}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatMinorCurrency(b.allocated_minor, b.currency_code)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMinorCurrency(spent, b.currency_code)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                            remaining < 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {formatMinorCurrency(remaining, b.currency_code)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {canManageFinance && b.status === 'draft' ? (
                            <button
                              type="button"
                              onClick={() => budgetStatusMutation.mutate({ id: b.id, status: 'pending_approval' })}
                              className="font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                            >
                              Submit for Approval
                            </button>
                          ) : canManageFinance && b.status === 'approved' ? (
                            <button
                              type="button"
                              onClick={() => budgetStatusMutation.mutate({ id: b.id, status: 'locked' })}
                              className="font-medium text-slate-600 hover:underline dark:text-slate-300"
                            >
                              Lock Budget
                            </button>
                          ) : b.status === 'pending_approval' ? (
                            <Link to="/approvals" className="text-[#0B3B66] hover:underline dark:text-sky-400">
                              In Approval Queue
                            </Link>
                          ) : (
                            <span className="text-[11px] text-slate-400">Locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 4: BUSINESS UNITS & PROJECT COSTS */}
      {activeTab === 'units_projects' ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Business-Unit Financial Summary
                </h2>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {unitRollups.length} units
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                    <th className="px-5 py-3">Business Unit</th>
                    <th className="px-5 py-3 text-right">Approved Budget</th>
                    <th className="px-5 py-3 text-right">Actual Revenue</th>
                    <th className="px-5 py-3 text-right">Actual Expenses</th>
                    <th className="px-5 py-3 text-right">Net Contribution</th>
                    <th className="px-5 py-3 text-right">Receivables</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {unitRollups.map((row) => (
                    <tr key={row.bu.id} className="hover:bg-slate-50/70 dark:hover:bg-[#102038]">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{row.bu.name}</div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{row.bu.code}</div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatMinorCurrency(row.allocatedBudget, row.bu.budget_currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMinorCurrency(row.actualRev, row.bu.budget_currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatMinorCurrency(row.actualExp, row.bu.budget_currency)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono font-semibold tabular-nums ${
                          row.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {formatMinorCurrency(row.net, row.bu.budget_currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatMinorCurrency(row.receivables, row.bu.budget_currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-slate-400" />
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Project Cost &amp; Billing Summary
                </h2>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {projectRollups.length} projects
              </span>
            </div>
            {projectRollups.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No projects created yet. Project costs will populate automatically as expenses and invoices link to projects.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                      <th className="px-5 py-3">Project</th>
                      <th className="px-5 py-3 text-right">Project Budget</th>
                      <th className="px-5 py-3 text-right">Actual Cost</th>
                      <th className="px-5 py-3 text-right">Budget Variance</th>
                      <th className="px-5 py-3 text-right">Invoiced</th>
                      <th className="px-5 py-3 text-right">Cash Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                    {projectRollups.map((row) => (
                      <tr key={row.proj.id} className="hover:bg-slate-50/70 dark:hover:bg-[#102038]">
                        <td className="px-5 py-3">
                          <Link
                            to={`/projects?project=${row.proj.id}`}
                            className="font-medium text-slate-900 hover:text-[#0B3B66] hover:underline dark:text-white dark:hover:text-sky-400"
                          >
                            {row.proj.code} · {row.proj.name}
                          </Link>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {row.proj.status.replace('_', ' ')}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMinorCurrency(row.proj.budget_minor, row.proj.budget_currency)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatMinorCurrency(row.actualCost, row.proj.budget_currency)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-mono font-semibold tabular-nums ${
                            row.variance >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {formatMinorCurrency(row.variance, row.proj.budget_currency)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMinorCurrency(row.invoiced, row.proj.budget_currency)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatMinorCurrency(row.cashReceived, row.proj.budget_currency)}
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

      {/* TAB 5: ACCOUNTS, CATEGORIES & CSV EXPORT */}
      {activeTab === 'accounts' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Financial Statements &amp; Ledger Export
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Download filtered immutable ledger transactions in CSV format with exact integer minor amounts.
              </p>
            </div>
            <button
              type="button"
              onClick={exportLedgerCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#13233C] dark:text-slate-200 dark:hover:bg-[#192D4D]"
            >
              <Download className="h-3.5 w-3.5" />
              Export Ledger CSV
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Financial Accounts */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Chart of Accounts ({accounts.length})
              </h3>
              <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                {accounts.map((acct) => (
                  <li key={acct.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{acct.code}</span>
                      <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-medium text-slate-900 dark:text-white">{acct.name}</span>
                    </div>
                    <span className="capitalize text-slate-500 dark:text-slate-400">
                      {acct.account_type} · {acct.currency_code}
                    </span>
                  </li>
                ))}
              </ul>

              {canManageFinance ? (
                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Add Financial Account</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={acctCode}
                      onChange={(e) => setAcctCode(e.target.value)}
                      placeholder="Code (e.g. 1030-EUR)"
                      className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                    <input
                      type="text"
                      value={acctName}
                      onChange={(e) => setAcctName(e.target.value)}
                      placeholder="Account name"
                      className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                    <div className="flex gap-2">
                      <select
                        value={acctType}
                        onChange={(e) => setAcctType(e.target.value as typeof acctType)}
                        className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                      >
                        <option value="bank">Bank</option>
                        <option value="cash">Cash</option>
                        <option value="reserve">Reserve</option>
                        <option value="receivable">Receivable</option>
                        <option value="payable">Payable</option>
                      </select>
                      <button
                        type="button"
                        disabled={!acctCode.trim() || !acctName.trim() || createAccountMutation.isPending}
                        onClick={() => createAccountMutation.mutate()}
                        className="h-8 rounded-md bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-sky-600"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Financial Categories */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Ledger Categories ({categories.length})
              </h3>
              <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                {categories.map((cat) => (
                  <li key={cat.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{cat.code}</span>
                      <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-medium text-slate-900 dark:text-white">{cat.name}</span>
                    </div>
                    <StatusText
                      tone={cat.flow_type === 'income' ? 'nominal' : 'neutral'}
                      label={cat.flow_type === 'income' ? 'Income' : 'Expense'}
                    />
                  </li>
                ))}
              </ul>

              {canManageFinance ? (
                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Add Ledger Category</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={catCode}
                      onChange={(e) => setCatCode(e.target.value)}
                      placeholder="Code (e.g. EXP-RND)"
                      className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                    <input
                      type="text"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="Category name"
                      className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                    <div className="flex gap-2">
                      <select
                        value={catFlow}
                        onChange={(e) => setCatFlow(e.target.value as typeof catFlow)}
                        className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                      <button
                        type="button"
                        disabled={!catCode.trim() || !catName.trim() || createCategoryMutation.isPending}
                        onClick={() => createCategoryMutation.mutate()}
                        className="h-8 rounded-md bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-sky-600"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {/* MODAL: RECORD LEDGER TRANSACTION */}
      {txModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Record Ledger Entry
              </h2>
              <button
                type="button"
                onClick={() => setTxModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={txForm.handleSubmit((vals) => createTxMutation.mutate(vals))} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Entry Type</label>
                  <select
                    {...txForm.register('transaction_type')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="actual_expense">Actual Expense</option>
                    <option value="actual_revenue">Actual Revenue</option>
                    <option value="planned_expense">Planned Expense</option>
                    <option value="forecast_revenue">Forecast Revenue</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Transaction Date</label>
                  <input
                    type="date"
                    {...txForm.register('transaction_date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Account</label>
                  <select
                    {...txForm.register('account_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    {...txForm.register('category_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.flow_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Amount</label>
                  <input
                    type="text"
                    placeholder="0.00"
                    {...txForm.register('amount_major')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <input
                    type="text"
                    maxLength={3}
                    {...txForm.register('currency_code')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono uppercase dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Reference #</label>
                  <input
                    type="text"
                    placeholder="Receipt / Voucher"
                    {...txForm.register('reference_number')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Business Unit</label>
                  <select
                    {...txForm.register('business_unit_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="">Company-Wide</option>
                    {businessUnits.map((bu) => (
                      <option key={bu.id} value={bu.id}>
                        {bu.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Project (Optional)</label>
                  <select
                    {...txForm.register('project_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Description</label>
                <input
                  type="text"
                  placeholder="Cloud compute billing, vendor invoice, or subscription payout..."
                  {...txForm.register('description')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                />
                {txForm.formState.errors.description ? (
                  <p className="mt-1 text-red-600">{txForm.formState.errors.description.message}</p>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-[#1E3252] dark:bg-[#091221]">
                <label className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                  <input type="checkbox" {...txForm.register('submit_for_approval')} />
                  Route through Separation-of-Duties Approval Queue
                </label>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  When checked, another authorized approver must sign off in the Approvals module before the entry affects approved financial totals.
                </p>
                {txForm.watch('submit_for_approval') ? (
                  <div className="mt-2">
                    <select
                      {...txForm.register('assigned_approver_id')}
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    >
                      <option value="">Any authorized approver</option>
                      {approverCandidates.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} ({m.roles.map((r) => r.name).join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTxModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTxMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600"
                >
                  {createTxMutation.isPending ? 'Posting...' : 'Post Ledger Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* MODAL: REVERSAL */}
      {reversalTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Post Immutable Reversal
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Original entries cannot be edited or deleted. A negative offsetting reversal entry will be linked to{' '}
              <span className="font-medium text-slate-800 dark:text-slate-200">{reversalTarget.description}</span> (
              <span className="font-mono">{formatMinorCurrency(reversalTarget.amount_minor, reversalTarget.currency_code)}</span>).
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Audit Reason for Reversal
              </label>
              <textarea
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Duplicate entry, corrected invoice amount, or voided vendor charge..."
                className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reversalReason.trim() || reverseTxMutation.isPending}
                onClick={() => reverseTxMutation.mutate()}
                className="h-9 rounded-md bg-amber-700 px-4 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {reverseTxMutation.isPending ? 'Posting Reversal...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL: CREATE BUDGET */}
      {budgetModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Create Fiscal Budget
              </h2>
              <button
                type="button"
                onClick={() => setBudgetModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={budgetForm.handleSubmit((vals) => createBudgetMutation.mutate(vals))}
              className="mt-4 space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Budget Title</label>
                  <input
                    type="text"
                    placeholder="WrindhaOS Q4 Cloud & Growth"
                    {...budgetForm.register('name')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Fiscal Year</label>
                  <input
                    type="text"
                    {...budgetForm.register('fiscal_year')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Business Unit</label>
                  <select
                    {...budgetForm.register('business_unit_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="">Company-Wide</option>
                    {businessUnits.map((bu) => (
                      <option key={bu.id} value={bu.id}>
                        {bu.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Department</label>
                  <select
                    {...budgetForm.register('department_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Project</label>
                  <select
                    {...budgetForm.register('project_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Allocated Amount</label>
                  <input
                    type="text"
                    placeholder="25000.00"
                    {...budgetForm.register('allocated_major')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <input
                    type="text"
                    maxLength={3}
                    {...budgetForm.register('currency_code')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono uppercase dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Initial Workflow</label>
                  <select
                    {...budgetForm.register('status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="pending_approval">Submit for Approval</option>
                    <option value="draft">Save as Draft</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBudgetMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600"
                >
                  {createBudgetMutation.isPending ? 'Saving...' : 'Create Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* MODAL: CREATE INVOICE */}
      {invoiceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Create Client Invoice
              </h2>
              <button
                type="button"
                onClick={() => setInvoiceModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {clients.length === 0 ? (
              <div className="py-6 text-xs text-slate-600 dark:text-slate-300">
                No client accounts exist yet. Convert a lead or add a client in{' '}
                <Link to="/client-services?tab=clients" className="font-medium text-[#0B3B66] underline dark:text-sky-400">
                  Client Services
                </Link>{' '}
                before issuing an invoice.
              </div>
            ) : (
              <form
                onSubmit={invoiceForm.handleSubmit((vals) => createInvoiceMutation.mutate(vals))}
                className="mt-4 space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Client Account</label>
                    <select
                      {...invoiceForm.register('client_id')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Invoice Number</label>
                    <input
                      type="text"
                      {...invoiceForm.register('invoice_number')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono uppercase dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Business Unit</label>
                    <select
                      {...invoiceForm.register('business_unit_id')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    >
                      <option value="">Company-Wide</option>
                      {businessUnits.map((bu) => (
                        <option key={bu.id} value={bu.id}>
                          {bu.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Project (Optional)</label>
                    <select
                      {...invoiceForm.register('project_id')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    >
                      <option value="">None</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Issue Date</label>
                    <input
                      type="date"
                      {...invoiceForm.register('issue_date')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                    <input
                      type="date"
                      {...invoiceForm.register('due_date')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Subtotal</label>
                    <input
                      type="text"
                      placeholder="5000.00"
                      {...invoiceForm.register('subtotal_major')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Tax</label>
                    <input
                      type="text"
                      placeholder="0.00"
                      {...invoiceForm.register('tax_major')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Currency</label>
                    <input
                      type="text"
                      maxLength={3}
                      {...invoiceForm.register('currency_code')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono uppercase dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 font-medium text-slate-700 dark:text-slate-300">
                  <input type="checkbox" {...invoiceForm.register('issue_immediately')} />
                  Issue invoice immediately (adds balance to Outstanding Receivables)
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setInvoiceModalOpen(false)}
                    className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createInvoiceMutation.isPending}
                    className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600"
                  >
                    {createInvoiceMutation.isPending ? 'Creating...' : 'Create Invoice'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {/* MODAL: RECORD PARTIAL OR FULL PAYMENT */}
      {paymentTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Record Payment · {paymentTarget.invoice_number}
              </h2>
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-[#091221]">
              <span className="text-slate-600 dark:text-slate-400">Remaining Receivable</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatMinorCurrency(
                  Math.max(0, paymentTarget.total_minor - paymentTarget.paid_minor),
                  paymentTarget.currency_code
                )}
              </span>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Payment Amount ({paymentTarget.currency_code})
                  </label>
                  <input
                    type="text"
                    value={payAmountMajor}
                    onChange={(e) => setPayAmountMajor(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Receiving Account</label>
                <select
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Wire / SWIFT">Wire / SWIFT</option>
                    <option value="ACH">ACH</option>
                    <option value="Card">Corporate Card</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Reference Code</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="TXN-94821"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Income Ledger Category
                </label>
                <select
                  value={payCategoryId}
                  onChange={(e) => setPayCategoryId(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                >
                  {categories
                    .filter((c) => c.flow_type === 'income')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-2.5 text-[11px] text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Recording payment reduces Outstanding Receivables and posts Actual Received Revenue to the ledger.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentTarget(null)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!payAccountId || !payAmountMajor.trim() || recordPaymentMutation.isPending}
                  onClick={() => recordPaymentMutation.mutate()}
                  className="h-9 rounded-md bg-emerald-700 px-4 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {recordPaymentMutation.isPending ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

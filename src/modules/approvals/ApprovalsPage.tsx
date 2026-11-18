import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import type { ApprovalRequestRecord, ApprovalRequestType, ApprovalStatus } from '../../types/erp';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type QueueScope = 'pending' | 'assigned_to_me' | 'my_requests' | 'resolved';

const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  expense: 'Financial Expense',
  budget: 'Budget Allocation',
  proposal: 'Commercial Proposal',
  leave: 'Leave Request',
  sensitive_access: 'Sensitive Access',
  company_decision: 'Company Decision',
};

const APPROVAL_TONES: Record<ApprovalStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  pending: 'warning',
  approved: 'nominal',
  rejected: 'critical',
  cancelled: 'neutral',
};

const createRequestSchema = z.object({
  request_type: z.enum(['expense', 'budget', 'proposal', 'leave', 'sensitive_access', 'company_decision']),
  title: z.string().min(3, 'Enter a concise request title.'),
  summary: z.string().min(5, 'Provide context for the approver.'),
  assigned_approver_id: z.string().optional(),
});

type CreateRequestForm = z.infer<typeof createRequestSchema>;

export function ApprovalsPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [scope, setScope] = useState<QueueScope>('pending');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('request'));
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [resolutionComment, setResolutionComment] = useState('');
  const [threadComment, setThreadComment] = useState('');
  const [reassignApproverId, setReassignApproverId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const pReq = searchParams.get('request');
    if (pReq) setSelectedId(pReq);
  }, [searchParams]);

  const canResolve = hasPermission('approvals.resolve');

  const requestsQuery = useQuery({
    queryKey: ['approval_requests', companyId],
    queryFn: () => erpRepository.listApprovalRequests(companyId!),
    enabled: Boolean(companyId),
  });

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const historyQuery = useQuery({
    queryKey: ['approval_history', companyId, selectedId],
    queryFn: () => erpRepository.listApprovalHistory(companyId!, selectedId!),
    enabled: Boolean(companyId && selectedId),
  });

  const requests = requestsQuery.data ?? [];
  const teamMembers = teamQuery.data ?? [];
  const history = historyQuery.data ?? [];

  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);

  const approverCandidates = useMemo(
    () =>
      teamMembers.filter(
        (m) =>
          m.roles.some((r) => ['ceo', 'finance_manager', 'cbo', 'cto', 'administrator'].includes(r.slug))
      ),
    [teamMembers]
  );

  const counts = useMemo(() => {
    const uid = currentUser?.id;
    return {
      pending: requests.filter((r) => r.status === 'pending').length,
      assignedToMe: requests.filter((r) => r.status === 'pending' && r.assigned_approver_id === uid).length,
      myRequests: requests.filter((r) => r.requester_id === uid).length,
      resolved: requests.filter((r) => r.status !== 'pending').length,
    };
  }, [requests, currentUser?.id]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const uid = currentUser?.id;
    return requests.filter((r) => {
      if (scope === 'pending' && r.status !== 'pending') return false;
      if (scope === 'assigned_to_me' && (r.status !== 'pending' || r.assigned_approver_id !== uid)) return false;
      if (scope === 'my_requests' && r.requester_id !== uid) return false;
      if (scope === 'resolved' && r.status === 'pending') return false;
      if (typeFilter !== 'all' && r.request_type !== typeFilter) return false;
      if (q) {
        const requesterName = memberMap.get(r.requester_id)?.full_name.toLowerCase() ?? '';
        if (
          !r.title.toLowerCase().includes(q) &&
          !(r.summary ?? '').toLowerCase().includes(q) &&
          !requesterName.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [requests, scope, typeFilter, searchTerm, currentUser?.id, memberMap]);

  const selectedRequest: ApprovalRequestRecord | null = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? filteredRequests[0] ?? null,
    [requests, selectedId, filteredRequests]
  );

  useEffect(() => {
    if (selectedRequest) {
      setReassignApproverId(selectedRequest.assigned_approver_id ?? '');
    }
  }, [selectedRequest]);

  const invalidateApprovals = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['approval_requests'] }),
      queryClient.invalidateQueries({ queryKey: ['approval_history'] }),
      queryClient.invalidateQueries({ queryKey: ['financial_transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  const form = useForm<CreateRequestForm>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: {
      request_type: 'company_decision',
      title: '',
      summary: '',
      assigned_approver_id: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (vals: CreateRequestForm) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.createApprovalRequest(currentUser.id, companyId, {
        request_type: vals.request_type,
        entity_type: vals.request_type,
        title: vals.title,
        summary: vals.summary,
        assigned_approver_id: vals.assigned_approver_id || null,
      });
    },
    onSuccess: async (created) => {
      setActionError(null);
      setNewModalOpen(false);
      form.reset();
      setSelectedId(created.id);
      await invalidateApprovals();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to submit request.'),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      decision,
    }: {
      id: string;
      decision: Extract<ApprovalStatus, 'approved' | 'rejected' | 'cancelled'>;
    }) => {
      if (!currentUser || !companyId) throw new Error('Authenticated session required.');
      return erpRepository.resolveApprovalRequest(currentUser.id, companyId, id, decision, resolutionComment);
    },
    onSuccess: async () => {
      setActionError(null);
      setResolutionComment('');
      await invalidateApprovals();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to resolve approval.'),
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedRequest) throw new Error('No request selected.');
      return erpRepository.addApprovalComment(currentUser.id, companyId, selectedRequest.id, threadComment);
    },
    onSuccess: async () => {
      setActionError(null);
      setThreadComment('');
      await queryClient.invalidateQueries({ queryKey: ['approval_history'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to post comment.'),
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !selectedRequest || !reassignApproverId) {
        throw new Error('Select a new approver.');
      }
      return erpRepository.reassignApprovalRequest(
        currentUser.id,
        companyId,
        selectedRequest.id,
        reassignApproverId
      );
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateApprovals();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to reassign approver.'),
  });

  if (requestsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-[#13233C]" />
        <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
      </div>
    );
  }

  const isRequester = selectedRequest ? selectedRequest.requester_id === currentUser?.id : false;
  const canActOnSelected =
    Boolean(selectedRequest) &&
    selectedRequest?.status === 'pending' &&
    canResolve &&
    !isRequester;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Governance &amp; Controls · Separation of Duties Enforced
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Approvals Queue
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {hasPermission('finance.view') ? (
            <Link
              to="/finance"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
            >
              Open Finance
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Submit Request
          </button>
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#091221]">
          {(
            [
              { id: 'pending', label: `Pending (${counts.pending})` },
              { id: 'assigned_to_me', label: `Assigned to Me (${counts.assignedToMe})` },
              { id: 'my_requests', label: `My Submissions (${counts.myRequests})` },
              { id: 'resolved', label: `History (${counts.resolved})` },
            ] as Array<{ id: QueueScope; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scope === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-[#13233C] dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search title or requester..."
              className="h-8 w-52 rounded-md border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by request type"
            className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
          >
            <option value="all">All Request Types</option>
            {Object.entries(REQUEST_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split View */}
      {filteredRequests.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No approval requests in this view"
          description="Pending expenses, budgets, sensitive access, and governance decisions appear here. Requesters can never self-approve their own submissions."
          action={
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Submit Approval Request
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Request List */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white lg:col-span-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <ul className="divide-y divide-slate-100 dark:divide-[#1E3252]">
              {filteredRequests.map((req) => {
                const requester = memberMap.get(req.requester_id);
                const isSelected = selectedRequest?.id === req.id;
                return (
                  <li key={req.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(req.id)}
                      className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#102038] ${
                        isSelected ? 'bg-slate-50 dark:bg-[#13233C]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{REQUEST_TYPE_LABELS[req.request_type]}</span>
                        <StatusText
                          tone={APPROVAL_TONES[req.status]}
                          label={req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        />
                      </div>
                      <div className="mt-1 font-medium text-sm text-slate-900 dark:text-white">
                        {req.title}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>By {requester?.full_name ?? 'Team Member'}</span>
                        <span className="font-mono">{req.submitted_at.slice(0, 10)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Detail & Resolution Workspace */}
          {selectedRequest ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-[#1E3252]">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{REQUEST_TYPE_LABELS[selectedRequest.request_type]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{selectedRequest.submitted_at.slice(0, 10)}</span>
                  </div>
                  <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {selectedRequest.title}
                  </h2>
                </div>
                <StatusText
                  tone={APPROVAL_TONES[selectedRequest.status]}
                  label={selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                />
              </div>

              {selectedRequest.summary ? (
                <p className="mt-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {selectedRequest.summary}
                </p>
              ) : null}

              <dl className="mt-4 grid grid-cols-1 gap-3 border-y border-slate-100 py-4 text-xs sm:grid-cols-3 dark:border-[#1E3252]">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Requester</dt>
                  <dd className="mt-0.5 font-medium text-slate-900 dark:text-white">
                    {memberMap.get(selectedRequest.requester_id)?.full_name ?? 'Team Member'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Assigned Approver</dt>
                  <dd className="mt-0.5 font-medium text-slate-900 dark:text-white">
                    {selectedRequest.assigned_approver_id
                      ? memberMap.get(selectedRequest.assigned_approver_id)?.full_name ?? 'Assigned'
                      : 'Any authorized approver'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Linked Module</dt>
                  <dd className="mt-0.5">
                    {selectedRequest.entity_type === 'financial_transaction' ||
                    selectedRequest.entity_type === 'budget' ? (
                      <Link
                        to={selectedRequest.entity_type === 'budget' ? '/finance?tab=budgets' : '/finance'}
                        className="font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                      >
                        Inspect in Finance
                      </Link>
                    ) : (
                      <span className="capitalize text-slate-700 dark:text-slate-300">
                        {selectedRequest.entity_type.replace('_', ' ')}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {/* Separation of Duties & Decision Controls */}
              {selectedRequest.status === 'pending' ? (
                <div className="mt-5 space-y-4">
                  {isRequester ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>
                          <strong>Separation of duties:</strong> You submitted this request, so another authorized approver must approve or reject it.
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={resolveMutation.isPending}
                        onClick={() => resolveMutation.mutate({ id: selectedRequest.id, decision: 'cancelled' })}
                        className="rounded border border-amber-300 bg-white px-3 py-1 font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-[#0C1729] dark:text-amber-200"
                      >
                        Withdraw Request
                      </button>
                    </div>
                  ) : canActOnSelected ? (
                    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/70 p-4 dark:border-[#1E3252] dark:bg-[#091221]">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        Resolution Decision
                      </div>
                      <textarea
                        rows={2}
                        value={resolutionComment}
                        onChange={(e) => setResolutionComment(e.target.value)}
                        placeholder="Optional approval note or mandatory rejection rationale..."
                        className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={reassignApproverId}
                            onChange={(e) => setReassignApproverId(e.target.value)}
                            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                          >
                            <option value="">Reassign approver...</option>
                            {approverCandidates
                              .filter((m) => m.id !== selectedRequest.requester_id)
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.full_name}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={!reassignApproverId || reassignMutation.isPending}
                            onClick={() => reassignMutation.mutate()}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Reassign
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={resolveMutation.isPending}
                            onClick={() =>
                              resolveMutation.mutate({ id: selectedRequest.id, decision: 'rejected' })
                            }
                            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-[#0C1729] dark:text-red-400"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={resolveMutation.isPending}
                            onClick={() =>
                              resolveMutation.mutate({ id: selectedRequest.id, decision: 'approved' })
                            }
                            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-4 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                      Read-only view: resolving requests requires the <span className="font-mono">approvals.resolve</span> permission.
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-300">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>
                    Resolved as <strong className="capitalize">{selectedRequest.status}</strong>
                    {selectedRequest.resolved_by
                      ? ` by ${memberMap.get(selectedRequest.resolved_by)?.full_name ?? 'Approver'}`
                      : ''}
                    {selectedRequest.resolved_at
                      ? ` on ${new Date(selectedRequest.resolved_at).toLocaleString()}`
                      : ''}
                    .
                  </span>
                </div>
              )}

              {/* Approval Audit History */}
              <div className="mt-6 border-t border-slate-100 pt-5 dark:border-[#1E3252]">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                  Approval Audit Trail ({history.length})
                </h3>
                <ul className="mt-3 space-y-2.5 text-xs">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-b-0 dark:border-[#1E3252]"
                    >
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {memberMap.get(item.actor_id)?.full_name ?? 'System'}
                        </span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">{item.action}</span>
                        {item.comment ? (
                          <p className="mt-0.5 text-slate-600 dark:text-slate-300">{item.comment}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={threadComment}
                    onChange={(e) => setThreadComment(e.target.value)}
                    placeholder="Add review note to approval audit trail..."
                    className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={!threadComment.trim() || commentMutation.isPending}
                    onClick={() => commentMutation.mutate()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-[#1E3252] dark:bg-[#13233C] dark:text-slate-200"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Post Note
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* MODAL: SUBMIT APPROVAL REQUEST */}
      {newModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Submit Governance / Approval Request
              </h2>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={form.handleSubmit((vals) => createMutation.mutate(vals))}
              className="mt-4 space-y-3 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Request Category</label>
                <select
                  {...form.register('request_type')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                >
                  {Object.entries(REQUEST_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Request Title</label>
                <input
                  type="text"
                  placeholder="Production database access elevation or vendor contract waiver"
                  {...form.register('title')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                />
                {form.formState.errors.title ? (
                  <p className="mt-1 text-red-600">{form.formState.errors.title.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Justification &amp; Context
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain scope, cost impact, or operational rationale..."
                  {...form.register('summary')}
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                />
                {form.formState.errors.summary ? (
                  <p className="mt-1 text-red-600">{form.formState.errors.summary.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Assigned Approver (Optional)
                </label>
                <select
                  {...form.register('assigned_approver_id')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-white"
                >
                  <option value="">Any authorized approver</option>
                  {approverCandidates
                    .filter((m) => m.id !== currentUser?.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} ({m.roles.map((r) => r.name).join(', ')})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600"
                >
                  {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

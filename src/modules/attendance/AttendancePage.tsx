import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  Plus,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import type { AttendanceStatus, LeaveStatus, LeaveType } from '../../types/erp';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type ActiveTab = 'personal' | 'roster' | 'approvals' | 'holidays';

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present (Office)',
  remote: 'Remote',
  half_day: 'Half Day',
  absent: 'Absent',
  holiday: 'Company Holiday',
  on_leave: 'On Approved Leave',
};

const ATTENDANCE_TONES: Record<AttendanceStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  present: 'nominal',
  remote: 'nominal',
  half_day: 'warning',
  absent: 'critical',
  holiday: 'neutral',
  on_leave: 'neutral',
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual Leave',
  sick: 'Sick / Medical',
  casual: 'Casual Leave',
  parental: 'Parental Leave',
  unpaid: 'Unpaid Leave',
};

const LEAVE_TONES: Record<LeaveStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  pending: 'warning',
  approved: 'nominal',
  rejected: 'critical',
  cancelled: 'neutral',
};

const COMPANY_HOLIDAYS = [
  { date: '2026-01-01', name: 'New Year’s Day', scope: 'All Business Units' },
  { date: '2026-01-26', name: 'Republic / Foundation Day', scope: 'Headquarters & Remote' },
  { date: '2026-05-01', name: 'International Workers’ Day', scope: 'All Business Units' },
  { date: '2026-08-15', name: 'Annual Company Day', scope: 'All Business Units' },
  { date: '2026-10-02', name: 'Autumn Observance Day', scope: 'Headquarters' },
  { date: '2026-12-25', name: 'Year-End Winter Holiday', scope: 'All Business Units' },
];

const leaveRequestSchema = z.object({
  leave_type: z.enum(['annual', 'sick', 'casual', 'parental', 'unpaid']),
  start_date: z.string().min(10, 'Select start date.'),
  end_date: z.string().min(10, 'Select end date.'),
  reason: z.string().min(3, 'Provide a brief reason for your leave request.'),
  assigned_approver_id: z.string().optional(),
});

type LeaveRequestForm = z.infer<typeof leaveRequestSchema>;

const adminAttendanceSchema = z.object({
  profile_id: z.string().min(1, 'Select a team member.'),
  work_date: z.string().min(10, 'Select date.'),
  status: z.enum(['present', 'remote', 'half_day', 'absent', 'holiday', 'on_leave']),
  notes: z.string().optional(),
});

type AdminAttendanceForm = z.infer<typeof adminAttendanceSchema>;

export function AttendancePage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const canManage = hasPermission('attendance.manage');
  const todayIso = new Date().toISOString().slice(0, 10);

  const initialTab =
    searchParams.get('tab') === 'approvals' && canManage
      ? 'approvals'
      : searchParams.get('tab') === 'roster' && canManage
        ? 'roster'
        : 'personal';

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [checkInMode, setCheckInMode] = useState<'present' | 'remote' | 'half_day'>('present');
  const [checkInNotes, setCheckInNotes] = useState('');
  const [rosterDateFilter, setRosterDateFilter] = useState(todayIso);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [adminAttModalOpen, setAdminAttModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    const pTab = searchParams.get('tab');
    if (pTab === 'approvals' && canManage) setActiveTab('approvals');
    else if (pTab === 'roster' && canManage) setActiveTab('roster');
  }, [searchParams, canManage]);

  const companyQuery = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => erpRepository.getCompany(companyId!),
    enabled: Boolean(companyId),
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance_records', companyId, canManage ? 'all' : currentUser?.id],
    queryFn: () =>
      erpRepository.listAttendanceRecords(companyId!, canManage ? undefined : currentUser?.id),
    enabled: Boolean(companyId && currentUser),
  });

  const leaveQuery = useQuery({
    queryKey: ['leave_requests', companyId, canManage ? 'all' : currentUser?.id],
    queryFn: () =>
      erpRepository.listLeaveRequests(companyId!, canManage ? undefined : currentUser?.id),
    enabled: Boolean(companyId && currentUser),
  });

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const attendanceRecords = attendanceQuery.data ?? [];
  const leaveRequests = leaveQuery.data ?? [];
  const teamMembers = teamQuery.data ?? [];
  const company = companyQuery.data;

  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);

  const myTodayRecord = useMemo(
    () => attendanceRecords.find((r) => r.profile_id === currentUser?.id && r.work_date === todayIso) ?? null,
    [attendanceRecords, currentUser?.id, todayIso]
  );

  const myAttendance = useMemo(
    () => attendanceRecords.filter((r) => r.profile_id === currentUser?.id),
    [attendanceRecords, currentUser?.id]
  );

  const myLeaveRequests = useMemo(
    () => leaveRequests.filter((l) => l.profile_id === currentUser?.id),
    [leaveRequests, currentUser?.id]
  );

  const pendingLeaveQueue = useMemo(
    () => leaveRequests.filter((l) => l.status === 'pending'),
    [leaveRequests]
  );

  const rosterRecords = useMemo(
    () =>
      attendanceRecords.filter((r) => (!rosterDateFilter ? true : r.work_date === rosterDateFilter)),
    [attendanceRecords, rosterDateFilter]
  );

  const reviewerCandidates = useMemo(
    () =>
      teamMembers.filter(
        (m) =>
          m.id !== currentUser?.id &&
          m.roles.some((r) => ['ceo', 'administrator', 'cto', 'cpo', 'cbo', 'finance_manager'].includes(r.slug))
      ),
    [teamMembers, currentUser?.id]
  );

  const leaveForm = useForm<LeaveRequestForm>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      leave_type: 'annual',
      start_date: todayIso,
      end_date: todayIso,
      reason: '',
      assigned_approver_id: '',
    },
  });

  const adminAttForm = useForm<AdminAttendanceForm>({
    resolver: zodResolver(adminAttendanceSchema),
    defaultValues: {
      profile_id: '',
      work_date: todayIso,
      status: 'present',
      notes: '',
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.checkInAttendance(currentUser.id, companyId, {
        work_date: todayIso,
        status: checkInMode,
        notes: checkInNotes || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setActionFeedback('Checked in for today.');
      setCheckInNotes('');
      await queryClient.invalidateQueries({ queryKey: ['attendance_records'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Check-in failed.'),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.checkOutAttendance(currentUser.id, companyId, attendanceId);
    },
    onSuccess: async () => {
      setActionError(null);
      setActionFeedback('Checked out for today.');
      await queryClient.invalidateQueries({ queryKey: ['attendance_records'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Check-out failed.'),
  });

  const createLeaveMutation = useMutation({
    mutationFn: async (vals: LeaveRequestForm) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.createLeaveRequest(currentUser.id, companyId, {
        leave_type: vals.leave_type,
        start_date: vals.start_date,
        end_date: vals.end_date,
        reason: vals.reason,
        assigned_approver_id: vals.assigned_approver_id || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setLeaveModalOpen(false);
      leaveForm.reset({
        leave_type: 'annual',
        start_date: todayIso,
        end_date: todayIso,
        reason: '',
        assigned_approver_id: '',
      });
      setActionFeedback('Leave request submitted and queued in Approvals.');
      await queryClient.invalidateQueries({ queryKey: ['leave_requests'] });
      await queryClient.invalidateQueries({ queryKey: ['approval_requests'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to submit leave request.'),
  });

  const reviewLeaveMutation = useMutation({
    mutationFn: async ({
      leaveId,
      decision,
    }: {
      leaveId: string;
      decision: Extract<LeaveStatus, 'approved' | 'rejected' | 'cancelled'>;
    }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.reviewLeaveRequest(currentUser.id, companyId, leaveId, decision);
    },
    onSuccess: async (_, vars) => {
      setActionError(null);
      setActionFeedback(`Leave request ${vars.decision}.`);
      await queryClient.invalidateQueries({ queryKey: ['leave_requests'] });
      await queryClient.invalidateQueries({ queryKey: ['approval_requests'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update leave request.'),
  });

  const adminRecordMutation = useMutation({
    mutationFn: async (vals: AdminAttendanceForm) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.recordAttendanceAdmin(currentUser.id, companyId, {
        profile_id: vals.profile_id,
        work_date: vals.work_date,
        status: vals.status,
        notes: vals.notes || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setAdminAttModalOpen(false);
      adminAttForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['attendance_records'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to record attendance.'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            People Operations · Daily Check-In Policy:{' '}
            {company?.attendance_checkin_required ? 'Required' : 'Optional'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Attendance &amp; Leave
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                adminAttForm.reset({
                  profile_id: teamMembers[0]?.id ?? '',
                  work_date: todayIso,
                  status: 'present',
                  notes: '',
                });
                setAdminAttModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
            >
              <Users className="h-3.5 w-3.5" />
              Record Team Attendance
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setLeaveModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Request Leave
          </button>
        </div>
      </div>

      {actionError ? (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-4 font-medium underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {actionFeedback ? (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{actionFeedback}</span>
          <button type="button" onClick={() => setActionFeedback(null)} className="ml-4 font-medium underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Today's Check-In / Check-Out Panel */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Today’s Attendance ({todayIso})
              </h2>
            </div>
            {myTodayRecord ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <StatusText
                  tone={ATTENDANCE_TONES[myTodayRecord.status]}
                  label={ATTENDANCE_LABELS[myTodayRecord.status]}
                />
                {myTodayRecord.check_in_at ? (
                  <span className="font-mono tabular-nums">
                    In: {new Date(myTodayRecord.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
                {myTodayRecord.check_out_at ? (
                  <span className="font-mono tabular-nums">
                    Out: {new Date(myTodayRecord.check_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
                {myTodayRecord.notes ? <span className="text-slate-500">· {myTodayRecord.notes}</span> : null}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                You have not checked in yet today. Select your work mode and record check-in.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!myTodayRecord ? (
              <>
                <select
                  value={checkInMode}
                  onChange={(e) => setCheckInMode(e.target.value as 'present' | 'remote' | 'half_day')}
                  aria-label="Work mode"
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                >
                  <option value="present">Present (Office)</option>
                  <option value="remote">Remote</option>
                  <option value="half_day">Half Day</option>
                </select>
                <input
                  type="text"
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="Optional note..."
                  className="h-9 w-44 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={checkInMutation.isPending}
                  onClick={() => checkInMutation.mutate()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {checkInMutation.isPending ? 'Checking In...' : 'Check In'}
                </button>
              </>
            ) : !myTodayRecord.check_out_at ? (
              <button
                type="button"
                disabled={checkOutMutation.isPending}
                onClick={() => checkOutMutation.mutate(myTodayRecord.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100 dark:hover:bg-[#13233C]"
              >
                <LogOut className="h-3.5 w-3.5" />
                {checkOutMutation.isPending ? 'Checking Out...' : 'Check Out'}
              </button>
            ) : (
              <StatusText tone="nominal" label="Shift Completed" />
            )}
          </div>
        </div>
      </section>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="text-xs text-slate-500 dark:text-slate-400">My Logged Days</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {myAttendance.length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="text-xs text-slate-500 dark:text-slate-400">My Leave Requests</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {myLeaveRequests.length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="text-xs text-slate-500 dark:text-slate-400">My Pending Leave</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {myLeaveRequests.filter((l) => l.status === 'pending').length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {canManage ? 'Team Pending Leave Queue' : 'Upcoming Holidays'}
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {canManage ? pendingLeaveQueue.length : COMPANY_HOLIDAYS.filter((h) => h.date >= todayIso).length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-[#1E3252]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('personal');
            setSearchParams({});
          }}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'personal'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          My Attendance &amp; Leave
        </button>
        {canManage ? (
          <>
            <button
              type="button"
              onClick={() => {
                setActiveTab('roster');
                setSearchParams({ tab: 'roster' });
              }}
              className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'roster'
                  ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Team Attendance Roster
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('approvals');
                setSearchParams({ tab: 'approvals' });
              }}
              className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'approvals'
                  ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Leave Approvals ({pendingLeaveQueue.length})
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setActiveTab('holidays');
            setSearchParams({});
          }}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'holidays'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Holiday Calendar
        </button>
      </div>

      {activeTab === 'personal' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* My Attendance Log */}
          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                My Attendance History
              </h3>
            </div>
            {myAttendance.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No personal attendance entries logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Check In</th>
                      <th className="px-4 py-2.5 font-medium">Check Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                    {myAttendance.map((rec) => (
                      <tr key={rec.id}>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-900 dark:text-white">
                          {rec.work_date}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusText
                            tone={ATTENDANCE_TONES[rec.status]}
                            label={ATTENDANCE_LABELS[rec.status]}
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {rec.check_in_at
                            ? new Date(rec.check_in_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {rec.check_out_at
                            ? new Date(rec.check_out_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* My Leave Requests */}
          <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                My Leave Requests
              </h3>
            </div>
            {myLeaveRequests.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                You have not submitted any leave requests.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {myLeaveRequests.map((lr) => (
                  <div key={lr.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {LEAVE_TYPE_LABELS[lr.leave_type]}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {lr.start_date} → {lr.end_date}
                      </div>
                      {lr.reason ? (
                        <div className="mt-1 text-slate-600 dark:text-slate-300">{lr.reason}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusText tone={LEAVE_TONES[lr.status]} label={lr.status} />
                      {lr.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() =>
                            reviewLeaveMutation.mutate({ leaveId: lr.id, decision: 'cancelled' })
                          }
                          className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : activeTab === 'roster' && canManage ? (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Team Attendance Roster
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="roster-date" className="text-slate-500 dark:text-slate-400">
                Work Date
              </label>
              <input
                id="roster-date"
                type="date"
                value={rosterDateFilter}
                onChange={(e) => setRosterDateFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
              />
              {rosterDateFilter ? (
                <button
                  type="button"
                  onClick={() => setRosterDateFilter('')}
                  className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                >
                  Show All Dates
                </button>
              ) : null}
            </div>
          </div>

          {rosterRecords.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No attendance entries for selected date"
              description="Entries appear as team members check in or when managers record attendance."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                    <th className="px-5 py-3 font-medium">Team Member</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Check In</th>
                    <th className="px-5 py-3 font-medium">Check Out</th>
                    <th className="px-5 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {rosterRecords.map((rec) => {
                    const member = memberMap.get(rec.profile_id);
                    return (
                      <tr key={rec.id}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {member?.full_name ?? 'Member'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {member?.job_title ?? ''}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {rec.work_date}
                        </td>
                        <td className="px-5 py-3">
                          <StatusText
                            tone={ATTENDANCE_TONES[rec.status]}
                            label={ATTENDANCE_LABELS[rec.status]}
                          />
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {rec.check_in_at
                            ? new Date(rec.check_in_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {rec.check_out_at
                            ? new Date(rec.check_out_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {rec.notes ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : activeTab === 'approvals' && canManage ? (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Leave Approval Queue
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Separation of duties: reviewers cannot approve or reject their own leave requests.
            </p>
          </div>
          {leaveRequests.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No leave requests submitted"
              description="Team leave requests will appear here for review."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1E3252]">
              {leaveRequests.map((lr) => {
                const requester = memberMap.get(lr.profile_id);
                const isSelf = lr.profile_id === currentUser?.id;
                return (
                  <div
                    key={lr.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 text-xs"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {requester?.full_name ?? 'Team Member'}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          · {LEAVE_TYPE_LABELS[lr.leave_type]}
                        </span>
                        <StatusText tone={LEAVE_TONES[lr.status]} label={lr.status} />
                      </div>
                      <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {lr.start_date} → {lr.end_date}
                      </div>
                      {lr.reason ? (
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{lr.reason}</p>
                      ) : null}
                    </div>

                    {lr.status === 'pending' ? (
                      isSelf ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Self-approval blocked
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={reviewLeaveMutation.isPending}
                            onClick={() =>
                              reviewLeaveMutation.mutate({ leaveId: lr.id, decision: 'approved' })
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={reviewLeaveMutation.isPending}
                            onClick={() =>
                              reviewLeaveMutation.mutate({ leaveId: lr.id, decision: 'rejected' })
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      )
                    ) : lr.reviewed_by ? (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Reviewed by {memberMap.get(lr.reviewed_by)?.full_name ?? 'Reviewer'}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* Holiday Calendar Tab */
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-[#1E3252]">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Company Holiday Calendar (2026)
              </h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Holiday</th>
                  <th className="px-5 py-3 font-medium">Applicability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {COMPANY_HOLIDAYS.map((h) => (
                  <tr key={h.date}>
                    <td className="px-5 py-3 font-mono tabular-nums text-slate-900 dark:text-white">
                      {h.date}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {h.name}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{h.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Request Leave Modal */}
      {leaveModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Submit Leave Request
              </h2>
              <button
                type="button"
                onClick={() => setLeaveModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={leaveForm.handleSubmit((vals) => createLeaveMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Leave Type
                </label>
                <select
                  {...leaveForm.register('leave_type')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                >
                  {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((lt) => (
                    <option key={lt} value={lt}>
                      {LEAVE_TYPE_LABELS[lt]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Start Date
                  </label>
                  <input
                    type="date"
                    {...leaveForm.register('start_date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    End Date
                  </label>
                  <input
                    type="date"
                    {...leaveForm.register('end_date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Assigned Reviewer (Optional)
                </label>
                <select
                  {...leaveForm.register('assigned_approver_id')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                >
                  <option value="">Any authorized reviewer</option>
                  {reviewerCandidates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.job_title})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Reason / Handover Notes
                </label>
                <textarea
                  rows={3}
                  {...leaveForm.register('reason')}
                  placeholder="Provide dates context or coverage notes..."
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                {leaveForm.formState.errors.reason ? (
                  <p className="mt-1 text-red-600">{leaveForm.formState.errors.reason.message}</p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLeaveMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {createLeaveMutation.isPending ? 'Submitting...' : 'Submit Leave Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Admin Record Team Attendance Modal */}
      {adminAttModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Record Team Attendance
              </h2>
              <button
                type="button"
                onClick={() => setAdminAttModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={adminAttForm.handleSubmit((vals) => adminRecordMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Team Member
                </label>
                <select
                  {...adminAttForm.register('profile_id')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                >
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.employee_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Work Date
                  </label>
                  <input
                    type="date"
                    {...adminAttForm.register('work_date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Status
                  </label>
                  <select
                    {...adminAttForm.register('status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    {(Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {ATTENDANCE_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Notes (Optional)
                </label>
                <input
                  {...adminAttForm.register('notes')}
                  placeholder="Holiday, approved medical leave, or shift adjustment..."
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setAdminAttModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminRecordMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {adminRecordMutation.isPending ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

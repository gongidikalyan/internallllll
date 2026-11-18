import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, Calendar, CheckSquare, Clock, FolderKanban, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import type { AvailabilityStatus } from '../../types/erp';
import { StatusText } from '../../components/ui/StatusText';
import { getLocalTodayIso } from '../../lib/date';

const AVAILABILITY_OPTIONS: Array<{ value: AvailabilityStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'focused', label: 'Focused Work' },
  { value: 'in_meeting', label: 'In Meeting' },
  { value: 'away', label: 'Away' },
  { value: 'offline', label: 'Offline' },
];

export function WorkspacePage() {
  const { profile, companyId, roles, permissions, minRoleTier, refreshSessionProfile } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ['tasks', companyId],
    queryFn: () => erpRepository.listTasks(companyId!),
    enabled: Boolean(companyId),
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', companyId, profile?.id],
    queryFn: () => erpRepository.listNotifications(companyId!, profile!.id),
    enabled: Boolean(companyId && profile?.id),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const projectMembersQuery = useQuery({
    queryKey: ['project_members', companyId],
    queryFn: () => erpRepository.listProjectMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const meetingsQuery = useQuery({
    queryKey: ['meetings', companyId],
    queryFn: () => erpRepository.listMeetings(companyId!),
    enabled: Boolean(companyId),
  });

  const meetingParticipantsQuery = useQuery({
    queryKey: ['meeting_participants', companyId],
    queryFn: () => erpRepository.listMeetingParticipants(companyId!),
    enabled: Boolean(companyId),
  });

  const myLeaveQuery = useQuery({
    queryKey: ['leave_requests', companyId, profile?.id],
    queryFn: () => erpRepository.listLeaveRequests(companyId!, profile!.id),
    enabled: Boolean(companyId && profile?.id),
  });

  const myAttendanceQuery = useQuery({
    queryKey: ['attendance_records', companyId, profile?.id],
    queryFn: () => erpRepository.listAttendanceRecords(companyId!, profile!.id),
    enabled: Boolean(companyId && profile?.id),
  });

  const availabilityMutation = useMutation({
    mutationFn: async (nextAvailability: AvailabilityStatus) => {
      if (!profile || !companyId) throw new Error('No active profile.');
      return erpRepository.updateTeamMember(profile.id, companyId, {
        id: profile.id,
        full_name: profile.full_name,
        job_title: profile.job_title,
        department_id: profile.department_id,
        primary_business_unit_id: profile.primary_business_unit_id,
        manager_id: profile.manager_id,
        employment_type: profile.employment_type,
        status: profile.status,
        availability: nextAvailability,
        phone: profile.phone,
        location: profile.location,
      });
    },
    onSuccess: async () => {
      await refreshSessionProfile();
      await queryClient.invalidateQueries({ queryKey: ['team_members'] });
      setFeedback('Availability status updated.');
      setTimeout(() => setFeedback(null), 2500);
    },
  });

  const myTasks = useMemo(
    () =>
      (tasksQuery.data ?? []).filter(
        (t) =>
          (t.assigned_to === profile?.id || t.created_by === profile?.id) &&
          t.status !== 'completed' &&
          t.status !== 'cancelled'
      ),
    [tasksQuery.data, profile?.id]
  );

  const myDeadlines = useMemo(
    () =>
      myTasks
        .filter((t) => t.due_date !== null)
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
        .slice(0, 5),
    [myTasks]
  );

  const myNotifications = (notificationsQuery.data ?? []).slice(0, 5);

  const myProjects = useMemo(() => {
    if (!profile) return [];
    const memberProjectIds = new Set(
      (projectMembersQuery.data ?? [])
        .filter((pm) => pm.profile_id === profile.id)
        .map((pm) => pm.project_id)
    );
    return (projectsQuery.data ?? []).filter(
      (p) =>
        p.owner_id === profile.id ||
        p.project_manager_id === profile.id ||
        memberProjectIds.has(p.id)
    );
  }, [projectsQuery.data, projectMembersQuery.data, profile]);

  const myMeetings = useMemo(() => {
    if (!profile) return [];
    const invitedMeetingIds = new Set(
      (meetingParticipantsQuery.data ?? [])
        .filter((mp) => mp.profile_id === profile.id)
        .map((mp) => mp.meeting_id)
    );
    const nowIso = new Date().toISOString();
    return (meetingsQuery.data ?? [])
      .filter(
        (m) =>
          (m.organizer_id === profile.id || invitedMeetingIds.has(m.id)) &&
          m.status !== 'cancelled' &&
          m.scheduled_end >= nowIso
      )
      .slice(0, 5);
  }, [meetingsQuery.data, meetingParticipantsQuery.data, profile]);

  const myLeaveRequests = useMemo(() => (myLeaveQuery.data ?? []).slice(0, 5), [myLeaveQuery.data]);
  const todayIso = getLocalTodayIso();
  const myTodayAttendance = useMemo(
    () => (myAttendanceQuery.data ?? []).find((a) => a.work_date === todayIso) ?? null,
    [myAttendanceQuery.data, todayIso]
  );

  if (!profile) return null;

  const sortedPermissions = Array.from(permissions).sort();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Personal Dashboard · {profile.employee_code}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            My Workspace
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="my-availability" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Availability
          </label>
          <select
            id="my-availability"
            value={profile.availability}
            onChange={(e) => availabilityMutation.mutate(e.target.value as AvailabilityStatus)}
            disabled={availabilityMutation.isPending}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
          >
            {AVAILABILITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback}
        </div>
      ) : null}

      {/* Live My Tasks, My Deadlines & My Notifications */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                My Active Tasks ({myTasks.length})
              </h2>
            </div>
            <Link to="/tasks?scope=my" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
              Open Tasks
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No active tasks assigned to you.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
              {myTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="py-2.5">
                  <Link to={`/tasks?task=${t.id}`} className="block hover:underline">
                    <div className="text-xs font-medium text-slate-900 dark:text-white">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {t.status.replace('_', ' ')} · {t.priority}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                My Deadlines ({myDeadlines.length})
              </h2>
            </div>
            <Link to="/tasks?scope=overdue" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
              Overdue
            </Link>
          </div>
          {myDeadlines.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No scheduled task due dates.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
              {myDeadlines.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-xs">
                  <Link to={`/tasks?task=${t.id}`} className="truncate font-medium text-slate-900 hover:underline dark:text-white">
                    {t.title}
                  </Link>
                  <span className="ml-2 shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {t.due_date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                My Notifications
              </h2>
            </div>
            <Link to="/notifications" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
              View All
            </Link>
          </div>
          {myNotifications.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No notifications yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
              {myNotifications.map((n) => (
                <li key={n.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 dark:text-white">{n.title}</span>
                    <span className="font-mono text-[10px] text-slate-400">{n.is_read ? 'Read' : 'Unread'}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Identity & Role Assignment Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729] lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Profile & Authority Scope
          </h2>
          <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Full Name</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{profile.full_name}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Title</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{profile.job_title}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Work Email</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">{profile.email}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Account Status</dt>
              <dd>
                <StatusText
                  tone={profile.status === 'active' ? 'nominal' : 'warning'}
                  label={profile.status.replace('_', ' ')}
                />
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Assigned Roles</dt>
              <dd className="text-right font-medium text-[#0B3B66] dark:text-sky-400">
                {roles.map((r) => r.name).join(' · ') || 'None'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Highest Role Tier</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">Tier {minRoleTier}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Effective Permissions ({sortedPermissions.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Evaluated from RBAC bindings
            </span>
          </div>

          {sortedPermissions.length === 0 ? (
            <p className="py-6 text-xs text-slate-500 dark:text-slate-400">
              No permissions are bound to your assigned role(s). Contact an Administrator.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {sortedPermissions.map((code) => (
                <div
                  key={code}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-300"
                >
                  {code}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Live My Projects, My Meetings & My Leave / Attendance */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  My Projects ({myProjects.length})
                </h3>
              </div>
              <Link to="/projects" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                Open Projects
              </Link>
            </div>
            {myProjects.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No projects assigned to you yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
                {myProjects.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-xs">
                    <Link to={`/projects?project=${p.id}`} className="truncate font-medium text-slate-900 hover:underline dark:text-white">
                      {p.code} · {p.name}
                    </Link>
                    <span className="ml-2 shrink-0 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                      {p.progress_pct}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  My Upcoming Meetings ({myMeetings.length})
                </h3>
              </div>
              <Link to="/meetings" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                Open Meetings
              </Link>
            </div>
            {myMeetings.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No upcoming meetings scheduled for you.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-[#1E3252]">
                {myMeetings.map((mtg) => (
                  <li key={mtg.id} className="py-2.5 text-xs">
                    <Link to={`/meetings?meeting=${mtg.id}`} className="block font-medium text-slate-900 hover:underline dark:text-white">
                      {mtg.title}
                    </Link>
                    <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {new Date(mtg.scheduled_start).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Attendance &amp; Leave
                </h3>
              </div>
              <Link to="/attendance" className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                Check In / Request
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-[#1E3252] dark:bg-[#091221]">
              <span className="text-slate-600 dark:text-slate-300">Today ({todayIso})</span>
              <StatusText
                tone={myTodayAttendance ? 'nominal' : 'neutral'}
                label={myTodayAttendance ? myTodayAttendance.status.replace('_', ' ') : 'Not checked in'}
              />
            </div>
            {myLeaveRequests.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                No recent leave requests.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-[#1E3252]">
                {myLeaveRequests.map((lr) => (
                  <li key={lr.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <span className="font-medium capitalize text-slate-900 dark:text-white">
                        {lr.leave_type}
                      </span>
                      <span className="ml-2 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {lr.start_date}
                      </span>
                    </div>
                    <StatusText
                      tone={lr.status === 'approved' ? 'nominal' : lr.status === 'rejected' ? 'critical' : lr.status === 'pending' ? 'warning' : 'neutral'}
                      label={lr.status}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

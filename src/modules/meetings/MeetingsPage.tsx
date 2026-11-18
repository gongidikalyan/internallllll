import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  MapPin,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import type {
  DecisionActionStatus,
  DecisionStatus,
  MeetingStatus,
  MeetingType,
  RsvpStatus,
} from '../../types/erp';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type ActiveTab = 'meetings' | 'decisions';
type TimeFilter = 'upcoming' | 'past' | 'all';

const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  executive: 'Executive',
  operational: 'Operational',
  product: 'Product',
  client: 'Client',
  all_hands: 'All Hands',
};

const MEETING_STATUS_TONES: Record<MeetingStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  scheduled: 'neutral',
  in_progress: 'warning',
  completed: 'nominal',
  cancelled: 'critical',
};

const DECISION_STATUS_TONES: Record<DecisionStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  proposed: 'warning',
  approved: 'nominal',
  superseded: 'neutral',
  revoked: 'critical',
};

const ACTION_STATUS_TONES: Record<DecisionActionStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  open: 'warning',
  in_progress: 'neutral',
  completed: 'nominal',
  cancelled: 'critical',
};

const createMeetingSchema = z.object({
  title: z.string().min(3, 'Enter a meeting title.'),
  meeting_type: z.enum(['executive', 'operational', 'product', 'client', 'all_hands']),
  date: z.string().min(10, 'Select a date.'),
  start_time: z.string().min(4, 'Select start time.'),
  end_time: z.string().min(4, 'Select end time.'),
  business_unit_id: z.string().optional(),
  project_id: z.string().optional(),
  location_or_link: z.string().optional(),
  agenda: z.string().optional(),
});

type CreateMeetingForm = z.infer<typeof createMeetingSchema>;

const createDecisionSchema = z.object({
  title: z.string().min(3, 'Enter a decision title.'),
  meeting_id: z.string().optional(),
  business_unit_id: z.string().optional(),
  context: z.string().min(5, 'Document the decision context.'),
  outcome: z.string().min(5, 'Document the approved outcome or resolution.'),
  status: z.enum(['proposed', 'approved']),
});

type CreateDecisionForm = z.infer<typeof createDecisionSchema>;

export function MeetingsPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'decisions' ? 'decisions' : 'meetings';
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('upcoming');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(searchParams.get('meeting'));

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [inviteProfileId, setInviteProfileId] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [actionDraftByDecision, setActionDraftByDecision] = useState<
    Record<string, { title: string; ownerId: string; dueDate: string }>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const pMeeting = searchParams.get('meeting');
    const pTab = searchParams.get('tab');
    if (pMeeting) {
      setSelectedMeetingId(pMeeting);
      setActiveTab('meetings');
    } else if (pTab === 'decisions') {
      setActiveTab('decisions');
    }
  }, [searchParams]);

  const canManage = hasPermission('meetings.manage');

  const meetingsQuery = useQuery({
    queryKey: ['meetings', companyId],
    queryFn: () => erpRepository.listMeetings(companyId!),
    enabled: Boolean(companyId),
  });

  const participantsQuery = useQuery({
    queryKey: ['meeting_participants', companyId],
    queryFn: () => erpRepository.listMeetingParticipants(companyId!),
    enabled: Boolean(companyId),
  });

  const notesQuery = useQuery({
    queryKey: ['meeting_notes', companyId, selectedMeetingId],
    queryFn: () => erpRepository.listMeetingNotes(companyId!, selectedMeetingId!),
    enabled: Boolean(companyId && selectedMeetingId),
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

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const buQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const meetings = meetingsQuery.data ?? [];
  const allParticipants = participantsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const decisions = decisionsQuery.data ?? [];
  const decisionActions = decisionActionsQuery.data ?? [];
  const teamMembers = teamQuery.data ?? [];
  const businessUnits = buQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);
  const buMap = useMemo(() => new Map(businessUnits.map((b) => [b.id, b])), [businessUnits]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const meetingMap = useMemo(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);

  const nowIso = new Date().toISOString();

  const filteredMeetings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return meetings.filter((m) => {
      if (timeFilter === 'upcoming' && (m.scheduled_end < nowIso || m.status === 'cancelled' || m.status === 'completed')) {
        return false;
      }
      if (timeFilter === 'past' && m.scheduled_end >= nowIso && m.status !== 'completed' && m.status !== 'cancelled') {
        return false;
      }
      if (typeFilter !== 'all' && m.meeting_type !== typeFilter) return false;
      if (q && !m.title.toLowerCase().includes(q) && !(m.agenda ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [meetings, timeFilter, typeFilter, searchTerm, nowIso]);

  const selectedMeeting = useMemo(() => {
    if (selectedMeetingId) {
      const found = meetings.find((m) => m.id === selectedMeetingId);
      if (found) return found;
    }
    return filteredMeetings[0] ?? meetings[0] ?? null;
  }, [meetings, filteredMeetings, selectedMeetingId]);

  const selectedParticipants = useMemo(
    () => (selectedMeeting ? allParticipants.filter((p) => p.meeting_id === selectedMeeting.id) : []),
    [allParticipants, selectedMeeting]
  );

  const selectedMeetingDecisions = useMemo(
    () => (selectedMeeting ? decisions.filter((d) => d.meeting_id === selectedMeeting.id) : []),
    [decisions, selectedMeeting]
  );

  const myParticipantRecord = useMemo(
    () => selectedParticipants.find((p) => p.profile_id === currentUser?.id) ?? null,
    [selectedParticipants, currentUser?.id]
  );

  const kpis = useMemo(() => {
    const upcoming = meetings.filter(
      (m) => m.status === 'scheduled' && m.scheduled_start >= nowIso
    ).length;
    const completed = meetings.filter((m) => m.status === 'completed').length;
    const approvedDecisions = decisions.filter((d) => d.status === 'approved').length;
    const openActions = decisionActions.filter(
      (a) => a.status === 'open' || a.status === 'in_progress'
    ).length;
    return { upcoming, completed, approvedDecisions, openActions };
  }, [meetings, decisions, decisionActions, nowIso]);

  const meetingForm = useForm<CreateMeetingForm>({
    resolver: zodResolver(createMeetingSchema),
    defaultValues: {
      title: '',
      meeting_type: 'operational',
      date: new Date().toISOString().slice(0, 10),
      start_time: '10:00',
      end_time: '11:00',
      business_unit_id: '',
      project_id: '',
      location_or_link: '',
      agenda: '',
    },
  });

  const decisionForm = useForm<CreateDecisionForm>({
    resolver: zodResolver(createDecisionSchema),
    defaultValues: {
      title: '',
      meeting_id: '',
      business_unit_id: '',
      context: '',
      outcome: '',
      status: 'approved',
    },
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (vals: CreateMeetingForm) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      const startIso = new Date(`${vals.date}T${vals.start_time}:00`).toISOString();
      const endIso = new Date(`${vals.date}T${vals.end_time}:00`).toISOString();
      return erpRepository.createMeeting(currentUser.id, companyId, {
        title: vals.title,
        meeting_type: vals.meeting_type,
        scheduled_start: startIso,
        scheduled_end: endIso,
        business_unit_id: vals.business_unit_id || null,
        project_id: vals.project_id || null,
        location_or_link: vals.location_or_link || null,
        agenda: vals.agenda || null,
        participant_ids: selectedParticipantIds,
      });
    },
    onSuccess: async (created) => {
      setActionError(null);
      setScheduleModalOpen(false);
      setSelectedParticipantIds([]);
      meetingForm.reset();
      setSelectedMeetingId(created.id);
      setTimeFilter('all');
      await queryClient.invalidateQueries({ queryKey: ['meetings'] });
      await queryClient.invalidateQueries({ queryKey: ['meeting_participants'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to schedule meeting.'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ meetingId, status }: { meetingId: string; status: MeetingStatus }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.updateMeetingStatus(currentUser.id, companyId, meetingId, status);
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['meetings'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update status.'),
  });

  const rsvpMutation = useMutation({
    mutationFn: async ({
      meetingId,
      profileId,
      rsvpStatus,
      attended,
    }: {
      meetingId: string;
      profileId: string;
      rsvpStatus: RsvpStatus;
      attended?: boolean | null;
    }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.updateRsvpStatus(currentUser.id, companyId, meetingId, profileId, rsvpStatus, attended);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meeting_participants'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update RSVP.'),
  });

  const addParticipantMutation = useMutation({
    mutationFn: async ({ meetingId, profileId }: { meetingId: string; profileId: string }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.upsertMeetingParticipant(currentUser.id, companyId, meetingId, profileId);
    },
    onSuccess: async () => {
      setInviteProfileId('');
      await queryClient.invalidateQueries({ queryKey: ['meeting_participants'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to add participant.'),
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ meetingId, content }: { meetingId: string; content: string }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.addMeetingNote(currentUser.id, companyId, meetingId, content);
    },
    onSuccess: async () => {
      setNoteInput('');
      await queryClient.invalidateQueries({ queryKey: ['meeting_notes'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to save note.'),
  });

  const createDecisionMutation = useMutation({
    mutationFn: async (vals: CreateDecisionForm) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.createDecision(currentUser.id, companyId, {
        title: vals.title,
        meeting_id: vals.meeting_id || null,
        business_unit_id: vals.business_unit_id || null,
        context: vals.context,
        outcome: vals.outcome,
        status: vals.status,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setDecisionModalOpen(false);
      decisionForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to record decision.'),
  });

  const updateDecisionStatusMutation = useMutation({
    mutationFn: async ({ decisionId, status }: { decisionId: string; status: DecisionStatus }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.updateDecisionStatus(currentUser.id, companyId, decisionId, status);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update decision.'),
  });

  const createActionMutation = useMutation({
    mutationFn: async ({
      decisionId,
      title,
      ownerId,
      dueDate,
    }: {
      decisionId: string;
      title: string;
      ownerId: string;
      dueDate: string;
    }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.createDecisionAction(currentUser.id, companyId, {
        decision_id: decisionId,
        title,
        owner_id: ownerId,
        due_date: dueDate || null,
      });
    },
    onSuccess: async (_, vars) => {
      setActionDraftByDecision((prev) => {
        const next = { ...prev };
        delete next[vars.decisionId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['decision_actions'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to add action item.'),
  });

  const updateActionStatusMutation = useMutation({
    mutationFn: async ({ actionId, status }: { actionId: string; status: DecisionActionStatus }) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      return erpRepository.updateDecisionActionStatus(currentUser.id, companyId, actionId, status);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['decision_actions'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update action item.'),
  });

  const openDecisionModalForMeeting = (meetingId?: string) => {
    decisionForm.reset({
      title: '',
      meeting_id: meetingId ?? '',
      business_unit_id: selectedMeeting?.business_unit_id ?? '',
      context: '',
      outcome: '',
      status: 'approved',
    });
    setDecisionModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Governance &amp; Coordination · Schedules, Notes &amp; Decisions
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Meetings &amp; Decisions
          </h1>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openDecisionModalForMeeting()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Record Decision
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantIds(currentUser ? [currentUser.id] : []);
                setScheduleModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Schedule Meeting
            </button>
          </div>
        ) : null}
      </div>

      {actionError ? (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-4 font-medium underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Upcoming Scheduled</span>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {kpis.upcoming}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Completed Sessions</span>
            <CheckCircle2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {kpis.completed}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Approved Decisions</span>
            <ClipboardList className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {kpis.approvedDecisions}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Open Action Items</span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {kpis.openActions}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-[#1E3252]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('meetings');
            setSearchParams({});
          }}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'meetings'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Schedule &amp; Meeting Workspace ({meetings.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('decisions');
            setSearchParams({ tab: 'decisions' });
          }}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'decisions'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Decision Register &amp; Action Items ({decisions.length})
        </button>
      </div>

      {activeTab === 'meetings' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Rail: Meeting List */}
          <div className="space-y-4 lg:col-span-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search meetings or agendas..."
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
                />
              </div>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
              >
                <option value="upcoming">Upcoming</option>
                <option value="past">Past / Closed</option>
                <option value="all">All Meetings</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
              >
                <option value="all">All Types</option>
                {(Object.keys(MEETING_TYPE_LABELS) as MeetingType[]).map((mt) => (
                  <option key={mt} value={mt}>
                    {MEETING_TYPE_LABELS[mt]}
                  </option>
                ))}
              </select>
            </div>

            {filteredMeetings.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No meetings match this view"
                description={
                  timeFilter === 'upcoming'
                    ? 'Switch to "All Meetings" or schedule a new executive, product, or operational session.'
                    : 'No recorded meetings match the active filters.'
                }
              />
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-[#1E3252] dark:border-[#1E3252] dark:bg-[#0C1729]">
                {filteredMeetings.map((mtg) => {
                  const isSelected = selectedMeeting?.id === mtg.id;
                  const participantCount = allParticipants.filter((p) => p.meeting_id === mtg.id).length;
                  return (
                    <button
                      key={mtg.id}
                      type="button"
                      onClick={() => setSelectedMeetingId(mtg.id)}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-sky-50/70 dark:bg-[#102542]'
                          : 'hover:bg-slate-50 dark:hover:bg-[#102038]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {mtg.title}
                        </span>
                        <StatusText
                          tone={MEETING_STATUS_TONES[mtg.status]}
                          label={mtg.status.replace('_', ' ')}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        <span>{new Date(mtg.scheduled_start).toLocaleString()}</span>
                        <span>·</span>
                        <span className="font-sans">{MEETING_TYPE_LABELS[mtg.meeting_type]}</span>
                        <span>·</span>
                        <span className="font-sans">{participantCount} invited</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Pane: Selected Meeting Workspace */}
          <div className="lg:col-span-7">
            {!selectedMeeting ? (
              <EmptyState
                icon={FileText}
                title="Select a meeting"
                description="Choose a meeting from the schedule to review its agenda, RSVP, record notes, or log official decisions."
              />
            ) : (
              <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-[#1E3252]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-[#0B3B66] dark:text-sky-400">
                        {MEETING_TYPE_LABELS[selectedMeeting.meeting_type]}
                      </span>
                      {selectedMeeting.business_unit_id ? (
                        <span>· {buMap.get(selectedMeeting.business_unit_id)?.name ?? 'Unit'}</span>
                      ) : null}
                      {selectedMeeting.project_id ? (
                        <span>· {projectMap.get(selectedMeeting.project_id)?.name ?? 'Project'}</span>
                      ) : null}
                    </div>
                    <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                      {selectedMeeting.title}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-mono tabular-nums">
                        {new Date(selectedMeeting.scheduled_start).toLocaleString()} →{' '}
                        {new Date(selectedMeeting.scheduled_end).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {selectedMeeting.location_or_link ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {selectedMeeting.location_or_link}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Organizer: {memberMap.get(selectedMeeting.organizer_id)?.full_name ?? 'Organizer'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canManage ? (
                      <select
                        value={selectedMeeting.status}
                        onChange={(e) =>
                          updateStatusMutation.mutate({
                            meetingId: selectedMeeting.id,
                            status: e.target.value as MeetingStatus,
                          })
                        }
                        aria-label="Meeting status"
                        className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <StatusText
                        tone={MEETING_STATUS_TONES[selectedMeeting.status]}
                        label={selectedMeeting.status.replace('_', ' ')}
                      />
                    )}
                  </div>
                </div>

                {/* Agenda */}
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Agenda
                  </h3>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {selectedMeeting.agenda || 'No formal agenda notes provided.'}
                  </p>
                </div>

                {/* My RSVP & Participants */}
                <div className="border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      <Users className="h-3.5 w-3.5" />
                      Participants ({selectedParticipants.length})
                    </h3>
                    {currentUser ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">My RSVP:</span>
                        {(['accepted', 'tentative', 'declined'] as RsvpStatus[]).map((rsvp) => {
                          const active = myParticipantRecord?.rsvp_status === rsvp;
                          return (
                            <button
                              key={rsvp}
                              type="button"
                              onClick={() =>
                                rsvpMutation.mutate({
                                  meetingId: selectedMeeting.id,
                                  profileId: currentUser.id,
                                  rsvpStatus: rsvp,
                                })
                              }
                              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium capitalize ${
                                active
                                  ? 'border-[#0B3B66] bg-[#0B3B66] text-white dark:border-sky-500 dark:bg-sky-600'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]'
                              }`}
                            >
                              {rsvp}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-[#1E3252] dark:border-[#1E3252]">
                    {selectedParticipants.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        No participants invited yet.
                      </div>
                    ) : (
                      selectedParticipants.map((p) => {
                        const member = memberMap.get(p.profile_id);
                        return (
                          <div
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                          >
                            <div>
                              <span className="font-medium text-slate-900 dark:text-white">
                                {member?.full_name ?? 'Team Member'}
                              </span>
                              <span className="ml-2 text-slate-500 dark:text-slate-400">
                                {member?.job_title ?? ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <StatusText
                                tone={
                                  p.rsvp_status === 'accepted'
                                    ? 'nominal'
                                    : p.rsvp_status === 'declined'
                                      ? 'critical'
                                      : p.rsvp_status === 'tentative'
                                        ? 'warning'
                                        : 'neutral'
                                }
                                label={`RSVP: ${p.rsvp_status}`}
                              />
                              {canManage ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    rsvpMutation.mutate({
                                      meetingId: selectedMeeting.id,
                                      profileId: p.profile_id,
                                      rsvpStatus: p.rsvp_status,
                                      attended: p.attended === true ? false : true,
                                    })
                                  }
                                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                                >
                                  {p.attended === true ? 'Attended' : 'Mark Attended'}
                                </button>
                              ) : p.attended !== null ? (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {p.attended ? 'Attended' : 'Absent'}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {canManage ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <select
                        value={inviteProfileId}
                        onChange={(e) => setInviteProfileId(e.target.value)}
                        className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                      >
                        <option value="">Add participant to meeting...</option>
                        {teamMembers
                          .filter((m) => !selectedParticipants.some((p) => p.profile_id === m.id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name} ({m.job_title})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={!inviteProfileId || addParticipantMutation.isPending}
                        onClick={() =>
                          addParticipantMutation.mutate({
                            meetingId: selectedMeeting.id,
                            profileId: inviteProfileId,
                          })
                        }
                        className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
                      >
                        Invite
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Meeting Notes */}
                <div className="border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Meeting Notes &amp; Minutes ({notes.length})
                  </h3>
                  <div className="mt-2.5 flex gap-2">
                    <textarea
                      rows={2}
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Record discussion summary, blockers, or key points..."
                      className="flex-1 rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={!noteInput.trim() || addNoteMutation.isPending}
                      onClick={() =>
                        addNoteMutation.mutate({
                          meetingId: selectedMeeting.id,
                          content: noteInput,
                        })
                      }
                      className="h-9 self-end rounded-md bg-[#0B3B66] px-3.5 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                    >
                      Save Note
                    </button>
                  </div>

                  {notes.length > 0 ? (
                    <ul className="mt-3 space-y-2.5">
                      {notes.map((n) => (
                        <li
                          key={n.id}
                          className="rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-[#1E3252] dark:bg-[#091221]"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {memberMap.get(n.author_id)?.full_name ?? 'Member'}
                            </span>
                            <span className="font-mono tabular-nums">
                              {new Date(n.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-300">{n.content}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Linked Decisions */}
                <div className="border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      Decisions Logged from Session ({selectedMeetingDecisions.length})
                    </h3>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => openDecisionModalForMeeting(selectedMeeting.id)}
                        className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                      >
                        + Log Decision
                      </button>
                    ) : null}
                  </div>
                  {selectedMeetingDecisions.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No official decisions linked to this meeting yet.
                    </p>
                  ) : (
                    <ul className="mt-2.5 space-y-2">
                      {selectedMeetingDecisions.map((dec) => (
                        <li
                          key={dec.id}
                          className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-[#1E3252]"
                        >
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{dec.title}</div>
                            <div className="mt-0.5 text-slate-500 dark:text-slate-400">{dec.outcome}</div>
                          </div>
                          <StatusText tone={DECISION_STATUS_TONES[dec.status]} label={dec.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab 2: Decision Register & Action Items */
        <div className="space-y-4">
          {decisions.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No company decisions recorded yet"
              description="Record strategic, architectural, or operational decisions alongside context, outcomes, and assigned follow-up actions."
            />
          ) : (
            <div className="space-y-4">
              {decisions.map((dec) => {
                const actions = decisionActions.filter((a) => a.decision_id === dec.id);
                const draft = actionDraftByDecision[dec.id] ?? {
                  title: '',
                  ownerId: currentUser?.id ?? '',
                  dueDate: '',
                };
                return (
                  <section
                    key={dec.id}
                    className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <StatusText tone={DECISION_STATUS_TONES[dec.status]} label={dec.status.toUpperCase()} />
                          {dec.business_unit_id ? (
                            <span>· {buMap.get(dec.business_unit_id)?.name ?? 'Business Unit'}</span>
                          ) : null}
                          {dec.meeting_id && meetingMap.get(dec.meeting_id) ? (
                            <span>· From "{meetingMap.get(dec.meeting_id)?.title}"</span>
                          ) : null}
                          {dec.decided_at ? (
                            <span className="font-mono tabular-nums">
                              · Decided {dec.decided_at.slice(0, 10)}
                              {dec.decided_by ? ` by ${memberMap.get(dec.decided_by)?.full_name ?? 'Leader'}` : ''}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-white">
                          {dec.title}
                        </h3>
                      </div>

                      {canManage ? (
                        <select
                          value={dec.status}
                          onChange={(e) =>
                            updateDecisionStatusMutation.mutate({
                              decisionId: dec.id,
                              status: e.target.value as DecisionStatus,
                            })
                          }
                          aria-label={`Status for ${dec.title}`}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                        >
                          <option value="proposed">Proposed</option>
                          <option value="approved">Approved</option>
                          <option value="superseded">Superseded</option>
                          <option value="revoked">Revoked</option>
                        </select>
                      ) : null}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
                      <div>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Context</span>
                        <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-300">{dec.context}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Outcome</span>
                        <p className="mt-1 whitespace-pre-line text-slate-900 dark:text-slate-100">{dec.outcome}</p>
                      </div>
                    </div>

                    {/* Decision Action Items */}
                    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-[#1E3252]">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Action Items ({actions.length})
                      </div>
                      {actions.length > 0 ? (
                        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-[#1E3252] dark:border-[#1E3252]">
                          {actions.map((act) => (
                            <li
                              key={act.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                            >
                              <div>
                                <span className="font-medium text-slate-900 dark:text-white">{act.title}</span>
                                <span className="ml-2 text-slate-500 dark:text-slate-400">
                                  Owner: {memberMap.get(act.owner_id)?.full_name ?? 'Assignee'}
                                </span>
                                {act.due_date ? (
                                  <span className="ml-2 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                                    · Due {act.due_date}
                                  </span>
                                ) : null}
                              </div>
                              {canManage ? (
                                <select
                                  value={act.status}
                                  onChange={(e) =>
                                    updateActionStatusMutation.mutate({
                                      actionId: act.id,
                                      status: e.target.value as DecisionActionStatus,
                                    })
                                  }
                                  className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                                >
                                  <option value="open">Open</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              ) : (
                                <StatusText
                                  tone={ACTION_STATUS_TONES[act.status]}
                                  label={act.status.replace('_', ' ')}
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {canManage ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(e) =>
                              setActionDraftByDecision((prev) => ({
                                ...prev,
                                [dec.id]: { ...draft, title: e.target.value },
                              }))
                            }
                            placeholder="Add follow-up action item..."
                            className="h-8 min-w-[200px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                          />
                          <select
                            value={draft.ownerId}
                            onChange={(e) =>
                              setActionDraftByDecision((prev) => ({
                                ...prev,
                                [dec.id]: { ...draft, ownerId: e.target.value },
                              }))
                            }
                            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                          >
                            {teamMembers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={draft.dueDate}
                            onChange={(e) =>
                              setActionDraftByDecision((prev) => ({
                                ...prev,
                                [dec.id]: { ...draft, dueDate: e.target.value },
                              }))
                            }
                            className="h-8 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={!draft.title.trim() || !draft.ownerId || createActionMutation.isPending}
                            onClick={() =>
                              createActionMutation.mutate({
                                decisionId: dec.id,
                                title: draft.title,
                                ownerId: draft.ownerId,
                                dueDate: draft.dueDate,
                              })
                            }
                            className="h-8 rounded-md bg-[#0B3B66] px-3 text-xs font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                          >
                            Add Action
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {scheduleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Schedule Meeting
              </h2>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={meetingForm.handleSubmit((vals) => createMeetingMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Meeting Title
                </label>
                <input
                  {...meetingForm.register('title')}
                  placeholder="Weekly Product & Architecture Review"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                {meetingForm.formState.errors.title ? (
                  <p className="mt-1 text-red-600">{meetingForm.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Type</label>
                  <select
                    {...meetingForm.register('meeting_type')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    {(Object.keys(MEETING_TYPE_LABELS) as MeetingType[]).map((mt) => (
                      <option key={mt} value={mt}>
                        {MEETING_TYPE_LABELS[mt]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Date</label>
                  <input
                    type="date"
                    {...meetingForm.register('date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Start</label>
                    <input
                      type="time"
                      {...meetingForm.register('start_time')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">End</label>
                    <input
                      type="time"
                      {...meetingForm.register('end_time')}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Business Unit (Optional)
                  </label>
                  <select
                    {...meetingForm.register('business_unit_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
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
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Project (Optional)
                  </label>
                  <select
                    {...meetingForm.register('project_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
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
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Location or Video Link
                </label>
                <input
                  {...meetingForm.register('location_or_link')}
                  placeholder="HQ Boardroom A or video conference URL"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Agenda</label>
                <textarea
                  rows={3}
                  {...meetingForm.register('agenda')}
                  placeholder="Key topics, review items, and required decisions..."
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">
                  Invite Participants ({selectedParticipantIds.length} selected)
                </label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-[#1E3252]">
                  {teamMembers.map((m) => {
                    const checked = selectedParticipantIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-[#13233C]"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedParticipantIds((prev) =>
                                e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                              );
                            }}
                          />
                          <span className="text-slate-800 dark:text-slate-200">{m.full_name}</span>
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{m.job_title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMeetingMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {createMeetingMutation.isPending ? 'Scheduling...' : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Record Decision Modal */}
      {decisionModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Record Official Decision
              </h2>
              <button
                type="button"
                onClick={() => setDecisionModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={decisionForm.handleSubmit((vals) => createDecisionMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Decision Title
                </label>
                <input
                  {...decisionForm.register('title')}
                  placeholder="Adopt quarterly release cadence for WrindhaOS"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                {decisionForm.formState.errors.title ? (
                  <p className="mt-1 text-red-600">{decisionForm.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Linked Meeting
                  </label>
                  <select
                    {...decisionForm.register('meeting_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="">Standalone Decision</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Business Unit
                  </label>
                  <select
                    {...decisionForm.register('business_unit_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
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
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    {...decisionForm.register('status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="approved">Approved</option>
                    <option value="proposed">Proposed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Context</label>
                <textarea
                  rows={2}
                  {...decisionForm.register('context')}
                  placeholder="Background, constraints, and alternatives considered..."
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                {decisionForm.formState.errors.context ? (
                  <p className="mt-1 text-red-600">{decisionForm.formState.errors.context.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Outcome &amp; Resolution
                </label>
                <textarea
                  rows={2}
                  {...decisionForm.register('outcome')}
                  placeholder="Final resolution and operational impact..."
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                {decisionForm.formState.errors.outcome ? (
                  <p className="mt-1 text-red-600">{decisionForm.formState.errors.outcome.message}</p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setDecisionModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDecisionMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {createDecisionMutation.isPending ? 'Saving...' : 'Record Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

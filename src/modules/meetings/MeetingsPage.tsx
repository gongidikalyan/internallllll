import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getLocalTodayIso, isValidIsoDate, normalizeDateIso } from '../../lib/date';
import { erpRepository } from '../../services/erpRepository';
import type {
  DecisionActionRecord,
  DecisionActionStatus,
  DecisionRecord,
  DecisionStatus,
  MeetingRecord,
  MeetingStatus,
  MeetingType,
  RsvpStatus,
} from '../../types/erp';
import { ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type ActiveTab = 'meetings' | 'calendar' | 'decisions';
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

const requiredDateField = z.string().refine((val) => isValidIsoDate(val), {
  message: 'Select a valid date (YYYY-MM-DD).',
});

const optionalDateField = z
  .string()
  .optional()
  .refine((val) => !val || isValidIsoDate(val), {
    message: 'Enter a valid date (YYYY-MM-DD).',
  });

const meetingBaseFields = {
  title: z.string().min(3, 'Enter a meeting title.'),
  meeting_type: z.enum(['executive', 'operational', 'product', 'client', 'all_hands']),
  date: requiredDateField,
  start_time: z.string().min(4, 'Select start time.'),
  end_time: z.string().min(4, 'Select end time.'),
  business_unit_id: z.string().optional(),
  project_id: z.string().optional(),
  location_or_link: z.string().optional(),
  agenda: z.string().optional(),
};

const createMeetingSchema = z
  .object(meetingBaseFields)
  .refine((vals) => vals.end_time > vals.start_time, {
    message: 'End time must be after start time.',
    path: ['end_time'],
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

const editMeetingSchema = z
  .object({
    ...meetingBaseFields,
    status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  })
  .refine((vals) => vals.end_time > vals.start_time, {
    message: 'End time must be after start time.',
    path: ['end_time'],
  });

type EditMeetingForm = z.infer<typeof editMeetingSchema>;

const editDecisionSchema = z.object({
  title: z.string().min(3, 'Enter a decision title.'),
  meeting_id: z.string().optional(),
  business_unit_id: z.string().optional(),
  context: z.string().min(5, 'Document the decision context.'),
  outcome: z.string().min(5, 'Document the approved outcome or resolution.'),
  status: z.enum(['proposed', 'approved', 'superseded', 'revoked']),
});

type EditDecisionForm = z.infer<typeof editDecisionSchema>;

const editActionSchema = z.object({
  title: z.string().min(2, 'Enter an action title.'),
  owner_id: z.string().min(1, 'Select an owner.'),
  due_date: optionalDateField,
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
});

type EditActionForm = z.infer<typeof editActionSchema>;

export function MeetingsPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab: ActiveTab =
    searchParams.get('tab') === 'decisions'
      ? 'decisions'
      : searchParams.get('tab') === 'calendar'
        ? 'calendar'
        : 'meetings';
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('upcoming');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(searchParams.get('meeting'));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MeetingRecord | null>(null);
  const [editingDecision, setEditingDecision] = useState<DecisionRecord | null>(null);
  const [editingAction, setEditingAction] = useState<DecisionActionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'meeting'; item: MeetingRecord }
    | { kind: 'decision'; item: DecisionRecord }
    | { kind: 'action'; item: DecisionActionRecord }
    | null
  >(null);
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
    } else if (pTab === 'calendar') {
      setActiveTab('calendar');
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

  const todayIso = getLocalTodayIso();

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ dateIso: string | null; dayNumber: number | null }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push({ dateIso: null, dayNumber: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateIso: iso, dayNumber: d });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ dateIso: null, dayNumber: null });
    }
    return cells;
  }, [calendarMonth]);

  const meetingForm = useForm<CreateMeetingForm>({
    resolver: zodResolver(createMeetingSchema),
    defaultValues: {
      title: '',
      meeting_type: 'operational',
      date: todayIso,
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

  const editMeetingForm = useForm<EditMeetingForm>({
    resolver: zodResolver(editMeetingSchema),
    defaultValues: {
      title: '',
      meeting_type: 'operational',
      date: todayIso,
      start_time: '10:00',
      end_time: '11:00',
      business_unit_id: '',
      project_id: '',
      location_or_link: '',
      agenda: '',
      status: 'scheduled',
    },
  });

  const editDecisionForm = useForm<EditDecisionForm>({
    resolver: zodResolver(editDecisionSchema),
    defaultValues: {
      title: '',
      meeting_id: '',
      business_unit_id: '',
      context: '',
      outcome: '',
      status: 'approved',
    },
  });

  const editActionForm = useForm<EditActionForm>({
    resolver: zodResolver(editActionSchema),
    defaultValues: {
      title: '',
      owner_id: currentUser?.id ?? '',
      due_date: '',
      status: 'open',
    },
  });

  const openEditMeetingModal = (mtg: MeetingRecord) => {
    setActionError(null);
    const startDt = new Date(mtg.scheduled_start);
    const endDt = new Date(mtg.scheduled_end);
    const pad = (n: number) => String(n).padStart(2, '0');
    editMeetingForm.reset({
      title: mtg.title,
      meeting_type: mtg.meeting_type,
      date: `${startDt.getFullYear()}-${pad(startDt.getMonth() + 1)}-${pad(startDt.getDate())}`,
      start_time: `${pad(startDt.getHours())}:${pad(startDt.getMinutes())}`,
      end_time: `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`,
      business_unit_id: mtg.business_unit_id ?? '',
      project_id: mtg.project_id ?? '',
      location_or_link: mtg.location_or_link ?? '',
      agenda: mtg.agenda ?? '',
      status: mtg.status,
    });
    setEditingMeeting(mtg);
  };

  const openEditDecisionModal = (dec: DecisionRecord) => {
    setActionError(null);
    editDecisionForm.reset({
      title: dec.title,
      meeting_id: dec.meeting_id ?? '',
      business_unit_id: dec.business_unit_id ?? '',
      context: dec.context,
      outcome: dec.outcome,
      status: dec.status,
    });
    setEditingDecision(dec);
  };

  const openScheduleModal = (prefillDate?: string) => {
    setActionError(null);
    setSelectedParticipantIds(currentUser ? [currentUser.id] : []);
    meetingForm.reset({
      title: '',
      meeting_type: 'operational',
      date: prefillDate ?? getLocalTodayIso(),
      start_time: '10:00',
      end_time: '11:00',
      business_unit_id: '',
      project_id: '',
      location_or_link: '',
      agenda: '',
    });
    setScheduleModalOpen(true);
  };

  const openEditActionModal = (act: DecisionActionRecord) => {
    setActionError(null);
    editActionForm.reset({
      title: act.title,
      owner_id: act.owner_id,
      due_date: normalizeDateIso(act.due_date) ?? '',
      status: act.status,
    });
    setEditingAction(act);
  };

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

  const updateMeetingMutation = useMutation({
    mutationFn: async (vals: EditMeetingForm) => {
      if (!currentUser || !companyId || !editingMeeting) throw new Error('Session unavailable.');
      const startIso = new Date(`${vals.date}T${vals.start_time}:00`).toISOString();
      const endIso = new Date(`${vals.date}T${vals.end_time}:00`).toISOString();
      return erpRepository.updateMeeting(currentUser.id, companyId, {
        id: editingMeeting.id,
        title: vals.title,
        meeting_type: vals.meeting_type,
        scheduled_start: startIso,
        scheduled_end: endIso,
        business_unit_id: vals.business_unit_id || null,
        project_id: vals.project_id || null,
        location_or_link: vals.location_or_link || null,
        agenda: vals.agenda || null,
        status: vals.status,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setEditingMeeting(null);
      await queryClient.invalidateQueries({ queryKey: ['meetings'] });
      await queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update meeting.'),
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      await erpRepository.deleteMeeting(currentUser.id, companyId, meetingId);
    },
    onSuccess: async (_, meetingId) => {
      setDeleteTarget(null);
      if (selectedMeetingId === meetingId) {
        setSelectedMeetingId(null);
        setSearchParams({});
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
        queryClient.invalidateQueries({ queryKey: ['meeting_participants'] }),
        queryClient.invalidateQueries({ queryKey: ['decisions'] }),
        queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
      ]);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete meeting.'),
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

  const updateDecisionMutation = useMutation({
    mutationFn: async (vals: EditDecisionForm) => {
      if (!currentUser || !companyId || !editingDecision) throw new Error('Session unavailable.');
      return erpRepository.updateDecision(currentUser.id, companyId, {
        id: editingDecision.id,
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
      setEditingDecision(null);
      await queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update decision.'),
  });

  const deleteDecisionMutation = useMutation({
    mutationFn: async (decisionId: string) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      await erpRepository.deleteDecision(currentUser.id, companyId, decisionId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['decisions'] }),
        queryClient.invalidateQueries({ queryKey: ['decision_actions'] }),
      ]);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete decision.'),
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
      if (dueDate && !isValidIsoDate(dueDate)) {
        throw new Error('Enter a valid due date (YYYY-MM-DD).');
      }
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

  const updateActionMutation = useMutation({
    mutationFn: async (vals: EditActionForm) => {
      if (!currentUser || !companyId || !editingAction) throw new Error('Session unavailable.');
      return erpRepository.updateDecisionAction(currentUser.id, companyId, {
        id: editingAction.id,
        title: vals.title,
        owner_id: vals.owner_id,
        due_date: vals.due_date || null,
        status: vals.status,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setEditingAction(null);
      await queryClient.invalidateQueries({ queryKey: ['decision_actions'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update action item.'),
  });

  const deleteActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      await erpRepository.deleteDecisionAction(currentUser.id, companyId, actionId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['decision_actions'] });
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete action item.'),
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
              onClick={() => openScheduleModal()}
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
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-[#1E3252]">
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
            setActiveTab('calendar');
            setSearchParams({ tab: 'calendar' });
          }}
          className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'calendar'
              ? 'border-[#0B3B66] text-[#0B3B66] dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Calendar View
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
                    <div
                      key={mtg.id}
                      className={`px-4 py-3.5 transition-colors ${
                        isSelected
                          ? 'bg-sky-50/70 dark:bg-[#102542]'
                          : 'hover:bg-slate-50 dark:hover:bg-[#102038]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedMeetingId(mtg.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {mtg.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                            <span>{new Date(mtg.scheduled_start).toLocaleString()}</span>
                            <span>·</span>
                            <span className="font-sans">{MEETING_TYPE_LABELS[mtg.meeting_type]}</span>
                            <span>·</span>
                            <span className="font-sans">{participantCount} invited</span>
                          </div>
                        </button>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <StatusText
                            tone={MEETING_STATUS_TONES[mtg.status]}
                            label={mtg.status.replace('_', ' ')}
                          />
                          {canManage ? (
                            <div className="flex items-center gap-0.5">
                              {mtg.status !== 'completed' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStatusMutation.mutate({
                                      meetingId: mtg.id,
                                      status: 'completed',
                                    })
                                  }
                                  title="Mark meeting completed"
                                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openEditMeetingModal(mtg)}
                                title="Edit meeting"
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'meeting', item: mtg })}
                                title="Delete meeting"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
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
                      <>
                        {selectedMeeting.status !== 'completed' ? (
                          <button
                            type="button"
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              updateStatusMutation.mutate({
                                meetingId: selectedMeeting.id,
                                status: 'completed',
                              })
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Complete
                          </button>
                        ) : null}
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
                        <button
                          type="button"
                          onClick={() => openEditMeetingModal(selectedMeeting)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ kind: 'meeting', item: selectedMeeting })}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#091221] dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </>
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
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-[#1E3252]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900 dark:text-white">{dec.title}</div>
                            <div className="mt-0.5 text-slate-500 dark:text-slate-400">{dec.outcome}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <StatusText tone={DECISION_STATUS_TONES[dec.status]} label={dec.status} />
                            {canManage ? (
                              <>
                                {dec.status !== 'approved' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDecisionStatusMutation.mutate({
                                        decisionId: dec.id,
                                        status: 'approved',
                                      })
                                    }
                                    title="Approve decision"
                                    className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openEditDecisionModal(dec)}
                                  title="Edit decision"
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: 'decision', item: dec })}
                                  title="Delete decision"
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'calendar' ? (
        /* Tab 2: Monthly Meetings & Action Due-Date Calendar */
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Scheduled meetings &amp; decision action due dates{canManage ? ' · Click + on any day to schedule a meeting' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const [y, m] = todayIso.split('-').map(Number);
                  setCalendarMonth(new Date(y, m - 1, 1));
                }}
                className="inline-flex h-8 items-center rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 dark:border-[#1E3252] dark:hover:bg-[#13233C]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 dark:border-[#1E3252] dark:hover:bg-[#13233C]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 dark:border-[#1E3252] dark:bg-[#1E3252]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold text-slate-600 dark:bg-[#091221] dark:text-slate-400">
                {day}
              </div>
            ))}
            {calendarDays.map((cell, idx) => {
              const dayMeetings = cell.dateIso
                ? meetings.filter((m) => getLocalTodayIso(new Date(m.scheduled_start)) === cell.dateIso)
                : [];
              const dayActions = cell.dateIso
                ? decisionActions.filter((a) => normalizeDateIso(a.due_date) === cell.dateIso)
                : [];
              const isTodayCell = cell.dateIso === todayIso;
              return (
                <div
                  key={idx}
                  className={`group min-h-[104px] p-2 ${
                    cell.dateIso
                      ? isTodayCell
                        ? 'bg-sky-50/60 dark:bg-[#10243E]'
                        : 'bg-white dark:bg-[#0C1729]'
                      : 'bg-slate-50/70 dark:bg-[#091221]'
                  }`}
                >
                  {cell.dayNumber && cell.dateIso ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-mono text-[11px] ${
                            isTodayCell
                              ? 'rounded bg-[#0B3B66] px-1.5 py-0.5 font-semibold text-white dark:bg-sky-600'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => openScheduleModal(cell.dateIso!)}
                            title={`Schedule meeting on ${cell.dateIso}`}
                            aria-label={`Schedule meeting on ${cell.dateIso}`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-slate-400 opacity-70 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800 group-hover:opacity-100 dark:hover:border-[#1E3252] dark:hover:bg-[#13233C] dark:hover:text-white"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {dayMeetings.map((mtg) => (
                          <button
                            key={mtg.id}
                            type="button"
                            onClick={() => {
                              setSelectedMeetingId(mtg.id);
                              setActiveTab('meetings');
                              setSearchParams({ meeting: mtg.id });
                            }}
                            className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium ${
                              mtg.status === 'cancelled'
                                ? 'border-red-200 bg-red-50/70 text-red-700 line-through dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                                : mtg.status === 'completed'
                                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-[#0B3B66] dark:border-[#1E3252] dark:bg-[#13233C] dark:text-slate-200'
                            }`}
                          >
                            {new Date(mtg.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {mtg.title}
                          </button>
                        ))}
                        {dayActions.map((act) => (
                          <button
                            key={`act-${act.id}`}
                            type="button"
                            onClick={() => {
                              setActiveTab('decisions');
                              setSearchParams({ tab: 'decisions' });
                            }}
                            className="block w-full truncate rounded border border-dashed border-amber-300 bg-amber-50/60 px-1.5 py-0.5 text-left text-[11px] text-amber-800 hover:border-amber-500 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
                          >
                            Due: {act.title}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        /* Tab 3: Decision Register & Action Items */
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dec.status !== 'approved' ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateDecisionStatusMutation.mutate({
                                  decisionId: dec.id,
                                  status: 'approved',
                                })
                              }
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </button>
                          ) : null}
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
                          <button
                            type="button"
                            onClick={() => openEditDecisionModal(dec)}
                            title="Edit decision"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ kind: 'decision', item: dec })}
                            title="Delete decision"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#091221] dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
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
                                <div className="flex items-center gap-1.5">
                                  {act.status !== 'completed' ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateActionStatusMutation.mutate({
                                          actionId: act.id,
                                          status: 'completed',
                                        })
                                      }
                                      title="Mark action completed"
                                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
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
                                  <button
                                    type="button"
                                    onClick={() => openEditActionModal(act)}
                                    title="Edit action item"
                                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget({ kind: 'action', item: act })}
                                    title="Delete action item"
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
                  {meetingForm.formState.errors.date ? (
                    <p className="mt-1 text-[11px] text-red-600">{meetingForm.formState.errors.date.message}</p>
                  ) : null}
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
                  {meetingForm.formState.errors.end_time ? (
                    <p className="col-span-2 text-[11px] text-red-600">{meetingForm.formState.errors.end_time.message}</p>
                  ) : null}
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

      {/* Edit Meeting Modal */}
      {editingMeeting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Edit Meeting
              </h2>
              <button
                type="button"
                onClick={() => setEditingMeeting(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={editMeetingForm.handleSubmit((vals) => updateMeetingMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Meeting Title
                </label>
                <input
                  {...editMeetingForm.register('title')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Type</label>
                  <select
                    {...editMeetingForm.register('meeting_type')}
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
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    {...editMeetingForm.register('status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Date</label>
                  <input
                    type="date"
                    {...editMeetingForm.register('date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                  {editMeetingForm.formState.errors.date ? (
                    <p className="mt-1 text-[11px] text-red-600">{editMeetingForm.formState.errors.date.message}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Start</label>
                  <input
                    type="time"
                    {...editMeetingForm.register('start_time')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">End</label>
                  <input
                    type="time"
                    {...editMeetingForm.register('end_time')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                {editMeetingForm.formState.errors.end_time ? (
                  <p className="text-[11px] text-red-600 sm:col-span-3">{editMeetingForm.formState.errors.end_time.message}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Business Unit
                  </label>
                  <select
                    {...editMeetingForm.register('business_unit_id')}
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
                    Project
                  </label>
                  <select
                    {...editMeetingForm.register('project_id')}
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
                  {...editMeetingForm.register('location_or_link')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Agenda</label>
                <textarea
                  rows={3}
                  {...editMeetingForm.register('agenda')}
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setEditingMeeting(null)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMeetingMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {updateMeetingMutation.isPending ? 'Saving...' : 'Save Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Decision Modal */}
      {editingDecision ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Edit Official Decision
              </h2>
              <button
                type="button"
                onClick={() => setEditingDecision(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={editDecisionForm.handleSubmit((vals) => updateDecisionMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Decision Title
                </label>
                <input
                  {...editDecisionForm.register('title')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Linked Meeting
                  </label>
                  <select
                    {...editDecisionForm.register('meeting_id')}
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
                    {...editDecisionForm.register('business_unit_id')}
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
                    {...editDecisionForm.register('status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="proposed">Proposed</option>
                    <option value="approved">Approved</option>
                    <option value="superseded">Superseded</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Context</label>
                <textarea
                  rows={2}
                  {...editDecisionForm.register('context')}
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Outcome &amp; Resolution
                </label>
                <textarea
                  rows={2}
                  {...editDecisionForm.register('outcome')}
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setEditingDecision(null)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateDecisionMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {updateDecisionMutation.isPending ? 'Saving...' : 'Save Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Action Item Modal */}
      {editingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Edit Action Item
              </h2>
              <button
                type="button"
                onClick={() => setEditingAction(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={editActionForm.handleSubmit((vals) => updateActionMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Action Title</label>
                <input
                  {...editActionForm.register('title')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Owner</label>
                <select
                  {...editActionForm.register('owner_id')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                >
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                  <input
                    type="date"
                    {...editActionForm.register('due_date')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                  {editActionForm.formState.errors.due_date ? (
                    <p className="mt-1 text-[11px] text-red-600">{editActionForm.formState.errors.due_date.message}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    {...editActionForm.register('status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setEditingAction(null)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateActionMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {updateActionMutation.isPending ? 'Saving...' : 'Save Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === 'meeting'
            ? 'Delete Meeting'
            : deleteTarget?.kind === 'decision'
              ? 'Delete Decision'
              : 'Delete Action Item'
        }
        description={
          deleteTarget?.kind === 'meeting'
            ? `Permanently delete meeting "${deleteTarget.item.title}" along with its participants and notes?`
            : deleteTarget?.kind === 'decision'
              ? `Permanently delete decision "${deleteTarget.item.title}" and its follow-up action items?`
              : deleteTarget?.kind === 'action'
                ? `Permanently delete action item "${deleteTarget.item.title}"?`
                : ''
        }
        isPending={
          deleteMeetingMutation.isPending ||
          deleteDecisionMutation.isPending ||
          deleteActionMutation.isPending
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === 'meeting') deleteMeetingMutation.mutate(deleteTarget.item.id);
          else if (deleteTarget.kind === 'decision') deleteDecisionMutation.mutate(deleteTarget.item.id);
          else deleteActionMutation.mutate(deleteTarget.item.id);
        }}
      />
    </div>
  );
}

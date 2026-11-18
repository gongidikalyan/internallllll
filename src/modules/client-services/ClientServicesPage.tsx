import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Columns3,
  FileCheck2,
  FileSpreadsheet,
  FolderKanban,
  Handshake,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Table2,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatMinorCurrency } from '../../lib/currency';
import { getLocalTodayIso } from '../../lib/date';
import { erpRepository } from '../../services/erpRepository';
import type {
  ClientRecord,
  ClientStatus,
  CommunicationChannel,
  ContractRecord,
  ContractStatus,
  LeadRecord,
  LeadStage,
  ProposalRecord,
  ProposalStatus,
} from '../../types/erp';
import { ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

type CsTab = 'pipeline' | 'clients' | 'proposals' | 'contracts';
type PipelineViewMode = 'board' | 'table';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

const LEAD_STAGES: Array<{ id: LeadStage; label: string }> = [
  { id: 'new_lead', label: 'New Lead' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'requirement_gathering', label: 'Requirement Gathering' },
  { id: 'proposal_sent', label: 'Proposal Sent' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

const PROPOSAL_STATUS_TONES: Record<ProposalStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  draft: 'neutral',
  pending_tech_review: 'warning',
  pending_commercial_approval: 'warning',
  sent: 'nominal',
  accepted: 'nominal',
  rejected: 'critical',
  expired: 'neutral',
};

const CONTRACT_STATUS_TONES: Record<ContractStatus, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  draft: 'neutral',
  pending_approval: 'warning',
  active: 'nominal',
  completed: 'nominal',
  terminated: 'critical',
};

function majorToMinor(rawMajor: string | undefined, currencyCode: string): number {
  const cleaned = (rawMajor ?? '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 1 : 100;
  return Math.round(parsed * multiplier);
}

function minorToMajorString(minor: number, currencyCode: string): string {
  const divisor = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 1 : 100;
  return divisor === 1 ? String(minor) : (minor / divisor).toFixed(2);
}

const createLeadSchema = z.object({
  organization_name: z.string().min(2, 'Organization name is required.'),
  contact_name: z.string().min(2, 'Primary contact name is required.'),
  contact_email: z.string().optional(),
  contact_phone: z.string().optional(),
  source: z.string().optional(),
  stage: z.enum([
    'new_lead',
    'contacted',
    'qualified',
    'requirement_gathering',
    'proposal_sent',
    'negotiation',
    'won',
    'lost',
  ]),
  estimated_value_major: z.string().optional(),
  currency_code: z.string().min(3).max(3),
  owner_id: z.string().optional(),
  next_follow_up_at: z.string().optional(),
  requirements_summary: z.string().optional(),
});

type CreateLeadForm = z.infer<typeof createLeadSchema>;

const createClientSchema = z.object({
  name: z.string().min(2, 'Client organization name is required.'),
  industry: z.string().optional(),
  website: z.string().optional(),
  billing_address: z.string().optional(),
  account_owner_id: z.string().optional(),
  status: z.enum(['prospect', 'active', 'inactive', 'churned']),
});

type CreateClientForm = z.infer<typeof createClientSchema>;

const createProposalSchema = z.object({
  proposal_number: z.string().min(2, 'Proposal number is required.'),
  title: z.string().min(2, 'Proposal title is required.'),
  lead_id: z.string().optional(),
  client_id: z.string().optional(),
  scope_summary: z.string().min(5, 'Scope summary is required.'),
  estimated_hours: z.string().optional(),
  proposed_amount_major: z.string().min(1, 'Proposed amount is required.'),
  currency_code: z.string().min(3).max(3),
  valid_until: z.string().optional(),
});

type CreateProposalForm = z.infer<typeof createProposalSchema>;

const createContractSchema = z.object({
  contract_number: z.string().min(2, 'Contract number is required.'),
  title: z.string().min(2, 'Contract title is required.'),
  client_id: z.string().min(1, 'Client is required.'),
  proposal_id: z.string().optional(),
  contract_value_major: z.string().min(1, 'Contract value is required.'),
  currency_code: z.string().min(3).max(3),
  start_date: z.string().min(1, 'Start date is required.'),
  end_date: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'active', 'completed', 'terminated']),
});

type CreateContractForm = z.infer<typeof createContractSchema>;

export function ClientServicesPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<CsTab>('pipeline');
  const [pipelineView, setPipelineView] = useState<PipelineViewMode>('board');
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(searchParams.get('lead'));
  const [selectedClientId, setSelectedClientId] = useState<string | null>(searchParams.get('client'));

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [editingProposal, setEditingProposal] = useState<ProposalRecord | null>(null);
  const [editingContract, setEditingContract] = useState<ContractRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'lead'; item: LeadRecord }
    | { kind: 'client'; item: ClientRecord }
    | { kind: 'proposal'; item: ProposalRecord }
    | { kind: 'contract'; item: ContractRecord }
    | null
  >(null);
  const [clientProjectModalClient, setClientProjectModalClient] = useState<ClientRecord | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // Lead Drawer drafts
  const [leadReqDraft, setLeadReqDraft] = useState('');
  const [leadFollowUpDraft, setLeadFollowUpDraft] = useState('');
  const [leadLostReasonDraft, setLeadLostReasonDraft] = useState('');
  const [leadValueDraft, setLeadValueDraft] = useState('');

  // Communication draft (shared for lead drawer / client profile)
  const [commChannel, setCommChannel] = useState<CommunicationChannel>('call');
  const [commSubject, setCommSubject] = useState('');
  const [commSummary, setCommSummary] = useState('');

  // Contact draft on client profile
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Client Project quick creation drafts
  const [cpCode, setCpCode] = useState('');
  const [cpName, setCpName] = useState('');
  const [cpManagerId, setCpManagerId] = useState('');
  const [cpDueDate, setCpDueDate] = useState('');
  const [cpBudgetMajor, setCpBudgetMajor] = useState('0');

  useEffect(() => {
    const pLead = searchParams.get('lead');
    const pClient = searchParams.get('client');
    const pTab = searchParams.get('tab') as CsTab | null;
    if (pLead) {
      setActiveTab('pipeline');
      setSelectedLeadId(pLead);
    }
    if (pClient) {
      setActiveTab('clients');
      setSelectedClientId(pClient);
    }
    if (pTab && ['pipeline', 'clients', 'proposals', 'contracts'].includes(pTab)) {
      setActiveTab(pTab);
    }
  }, [searchParams]);

  const canManagePipeline = hasPermission('client_services.manage');
  const canTechReview = hasPermission('proposals.tech_review');
  const canCommercialApprove = hasPermission('proposals.commercial_approve');
  const canManageProjects = hasPermission('projects.manage');

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

  const teamQuery = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: () => erpRepository.listTeamMembers(companyId!),
    enabled: Boolean(companyId),
  });

  const leadsQuery = useQuery({
    queryKey: ['leads', companyId],
    queryFn: () => erpRepository.listLeads(companyId!),
    enabled: Boolean(companyId),
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', companyId],
    queryFn: () => erpRepository.listClients(companyId!),
    enabled: Boolean(companyId),
  });

  const contactsQuery = useQuery({
    queryKey: ['client_contacts', companyId],
    queryFn: () => erpRepository.listClientContacts(companyId!),
    enabled: Boolean(companyId),
  });

  const communicationsQuery = useQuery({
    queryKey: ['client_communications', companyId],
    queryFn: () => erpRepository.listClientCommunications(companyId!),
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

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const defaultCurrency = companyQuery.data?.default_currency ?? 'INR';
  const businessUnits = businessUnitsQuery.data ?? [];
  const csUnit = businessUnits.find((bu) => bu.unit_type === 'client_services') ?? businessUnits[0];
  const members = teamQuery.data ?? [];
  const leads = leadsQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
  const communications = communicationsQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l.organization_name])), [leads]);

  const selectedLead = useMemo(() => leads.find((l) => l.id === selectedLeadId) ?? null, [leads, selectedLeadId]);
  const selectedClient = useMemo(() => clients.find((c) => c.id === selectedClientId) ?? null, [clients, selectedClientId]);

  useEffect(() => {
    if (selectedLead) {
      setLeadReqDraft(selectedLead.requirements_summary ?? '');
      setLeadFollowUpDraft(selectedLead.next_follow_up_at ? selectedLead.next_follow_up_at.slice(0, 16) : '');
      setLeadLostReasonDraft(selectedLead.lost_reason ?? '');
      setLeadValueDraft(minorToMajorString(selectedLead.estimated_value_minor, selectedLead.currency_code));
    }
  }, [selectedLead]);

  const followUpReminders = useMemo(() => {
    const horizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return leads
      .filter((l) => l.next_follow_up_at && l.stage !== 'won' && l.stage !== 'lost' && l.next_follow_up_at <= horizon)
      .sort((a, b) => (a.next_follow_up_at ?? '').localeCompare(b.next_follow_up_at ?? ''));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
      if (q) {
        const hay = `${l.organization_name} ${l.contact_name} ${l.contact_email ?? ''} ${l.source ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, searchTerm, stageFilter]);

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return clients.filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.industry ?? ''} ${c.website ?? ''}`.toLowerCase().includes(q);
    });
  }, [clients, searchTerm]);

  const leadForm = useForm<CreateLeadForm>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      organization_name: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      source: '',
      stage: 'new_lead',
      estimated_value_major: '0',
      currency_code: defaultCurrency,
      owner_id: currentUser?.id ?? '',
      next_follow_up_at: '',
      requirements_summary: '',
    },
  });

  const clientForm = useForm<CreateClientForm>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      industry: '',
      website: '',
      billing_address: '',
      account_owner_id: currentUser?.id ?? '',
      status: 'active',
    },
  });

  const proposalForm = useForm<CreateProposalForm>({
    resolver: zodResolver(createProposalSchema),
    defaultValues: {
      proposal_number: `PROP-${String(proposals.length + 1).padStart(3, '0')}`,
      title: '',
      lead_id: '',
      client_id: '',
      scope_summary: '',
      estimated_hours: '',
      proposed_amount_major: '',
      currency_code: defaultCurrency,
      valid_until: '',
    },
  });

  const contractForm = useForm<CreateContractForm>({
    resolver: zodResolver(createContractSchema),
    defaultValues: {
      contract_number: `CTR-${String(contracts.length + 1).padStart(3, '0')}`,
      title: '',
      client_id: '',
      proposal_id: '',
      contract_value_major: '',
      currency_code: defaultCurrency,
      start_date: getLocalTodayIso(),
      end_date: '',
      status: 'draft',
    },
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leads'] }),
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['client_contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['client_communications'] }),
      queryClient.invalidateQueries({ queryKey: ['proposals'] }),
      queryClient.invalidateQueries({ queryKey: ['contracts'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['ceo_metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  const saveLeadFormMutation = useMutation({
    mutationFn: async (vals: CreateLeadForm) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      const currency = vals.currency_code.toUpperCase();
      const payload = {
        organization_name: vals.organization_name,
        contact_name: vals.contact_name,
        contact_email: vals.contact_email || null,
        contact_phone: vals.contact_phone || null,
        source: vals.source || null,
        stage: vals.stage,
        estimated_value_minor: majorToMinor(vals.estimated_value_major, currency),
        currency_code: currency,
        owner_id: vals.owner_id || currentUser.id,
        next_follow_up_at: vals.next_follow_up_at ? new Date(vals.next_follow_up_at).toISOString() : null,
        requirements_summary: vals.requirements_summary || null,
      };
      if (editingLead) {
        return erpRepository.updateLead(currentUser.id, companyId, {
          id: editingLead.id,
          ...payload,
        });
      }
      return erpRepository.createLead(currentUser.id, companyId, {
        business_unit_id: csUnit?.id ?? null,
        ...payload,
      });
    },
    onSuccess: async (saved) => {
      await invalidateAll();
      setLeadModalOpen(false);
      setEditingLead(null);
      leadForm.reset();
      setSelectedLeadId(saved.id);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to save lead.'),
  });

  const updateLeadMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof erpRepository.updateLead>[2]) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      return erpRepository.updateLead(currentUser.id, companyId, payload);
    },
    onSuccess: async () => {
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update lead.'),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteLead(currentUser.id, companyId, leadId);
    },
    onSuccess: async (_, leadId) => {
      setDeleteTarget(null);
      if (selectedLeadId === leadId) setSelectedLeadId(null);
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete lead.'),
  });

  const convertLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      return erpRepository.convertLeadToClient(currentUser.id, companyId, leadId);
    },
    onSuccess: async (client) => {
      await invalidateAll();
      setSelectedLeadId(null);
      setActiveTab('clients');
      setSelectedClientId(client.id);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to convert lead to client.'),
  });

  const saveClientFormMutation = useMutation({
    mutationFn: async (vals: CreateClientForm) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      const payload = {
        business_unit_id: csUnit?.id ?? null,
        name: vals.name,
        industry: vals.industry || null,
        website: vals.website || null,
        billing_address: vals.billing_address || null,
        account_owner_id: vals.account_owner_id || currentUser.id,
        status: vals.status,
      };
      if (editingClient) {
        return erpRepository.updateClient(currentUser.id, companyId, {
          id: editingClient.id,
          ...payload,
        });
      }
      return erpRepository.createClient(currentUser.id, companyId, payload);
    },
    onSuccess: async (saved) => {
      await invalidateAll();
      setClientModalOpen(false);
      setEditingClient(null);
      clientForm.reset();
      setSelectedClientId(saved.id);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to save client.'),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteClient(currentUser.id, companyId, clientId);
    },
    onSuccess: async (_, clientId) => {
      setDeleteTarget(null);
      if (selectedClientId === clientId) setSelectedClientId(null);
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete client.'),
  });

  const updateClientStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: ClientStatus }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateClientStatus(currentUser.id, companyId, payload.id, payload.status);
    },
    onSuccess: async () => {
      await invalidateAll();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update client status.'),
  });

  const addContactMutation = useMutation({
    mutationFn: async (clientId: string) => {
      if (!currentUser || !companyId || !contactName.trim()) return;
      await erpRepository.addClientContact(currentUser.id, companyId, {
        client_id: clientId,
        full_name: contactName,
        role_title: contactRole || null,
        email: contactEmail || null,
        phone: contactPhone || null,
        is_primary: contacts.filter((c) => c.client_id === clientId).length === 0,
      });
    },
    onSuccess: async () => {
      setContactName('');
      setContactRole('');
      setContactEmail('');
      setContactPhone('');
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to add contact.'),
  });

  const logCommunicationMutation = useMutation({
    mutationFn: async (target: { clientId?: string | null; leadId?: string | null }) => {
      if (!currentUser || !companyId || !commSubject.trim() || !commSummary.trim()) return;
      await erpRepository.logClientCommunication(currentUser.id, companyId, {
        client_id: target.clientId ?? null,
        lead_id: target.leadId ?? null,
        channel: commChannel,
        subject: commSubject,
        summary: commSummary,
      });
    },
    onSuccess: async () => {
      setCommSubject('');
      setCommSummary('');
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to log communication.'),
  });

  const saveProposalFormMutation = useMutation({
    mutationFn: async (vals: CreateProposalForm) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      const currency = vals.currency_code.toUpperCase();
      const estHours = vals.estimated_hours ? Number(vals.estimated_hours) : null;
      const payload = {
        lead_id: vals.lead_id || null,
        client_id: vals.client_id || null,
        proposal_number: vals.proposal_number,
        title: vals.title,
        scope_summary: vals.scope_summary,
        estimated_hours: estHours !== null && !Number.isNaN(estHours) ? estHours : null,
        proposed_amount_minor: majorToMinor(vals.proposed_amount_major, currency),
        currency_code: currency,
        valid_until: vals.valid_until || null,
      };
      if (editingProposal) {
        return erpRepository.updateProposal(currentUser.id, companyId, {
          id: editingProposal.id,
          ...payload,
        });
      }
      return erpRepository.createProposal(currentUser.id, companyId, payload);
    },
    onSuccess: async () => {
      await invalidateAll();
      setProposalModalOpen(false);
      setEditingProposal(null);
      proposalForm.reset();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to save proposal.'),
  });

  const deleteProposalMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteProposal(currentUser.id, companyId, proposalId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete proposal.'),
  });

  const proposalWorkflowMutation = useMutation({
    mutationFn: async (action:
      | { kind: 'submit_tech'; id: string }
      | { kind: 'tech_review'; id: string; approved: boolean }
      | { kind: 'commercial_approve'; id: string; approved: boolean }
      | { kind: 'outcome'; id: string; status: 'accepted' | 'rejected' | 'expired' }
    ) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      if (action.kind === 'submit_tech') {
        return erpRepository.submitProposalForTechReview(currentUser.id, companyId, action.id);
      }
      if (action.kind === 'tech_review') {
        return erpRepository.reviewProposalTechnical(currentUser.id, companyId, action.id, action.approved);
      }
      if (action.kind === 'commercial_approve') {
        return erpRepository.approveProposalCommercial(currentUser.id, companyId, action.id, action.approved);
      }
      return erpRepository.updateProposalOutcome(currentUser.id, companyId, action.id, action.status);
    },
    onSuccess: async () => {
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Proposal action failed.'),
  });

  const saveContractFormMutation = useMutation({
    mutationFn: async (vals: CreateContractForm) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      const currency = vals.currency_code.toUpperCase();
      const payload = {
        client_id: vals.client_id,
        proposal_id: vals.proposal_id || null,
        contract_number: vals.contract_number,
        title: vals.title,
        contract_value_minor: majorToMinor(vals.contract_value_major, currency),
        currency_code: currency,
        start_date: vals.start_date,
        end_date: vals.end_date || null,
        status: vals.status,
      };
      if (editingContract) {
        return erpRepository.updateContract(currentUser.id, companyId, {
          id: editingContract.id,
          ...payload,
        });
      }
      return erpRepository.createContract(currentUser.id, companyId, payload);
    },
    onSuccess: async () => {
      await invalidateAll();
      setContractModalOpen(false);
      setEditingContract(null);
      contractForm.reset();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to save contract.'),
  });

  const deleteContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      if (!currentUser || !companyId) throw new Error('No active session.');
      await erpRepository.deleteContract(currentUser.id, companyId, contractId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to delete contract.'),
  });

  const updateContractStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: ContractStatus }) => {
      if (!currentUser || !companyId) return;
      await erpRepository.updateContractStatus(currentUser.id, companyId, payload.id, payload.status);
    },
    onSuccess: async () => {
      await invalidateAll();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update contract.'),
  });

  const createClientProjectMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !companyId || !clientProjectModalClient) return;
      return erpRepository.createProject(currentUser.id, companyId, {
        business_unit_id: csUnit?.id ?? clientProjectModalClient.business_unit_id ?? null,
        product_id: null,
        client_id: clientProjectModalClient.id,
        code: cpCode,
        name: cpName,
        description: `Client delivery project for ${clientProjectModalClient.name}`,
        project_type: 'client_delivery',
        status: 'active',
        owner_id: clientProjectModalClient.account_owner_id ?? currentUser.id,
        project_manager_id: cpManagerId || currentUser.id,
        start_date: getLocalTodayIso(),
        due_date: cpDueDate || null,
        budget_minor: majorToMinor(cpBudgetMajor, defaultCurrency),
        budget_currency: defaultCurrency,
        progress_pct: 0,
      });
    },
    onSuccess: async () => {
      await invalidateAll();
      setClientProjectModalClient(null);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to create client project.'),
  });

  const openClientProjectModal = (client: ClientRecord, prefillContract?: ContractRecord) => {
    setActionError(null);
    setCpCode(`CL-${String(projects.length + 1).padStart(3, '0')}`);
    setCpName(prefillContract ? `${client.name} — ${prefillContract.title}` : `${client.name} Delivery`);
    setCpManagerId(currentUser?.id ?? '');
    setCpDueDate(prefillContract?.end_date ?? '');
    setCpBudgetMajor(
      prefillContract
        ? minorToMajorString(prefillContract.contract_value_minor, prefillContract.currency_code)
        : '0'
    );
    setClientProjectModalClient(client);
  };

  const openEditLeadModal = (lead: LeadRecord) => {
    setActionError(null);
    setEditingLead(lead);
    leadForm.reset({
      organization_name: lead.organization_name,
      contact_name: lead.contact_name,
      contact_email: lead.contact_email ?? '',
      contact_phone: lead.contact_phone ?? '',
      source: lead.source ?? '',
      stage: lead.stage,
      estimated_value_major: minorToMajorString(lead.estimated_value_minor, lead.currency_code),
      currency_code: lead.currency_code,
      owner_id: lead.owner_id ?? '',
      next_follow_up_at: lead.next_follow_up_at ? lead.next_follow_up_at.slice(0, 16) : '',
      requirements_summary: lead.requirements_summary ?? '',
    });
    setLeadModalOpen(true);
  };

  const openEditClientModal = (client: ClientRecord) => {
    setActionError(null);
    setEditingClient(client);
    clientForm.reset({
      name: client.name,
      industry: client.industry ?? '',
      website: client.website ?? '',
      billing_address: client.billing_address ?? '',
      account_owner_id: client.account_owner_id ?? '',
      status: client.status,
    });
    setClientModalOpen(true);
  };

  const openProposalModal = (prefillLead?: LeadRecord) => {
    setActionError(null);
    setEditingProposal(null);
    proposalForm.reset({
      proposal_number: `PROP-${String(proposals.length + 1).padStart(3, '0')}`,
      title: prefillLead ? `${prefillLead.organization_name} Implementation Proposal` : '',
      lead_id: prefillLead?.id ?? '',
      client_id: prefillLead?.client_id ?? '',
      scope_summary: prefillLead?.requirements_summary ?? '',
      estimated_hours: '',
      proposed_amount_major: prefillLead
        ? minorToMajorString(prefillLead.estimated_value_minor, prefillLead.currency_code)
        : '',
      currency_code: prefillLead?.currency_code ?? defaultCurrency,
      valid_until: '',
    });
    setProposalModalOpen(true);
  };

  const openEditProposalModal = (prop: ProposalRecord) => {
    setActionError(null);
    setEditingProposal(prop);
    proposalForm.reset({
      proposal_number: prop.proposal_number,
      title: prop.title,
      lead_id: prop.lead_id ?? '',
      client_id: prop.client_id ?? '',
      scope_summary: prop.scope_summary,
      estimated_hours: prop.estimated_hours !== null ? String(prop.estimated_hours) : '',
      proposed_amount_major: minorToMajorString(prop.proposed_amount_minor, prop.currency_code),
      currency_code: prop.currency_code,
      valid_until: prop.valid_until ?? '',
    });
    setProposalModalOpen(true);
  };

  const openContractModal = (prefillProposal?: ProposalRecord) => {
    setActionError(null);
    setEditingContract(null);
    contractForm.reset({
      contract_number: `CTR-${String(contracts.length + 1).padStart(3, '0')}`,
      title: prefillProposal?.title ?? '',
      client_id: prefillProposal?.client_id ?? '',
      proposal_id: prefillProposal?.id ?? '',
      contract_value_major: prefillProposal
        ? minorToMajorString(prefillProposal.proposed_amount_minor, prefillProposal.currency_code)
        : '',
      currency_code: prefillProposal?.currency_code ?? defaultCurrency,
      start_date: getLocalTodayIso(),
      end_date: '',
      status: 'draft',
    });
    setContractModalOpen(true);
  };

  const openEditContractModal = (ctr: ContractRecord) => {
    setActionError(null);
    setEditingContract(ctr);
    contractForm.reset({
      contract_number: ctr.contract_number,
      title: ctr.title,
      client_id: ctr.client_id,
      proposal_id: ctr.proposal_id ?? '',
      contract_value_major: minorToMajorString(ctr.contract_value_minor, ctr.currency_code),
      currency_code: ctr.currency_code,
      start_date: ctr.start_date,
      end_date: ctr.end_date ?? '',
      status: ctr.status,
    });
    setContractModalOpen(true);
  };

  const activePipelineMinor = useMemo(
    () => leads.filter((l) => l.stage !== 'lost').reduce((sum, l) => sum + l.estimated_value_minor, 0),
    [leads]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Client Services & Commercial · Pipeline {formatMinorCurrency(activePipelineMinor, defaultCurrency)}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Client Services
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManagePipeline ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setEditingLead(null);
                  leadForm.reset({
                    organization_name: '',
                    contact_name: '',
                    contact_email: '',
                    contact_phone: '',
                    source: '',
                    stage: 'new_lead',
                    estimated_value_major: '0',
                    currency_code: defaultCurrency,
                    owner_id: currentUser?.id ?? '',
                    next_follow_up_at: '',
                    requirements_summary: '',
                  });
                  setLeadModalOpen(true);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-3.5 text-xs font-medium text-white hover:bg-[#082B4C] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                New Lead
              </button>
              <button
                type="button"
                onClick={() => openProposalModal()}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Draft Proposal
              </button>
            </>
          ) : null}
          {canCommercialApprove ? (
            <button
              type="button"
              onClick={() => openContractModal()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              New Contract
            </button>
          ) : null}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-[#1E3252] dark:bg-[#091221]">
          {(
            [
              { id: 'pipeline', label: `Lead Pipeline (${leads.length})` },
              { id: 'clients', label: `Client Directory (${clients.length})` },
              { id: 'proposals', label: `Proposals & Review (${proposals.length})` },
              { id: 'contracts', label: `Contracts (${contracts.length})` },
            ] as Array<{ id: CsTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedClientId(null);
              }}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0C1729] dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === 'pipeline' || activeTab === 'clients') && !selectedClient ? (
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'pipeline' ? 'Search leads...' : 'Search clients...'}
                className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
              />
            </div>
            {activeTab === 'pipeline' ? (
              <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-[#1E3252] dark:bg-[#0C1729]">
                <button
                  type="button"
                  onClick={() => setPipelineView('board')}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                    pipelineView === 'board' ? 'bg-[#0B3B66] text-white dark:bg-sky-600' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Pipeline
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineView('table')}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                    pipelineView === 'table' ? 'bg-[#0B3B66] text-white dark:bg-sky-600' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  Table
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {/* ==================================================================== */}
      {/* TAB 1: PIPELINE & LEADS */}
      {/* ==================================================================== */}
      {activeTab === 'pipeline' ? (
        <div className="space-y-5">
          {/* Follow-Up Reminders Queue */}
          {followUpReminders.length > 0 ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
                <CalendarClock className="h-4 w-4" />
                Upcoming & Due Follow-Up Reminders ({followUpReminders.length})
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {followUpReminders.slice(0, 6).map((rem) => {
                  const isDue = rem.next_follow_up_at! <= new Date().toISOString();
                  return (
                    <button
                      key={rem.id}
                      type="button"
                      onClick={() => setSelectedLeadId(rem.id)}
                      className="flex items-center justify-between rounded border border-amber-200 bg-white px-3 py-2 text-left text-xs hover:border-[#0B3B66] dark:border-amber-900/40 dark:bg-[#0C1729]"
                    >
                      <span className="truncate font-medium text-slate-900 dark:text-white">
                        {rem.organization_name}
                      </span>
                      <span className={`ml-2 shrink-0 font-mono text-[11px] ${isDue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                        {rem.next_follow_up_at?.slice(0, 10)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {leadsQuery.isLoading ? (
            <div className="h-64 rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]" />
          ) : leads.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="No client leads in pipeline"
              description="Add prospective clients to track qualification, requirement gathering, follow-up reminders, technical reviews, proposals, and contracts."
              action={
                canManagePipeline ? (
                  <button
                    type="button"
                    onClick={() => setLeadModalOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add First Lead
                  </button>
                ) : undefined
              }
            />
          ) : pipelineView === 'board' ? (
            <div className="flex gap-3.5 overflow-x-auto pb-4">
              {LEAD_STAGES.map((stage) => {
                const stageLeads = filteredLeads.filter((l) => l.stage === stage.id);
                const stageTotal = stageLeads.reduce((acc, l) => acc + l.estimated_value_minor, 0);
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      if (!canManagePipeline) return;
                      const draggedId = e.dataTransfer.getData('text/plain');
                      if (draggedId) {
                        updateLeadMutation.mutate({ id: draggedId, stage: stage.id });
                      }
                    }}
                    className="flex w-68 shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-100/70 p-3 dark:border-[#1E3252] dark:bg-[#091221]"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {stage.label} ({stageLeads.length})
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {formatMinorCurrency(stageTotal, defaultCurrency)}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          draggable={canManagePipeline}
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', lead.id)}
                          className="rounded-md border border-slate-200 bg-white p-3.5 transition-colors hover:border-[#0B3B66] dark:border-[#1E3252] dark:bg-[#0C1729] dark:hover:border-sky-500"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="w-full text-left"
                          >
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">
                              {lead.organization_name}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              {lead.contact_name}
                              {lead.source ? ` · ${lead.source}` : ''}
                            </div>
                            <div className="mt-2.5 flex items-center justify-between text-[11px]">
                              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                {formatMinorCurrency(lead.estimated_value_minor, lead.currency_code)}
                              </span>
                              {lead.next_follow_up_at ? (
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  {lead.next_follow_up_at.slice(0, 10)}
                                </span>
                              ) : null}
                            </div>
                          </button>
                          {canManagePipeline ? (
                            <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-slate-100 pt-2 dark:border-[#1E3252]">
                              {lead.stage !== 'won' ? (
                                <button
                                  type="button"
                                  onClick={() => updateLeadMutation.mutate({ id: lead.id, stage: 'won' })}
                                  title="Mark lead won"
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Won
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openEditLeadModal(lead)}
                                title="Edit lead"
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'lead', item: lead })}
                                title="Delete lead"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#0C1729]"
                >
                  <option value="all">All Stages</option>
                  {LEAD_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                        <th className="px-4 py-3">Organization</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="px-4 py-3">Stage</th>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">Next Follow-Up</th>
                        <th className="px-4 py-3 text-right">Est. Value</th>
                        {canManagePipeline ? <th className="px-4 py-3 text-right">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                      {filteredLeads.map((l) => (
                        <tr
                          key={l.id}
                          onClick={() => setSelectedLeadId(l.id)}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-[#102038]"
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {l.organization_name}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {l.contact_name}
                            {l.contact_email ? ` · ${l.contact_email}` : ''}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-300">
                            {l.stage.replace('_', ' ')}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {l.owner_id ? memberMap.get(l.owner_id) ?? '—' : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {l.next_follow_up_at ? l.next_follow_up_at.slice(0, 10) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMinorCurrency(l.estimated_value_minor, l.currency_code)}
                          </td>
                          {canManagePipeline ? (
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center justify-end gap-1">
                                {l.stage !== 'won' ? (
                                  <button
                                    type="button"
                                    onClick={() => updateLeadMutation.mutate({ id: l.id, stage: 'won' })}
                                    title="Mark lead won"
                                    className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openEditLeadModal(l)}
                                  title="Edit lead"
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: 'lead', item: l })}
                                  title="Delete lead"
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ==================================================================== */}
      {/* TAB 2: CLIENT DIRECTORY & CLIENT PROFILES */}
      {/* ==================================================================== */}
      {activeTab === 'clients' ? (
        selectedClient ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedClientId(null)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Client Directory
              </button>
              {canManageProjects ? (
                <button
                  type="button"
                  onClick={() => openClientProjectModal(selectedClient)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0B3B66] px-3.5 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
                >
                  <FolderKanban className="h-3.5 w-3.5" />
                  Create Client Delivery Project
                </button>
              ) : null}
            </div>

            {/* Client Profile Header */}
            <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-[#1E3252]">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{selectedClient.industry ?? 'Client Account'}</span>
                    {selectedClient.website ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">{selectedClient.website}</span>
                      </>
                    ) : null}
                  </div>
                  <h2 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-white">
                    {selectedClient.name}
                  </h2>
                  {selectedClient.billing_address ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Billing Address: {selectedClient.billing_address}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Owner: {selectedClient.account_owner_id ? memberMap.get(selectedClient.account_owner_id) ?? '—' : 'Unassigned'}
                  </span>
                  {canManagePipeline ? (
                    <>
                      {selectedClient.status !== 'active' ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateClientStatusMutation.mutate({
                              id: selectedClient.id,
                              status: 'active',
                            })
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Activate
                        </button>
                      ) : null}
                      <select
                        value={selectedClient.status}
                        onChange={(e) =>
                          updateClientStatusMutation.mutate({
                            id: selectedClient.id,
                            status: e.target.value as ClientStatus,
                          })
                        }
                        className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                      >
                        <option value="prospect">Prospect</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="churned">Churned</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openEditClientModal(selectedClient)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ kind: 'client', item: selectedClient })}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#091221] dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </>
                  ) : (
                    <StatusText
                      tone={selectedClient.status === 'active' ? 'nominal' : selectedClient.status === 'churned' ? 'critical' : 'neutral'}
                      label={selectedClient.status}
                    />
                  )}
                </div>
              </div>

              {/* Contacts & Linked Projects */}
              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Client Contacts ({contacts.filter((c) => c.client_id === selectedClient.id).length})
                  </h3>
                  <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                    {contacts
                      .filter((c) => c.client_id === selectedClient.id)
                      .map((ct) => (
                        <li key={ct.id} className="py-2">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {ct.full_name}
                            {ct.is_primary ? ' · Primary' : ''}
                            {ct.role_title ? ` (${ct.role_title})` : ''}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {[ct.email, ct.phone].filter(Boolean).join(' · ') || 'No contact channels logged'}
                          </div>
                        </li>
                      ))}
                  </ul>
                  {canManagePipeline ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-[#1E3252]">
                      <input
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Contact name *"
                        className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                      />
                      <input
                        value={contactRole}
                        onChange={(e) => setContactRole(e.target.value)}
                        placeholder="Role / Title"
                        className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                      />
                      <input
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="Email"
                        className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                      />
                      <div className="flex gap-2">
                        <input
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="Phone"
                          className="h-8 flex-1 rounded border border-slate-200 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                        />
                        <button
                          type="button"
                          disabled={!contactName.trim() || addContactMutation.isPending}
                          onClick={() => addContactMutation.mutate(selectedClient.id)}
                          className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-40 dark:bg-sky-600"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Client Delivery Projects ({projects.filter((p) => p.client_id === selectedClient.id).length})
                  </h3>
                  {projects.filter((p) => p.client_id === selectedClient.id).length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      No delivery projects created for {selectedClient.name} yet.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                      {projects
                        .filter((p) => p.client_id === selectedClient.id)
                        .map((proj) => (
                          <li key={proj.id} className="flex items-center justify-between py-2">
                            <Link to={`/projects?project=${proj.id}`} className="font-medium text-[#0B3B66] hover:underline dark:text-sky-400">
                              {proj.code} · {proj.name}
                            </Link>
                            <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                              {proj.status} · {proj.progress_pct}%
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* Communication History */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-[#1E3252]">
                <MessageSquare className="h-4 w-4 text-[#0B3B66] dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Communication History
                </h3>
              </div>

              {canManagePipeline ? (
                <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 dark:border-[#1E3252] dark:bg-[#091221]">
                  <select
                    value={commChannel}
                    onChange={(e) => setCommChannel(e.target.value as CommunicationChannel)}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="chat">Chat</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    value={commSubject}
                    onChange={(e) => setCommSubject(e.target.value)}
                    placeholder="Subject..."
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-3 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <input
                    value={commSummary}
                    onChange={(e) => setCommSummary(e.target.value)}
                    placeholder="Summary of discussion & next steps..."
                    className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs sm:col-span-5 dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                  <button
                    type="button"
                    disabled={!commSubject.trim() || !commSummary.trim() || logCommunicationMutation.isPending}
                    onClick={() => logCommunicationMutation.mutate({ clientId: selectedClient.id })}
                    className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-40 sm:col-span-2 dark:bg-sky-600"
                  >
                    Log Note
                  </button>
                </div>
              ) : null}

              {communications.filter((cm) => cm.client_id === selectedClient.id).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No communications logged for {selectedClient.name} yet.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                  {communications
                    .filter((cm) => cm.client_id === selectedClient.id)
                    .map((cm) => (
                      <li key={cm.id} className="py-3">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono uppercase">{cm.channel}</span>
                          <span className="font-mono">{new Date(cm.communicated_at).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-900 dark:text-white">{cm.subject}</div>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{cm.summary}</p>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            {canManagePipeline ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setEditingClient(null);
                    clientForm.reset({
                      name: '',
                      industry: '',
                      website: '',
                      billing_address: '',
                      account_owner_id: currentUser?.id ?? '',
                      status: 'active',
                    });
                    setClientModalOpen(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Client Account
                </button>
              </div>
            ) : null}

            {filteredClients.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No client accounts recorded"
                description="Convert a qualified or won lead from the Pipeline tab, or add a client account directly to manage contacts, contracts, and delivery projects."
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                        <th className="px-4 py-3">Client Name</th>
                        <th className="px-4 py-3">Industry</th>
                        <th className="px-4 py-3">Account Owner</th>
                        <th className="px-4 py-3">Projects</th>
                        <th className="px-4 py-3">Status</th>
                        {canManagePipeline ? <th className="px-4 py-3 text-right">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                      {filteredClients.map((c) => {
                        const projCount = projects.filter((p) => p.client_id === c.id).length;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedClientId(c.id)}
                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-[#102038]"
                          >
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.industry ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {c.account_owner_id ? memberMap.get(c.account_owner_id) ?? '—' : '—'}
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {projCount}
                            </td>
                            <td className="px-4 py-3">
                              <StatusText
                                tone={c.status === 'active' ? 'nominal' : c.status === 'churned' ? 'critical' : 'neutral'}
                                label={c.status}
                              />
                            </td>
                            {canManagePipeline ? (
                              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center justify-end gap-1">
                                  {c.status !== 'active' ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateClientStatusMutation.mutate({ id: c.id, status: 'active' })
                                      }
                                      title="Activate client"
                                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => openEditClientModal(c)}
                                    title="Edit client"
                                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget({ kind: 'client', item: c })}
                                    title="Delete client"
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      ) : null}

      {/* ==================================================================== */}
      {/* TAB 3: PROPOSALS & SEPARATION-OF-DUTIES REVIEW */}
      {/* ==================================================================== */}
      {activeTab === 'proposals' ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-300">
            <strong className="font-semibold text-slate-900 dark:text-white">Governance Workflow:</strong>{' '}
            Engineering estimates require <code className="font-mono">proposals.tech_review</code> (CTO) before commercial commitment approval via{' '}
            <code className="font-mono">proposals.commercial_approve</code> (CBO / CEO).
          </div>

          {proposals.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No client proposals created yet"
              description="Draft a proposal from a client lead or directly to initiate technical estimate review and commercial commitment approval."
              action={
                canManagePipeline ? (
                  <button
                    type="button"
                    onClick={() => openProposalModal()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Draft Proposal
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {proposals.map((prop) => {
                const targetName =
                  (prop.client_id ? clientMap.get(prop.client_id) : null) ||
                  (prop.lead_id ? leadMap.get(prop.lead_id) : null) ||
                  'Unlinked Opportunity';
                return (
                  <section
                    key={prop.id}
                    className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#1E3252] dark:bg-[#0C1729]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                          <span>{prop.proposal_number}</span>
                          <span>·</span>
                          <span>{targetName}</span>
                          <span>·</span>
                          <StatusText
                            tone={PROPOSAL_STATUS_TONES[prop.status]}
                            label={prop.status.replace(/_/g, ' ').toUpperCase()}
                          />
                        </div>
                        <h3 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-white">
                          {prop.title}
                        </h3>
                        <p className="mt-1 max-w-3xl text-xs text-slate-600 dark:text-slate-400">
                          {prop.scope_summary}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatMinorCurrency(prop.proposed_amount_minor, prop.currency_code)}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          Est. {prop.estimated_hours ?? 0}h · Valid until {prop.valid_until ?? 'N/A'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-[#1E3252]">
                      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          Tech Review:{' '}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {prop.technical_reviewed_by ? memberMap.get(prop.technical_reviewed_by) ?? 'Reviewed' : 'Pending'}
                          </strong>
                        </span>
                        <span>
                          Commercial Approval:{' '}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {prop.commercial_approved_by ? memberMap.get(prop.commercial_approved_by) ?? 'Approved' : 'Pending'}
                          </strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {prop.status === 'draft' && canManagePipeline ? (
                          <button
                            type="button"
                            onClick={() => proposalWorkflowMutation.mutate({ kind: 'submit_tech', id: prop.id })}
                            className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white dark:bg-sky-600"
                          >
                            Submit for Technical Review
                          </button>
                        ) : null}

                        {prop.status === 'pending_tech_review' ? (
                          canTechReview ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  proposalWorkflowMutation.mutate({ kind: 'tech_review', id: prop.id, approved: false })
                                }
                                className="h-8 rounded border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300"
                              >
                                Return to Draft
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  proposalWorkflowMutation.mutate({ kind: 'tech_review', id: prop.id, approved: true })
                                }
                                className="h-8 rounded bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800"
                              >
                                Approve Technical Estimate
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              Awaiting CTO / Technical Review
                            </span>
                          )
                        ) : null}

                        {prop.status === 'pending_commercial_approval' ? (
                          canCommercialApprove ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  proposalWorkflowMutation.mutate({
                                    kind: 'commercial_approve',
                                    id: prop.id,
                                    approved: false,
                                  })
                                }
                                className="h-8 rounded border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  proposalWorkflowMutation.mutate({
                                    kind: 'commercial_approve',
                                    id: prop.id,
                                    approved: true,
                                  })
                                }
                                className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white dark:bg-sky-600"
                              >
                                Approve Commercial & Mark Sent
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              Awaiting CBO / Commercial Approval
                            </span>
                          )
                        ) : null}

                        {prop.status === 'sent' && (canManagePipeline || canCommercialApprove) ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                proposalWorkflowMutation.mutate({ kind: 'outcome', id: prop.id, status: 'rejected' })
                              }
                              className="h-8 rounded border border-slate-200 px-3 text-xs font-medium text-slate-700 dark:border-[#1E3252] dark:text-slate-300"
                            >
                              Client Rejected
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                proposalWorkflowMutation.mutate({ kind: 'outcome', id: prop.id, status: 'accepted' })
                              }
                              className="h-8 rounded bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800"
                            >
                              Mark Accepted
                            </button>
                          </>
                        ) : null}

                        {prop.status === 'accepted' && canCommercialApprove && prop.client_id ? (
                          <button
                            type="button"
                            onClick={() => openContractModal(prop)}
                            className="inline-flex h-8 items-center gap-1 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white dark:bg-sky-600"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Generate Contract
                          </button>
                        ) : null}

                        {canManagePipeline ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditProposalModal(prop)}
                              title="Edit proposal"
                              className="inline-flex h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ kind: 'proposal', item: prop })}
                              title="Delete proposal"
                              className="inline-flex h-8 items-center gap-1 rounded border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#091221] dark:text-red-400 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* ==================================================================== */}
      {/* TAB 4: CONTRACTS */}
      {/* ==================================================================== */}
      {activeTab === 'contracts' ? (
        contracts.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="No client contracts recorded"
            description="Create and approve client contracts from accepted proposals or active client accounts to initiate delivery projects."
            action={
              canCommercialApprove ? (
                <button
                  type="button"
                  onClick={() => openContractModal()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Contract
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                    <th className="px-4 py-3">Contract #</th>
                    <th className="px-4 py-3">Client & Title</th>
                    <th className="px-4 py-3">Term</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                  {contracts.map((ctr) => {
                    const client = clients.find((c) => c.id === ctr.client_id);
                    return (
                      <tr key={ctr.id}>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                          {ctr.contract_number}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{ctr.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {client?.name ?? 'Client'}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {ctr.start_date} → {ctr.end_date ?? 'Ongoing'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatMinorCurrency(ctr.contract_value_minor, ctr.currency_code)}
                        </td>
                        <td className="px-4 py-3">
                          {canCommercialApprove ? (
                            <select
                              value={ctr.status}
                              onChange={(e) =>
                                updateContractStatusMutation.mutate({
                                  id: ctr.id,
                                  status: e.target.value as ContractStatus,
                                })
                              }
                              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                            >
                              <option value="draft">Draft</option>
                              <option value="pending_approval">Pending Approval</option>
                              <option value="active">Active</option>
                              <option value="completed">Completed</option>
                              <option value="terminated">Terminated</option>
                            </select>
                          ) : (
                            <StatusText
                              tone={CONTRACT_STATUS_TONES[ctr.status]}
                              label={ctr.status.replace('_', ' ')}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {client && canManageProjects ? (
                              <button
                                type="button"
                                onClick={() => openClientProjectModal(client, ctr)}
                                className="text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                              >
                                Launch Project →
                              </button>
                            ) : null}
                            {canCommercialApprove ? (
                              <>
                                {ctr.status !== 'completed' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateContractStatusMutation.mutate({
                                        id: ctr.id,
                                        status: 'completed',
                                      })
                                    }
                                    title="Mark contract completed"
                                    className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openEditContractModal(ctr)}
                                  title="Edit contract"
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: 'contract', item: ctr })}
                                  title="Delete contract"
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}

      {/* ==================================================================== */}
      {/* LEAD DETAILS DRAWER */}
      {/* ==================================================================== */}
      {selectedLead ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-[#1E3252]">
              <div>
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  LEAD · Created {selectedLead.created_at.slice(0, 10)}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedLead.organization_name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedLead.contact_name}
                  {selectedLead.contact_email ? ` · ${selectedLead.contact_email}` : ''}
                  {selectedLead.contact_phone ? ` · ${selectedLead.contact_phone}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {canManagePipeline ? (
                  <>
                    {selectedLead.stage !== 'won' ? (
                      <button
                        type="button"
                        onClick={() => updateLeadMutation.mutate({ id: selectedLead.id, stage: 'won' })}
                        title="Mark lead won"
                        className="inline-flex h-8 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark Won
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEditLeadModal(selectedLead)}
                      title="Edit lead"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#13233C] dark:hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ kind: 'lead', item: selectedLead })}
                      title="Delete lead"
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedLeadId(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13233C]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 dark:border-[#1E3252] dark:bg-[#091221]">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Pipeline Stage</label>
                <select
                  value={selectedLead.stage}
                  disabled={!canManagePipeline}
                  onChange={(e) =>
                    updateLeadMutation.mutate({ id: selectedLead.id, stage: e.target.value as LeadStage })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Est. Value ({selectedLead.currency_code})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={leadValueDraft}
                  disabled={!canManagePipeline}
                  onChange={(e) => setLeadValueDraft(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Next Follow-Up Reminder
                </label>
                <input
                  type="datetime-local"
                  value={leadFollowUpDraft}
                  disabled={!canManagePipeline}
                  onChange={(e) => setLeadFollowUpDraft(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Lead Owner</label>
                <select
                  value={selectedLead.owner_id ?? ''}
                  disabled={!canManagePipeline}
                  onChange={(e) =>
                    updateLeadMutation.mutate({ id: selectedLead.id, owner_id: e.target.value || null })
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Requirement Collection Summary
                </label>
                <textarea
                  rows={3}
                  value={leadReqDraft}
                  disabled={!canManagePipeline}
                  onChange={(e) => setLeadReqDraft(e.target.value)}
                  placeholder="Document functional scope, deliverables, platforms, and target timeline..."
                  className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs text-slate-900 disabled:opacity-60 dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                />
              </div>

              {selectedLead.stage === 'lost' ? (
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Lost Reason</label>
                  <input
                    value={leadLostReasonDraft}
                    disabled={!canManagePipeline}
                    onChange={(e) => setLeadLostReasonDraft(e.target.value)}
                    placeholder="Reason deal was lost..."
                    className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                  />
                </div>
              ) : null}

              {canManagePipeline ? (
                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                  <div className="flex flex-wrap gap-2">
                    {!selectedLead.client_id ? (
                      <button
                        type="button"
                        onClick={() => convertLeadMutation.mutate(selectedLead.id)}
                        className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
                      >
                        Convert to Client Account
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClientId(selectedLead.client_id);
                          setSelectedLeadId(null);
                          setActiveTab('clients');
                        }}
                        className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-[#0B3B66] dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-sky-400"
                      >
                        Open Client Profile →
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openProposalModal(selectedLead)}
                      className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
                    >
                      Draft Proposal
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateLeadMutation.mutate({
                        id: selectedLead.id,
                        estimated_value_minor: majorToMinor(leadValueDraft, selectedLead.currency_code),
                        next_follow_up_at: leadFollowUpDraft ? new Date(leadFollowUpDraft).toISOString() : null,
                        requirements_summary: leadReqDraft || null,
                        lost_reason: leadLostReasonDraft || null,
                      })
                    }
                    className="h-8 rounded bg-[#0B3B66] px-3.5 text-xs font-medium text-white dark:bg-sky-600"
                  >
                    Save Lead Details
                  </button>
                </div>
              ) : null}
            </div>

            {/* Lead Communications */}
            <div className="mt-6 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Communication Log</h3>
              {canManagePipeline ? (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={commChannel}
                      onChange={(e) => setCommChannel(e.target.value as CommunicationChannel)}
                      className="h-8 rounded border border-slate-300 bg-white px-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                    >
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                      <option value="chat">Chat</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      value={commSubject}
                      onChange={(e) => setCommSubject(e.target.value)}
                      placeholder="Subject..."
                      className="h-8 flex-1 rounded border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={commSummary}
                      onChange={(e) => setCommSummary(e.target.value)}
                      placeholder="Communication summary..."
                      className="h-8 flex-1 rounded border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                    />
                    <button
                      type="button"
                      disabled={!commSubject.trim() || !commSummary.trim() || logCommunicationMutation.isPending}
                      onClick={() => logCommunicationMutation.mutate({ leadId: selectedLead.id, clientId: selectedLead.client_id })}
                      className="h-8 rounded bg-[#0B3B66] px-3 text-xs font-medium text-white disabled:opacity-40 dark:bg-sky-600"
                    >
                      Log
                    </button>
                  </div>
                </div>
              ) : null}

              <ul className="mt-4 divide-y divide-slate-100 text-xs dark:divide-[#1E3252]">
                {communications
                  .filter((cm) => cm.lead_id === selectedLead.id)
                  .map((cm) => (
                    <li key={cm.id} className="py-2.5">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span className="font-mono uppercase">{cm.channel}</span>
                        <span className="font-mono">{new Date(cm.communicated_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 font-medium text-slate-900 dark:text-white">{cm.subject}</div>
                      <p className="text-slate-600 dark:text-slate-300">{cm.summary}</p>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* ==================================================================== */}
      {/* MODALS: NEW LEAD, NEW CLIENT, NEW PROPOSAL, NEW CONTRACT, CLIENT PROJECT */}
      {/* ==================================================================== */}
      {leadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingLead ? 'Edit Lead' : 'New Lead'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setLeadModalOpen(false);
                  setEditingLead(null);
                }}
                className="rounded p-1 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={leadForm.handleSubmit((vals) => saveLeadFormMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Organization Name *</label>
                <input {...leadForm.register('organization_name')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Contact Person *</label>
                <input {...leadForm.register('contact_name')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Contact Email</label>
                <input type="email" {...leadForm.register('contact_email')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Contact Phone</label>
                <input {...leadForm.register('contact_phone')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Lead Source</label>
                <input {...leadForm.register('source')} placeholder="Referral, Website, Outbound" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Stage</label>
                <select {...leadForm.register('stage')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  {LEAD_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Estimated Value</label>
                <div className="mt-1 flex gap-2">
                  <input {...leadForm.register('currency_code')} maxLength={3} className="h-9 w-20 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs uppercase dark:border-[#1E3252] dark:bg-[#060D1A]" />
                  <input type="number" step="0.01" min="0" {...leadForm.register('estimated_value_major')} className="h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Next Follow-Up</label>
                <input type="datetime-local" {...leadForm.register('next_follow_up_at')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Requirements</label>
                <textarea rows={2} {...leadForm.register('requirements_summary')} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => {
                    setLeadModalOpen(false);
                    setEditingLead(null);
                  }}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saveLeadFormMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {saveLeadFormMutation.isPending ? 'Saving...' : editingLead ? 'Save Changes' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {clientModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingClient ? 'Edit Client Account' : 'Add Client Account'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setClientModalOpen(false);
                  setEditingClient(null);
                }}
                className="rounded p-1 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={clientForm.handleSubmit((vals) => saveClientFormMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Client Organization *</label>
                <input {...clientForm.register('name')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Industry</label>
                <input {...clientForm.register('industry')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Website</label>
                <input {...clientForm.register('website')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Account Owner</label>
                <select {...clientForm.register('account_owner_id')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select {...clientForm.register('status')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="churned">Churned</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Billing Address</label>
                <input {...clientForm.register('billing_address')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => {
                    setClientModalOpen(false);
                    setEditingClient(null);
                  }}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saveClientFormMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {saveClientFormMutation.isPending ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {proposalModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingProposal ? 'Edit Client Proposal' : 'Draft Client Proposal'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setProposalModalOpen(false);
                  setEditingProposal(null);
                }}
                className="rounded p-1 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={proposalForm.handleSubmit((vals) => saveProposalFormMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Proposal # *</label>
                <input {...proposalForm.register('proposal_number')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Proposal Title *</label>
                <input {...proposalForm.register('title')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Linked Lead</label>
                <select {...proposalForm.register('lead_id')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  <option value="">None</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.organization_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Linked Client</label>
                <select {...proposalForm.register('client_id')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  <option value="">None</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Technical Scope Summary *</label>
                <textarea rows={3} {...proposalForm.register('scope_summary')} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Estimated Hours (for CTO Review)</label>
                <input type="number" step="0.5" min="0" {...proposalForm.register('estimated_hours')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Proposed Amount *</label>
                <div className="mt-1 flex gap-2">
                  <input {...proposalForm.register('currency_code')} maxLength={3} className="h-9 w-20 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs uppercase dark:border-[#1E3252] dark:bg-[#060D1A]" />
                  <input type="number" step="0.01" min="0" {...proposalForm.register('proposed_amount_major')} className="h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Valid Until</label>
                <input type="date" {...proposalForm.register('valid_until')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => {
                    setProposalModalOpen(false);
                    setEditingProposal(null);
                  }}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saveProposalFormMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {saveProposalFormMutation.isPending ? 'Saving...' : editingProposal ? 'Save Proposal' : 'Save Draft Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {contractModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingContract ? 'Edit Client Contract' : 'Create Client Contract'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setContractModalOpen(false);
                  setEditingContract(null);
                }}
                className="rounded p-1 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={contractForm.handleSubmit((vals) => saveContractFormMutation.mutate(vals))}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Contract # *</label>
                <input {...contractForm.register('contract_number')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Title *</label>
                <input {...contractForm.register('title')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Client Account *</label>
                <select {...contractForm.register('client_id')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Linked Proposal</label>
                <select {...contractForm.register('proposal_id')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  <option value="">None</option>
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>{p.proposal_number} · {p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Contract Value *</label>
                <div className="mt-1 flex gap-2">
                  <input {...contractForm.register('currency_code')} maxLength={3} className="h-9 w-20 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs uppercase dark:border-[#1E3252] dark:bg-[#060D1A]" />
                  <input type="number" step="0.01" min="0" {...contractForm.register('contract_value_major')} className="h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select {...contractForm.register('status')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]">
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="active">Active (Signed)</option>
                  <option value="completed">Completed</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Start Date *</label>
                <input type="date" {...contractForm.register('start_date')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">End Date</label>
                <input type="date" {...contractForm.register('end_date')} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => {
                    setContractModalOpen(false);
                    setEditingContract(null);
                  }}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saveContractFormMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {saveContractFormMutation.isPending ? 'Saving...' : 'Save Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {clientProjectModalClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Create Client Delivery Project
              </h2>
              <button type="button" onClick={() => setClientProjectModalClient(null)} className="rounded p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <p className="text-slate-500 dark:text-slate-400">
                Client: <strong className="text-slate-900 dark:text-white">{clientProjectModalClient.name}</strong>
              </p>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300">Project Code</label>
                <input value={cpCode} onChange={(e) => setCpCode(e.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-3 font-mono uppercase dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300">Project Name</label>
                <input value={cpName} onChange={(e) => setCpName(e.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-3 dark:border-[#1E3252] dark:bg-[#060D1A]" />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300">Project Manager</label>
                <select value={cpManagerId} onChange={(e) => setCpManagerId(e.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2.5 dark:border-[#1E3252] dark:bg-[#060D1A]">
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                  <input type="date" value={cpDueDate} onChange={(e) => setCpDueDate(e.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A]" />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300">Budget ({defaultCurrency})</label>
                  <input type="number" step="0.01" value={cpBudgetMajor} onChange={(e) => setCpBudgetMajor(e.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2.5 font-mono dark:border-[#1E3252] dark:bg-[#060D1A]" />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-[#1E3252]">
                <button type="button" onClick={() => setClientProjectModalClient(null)} className="h-9 rounded-md border border-slate-200 px-4 font-medium dark:border-[#1E3252]">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!cpCode.trim() || !cpName.trim() || createClientProjectMutation.isPending}
                  onClick={() => createClientProjectMutation.mutate()}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white disabled:opacity-40 dark:bg-sky-600"
                >
                  Launch Client Project
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === 'lead'
            ? 'Delete Lead'
            : deleteTarget?.kind === 'client'
              ? 'Delete Client Account'
              : deleteTarget?.kind === 'proposal'
                ? 'Delete Proposal'
                : 'Delete Contract'
        }
        description={
          deleteTarget?.kind === 'lead'
            ? `Permanently delete lead "${deleteTarget.item.organization_name}"?`
            : deleteTarget?.kind === 'client'
              ? `Permanently delete client "${deleteTarget.item.name}" along with its contacts and contracts?`
              : deleteTarget?.kind === 'proposal'
                ? `Permanently delete proposal "${deleteTarget.item.proposal_number} · ${deleteTarget.item.title}"?`
                : deleteTarget?.kind === 'contract'
                  ? `Permanently delete contract "${deleteTarget.item.contract_number} · ${deleteTarget.item.title}"?`
                  : ''
        }
        isPending={
          deleteLeadMutation.isPending ||
          deleteClientMutation.isPending ||
          deleteProposalMutation.isPending ||
          deleteContractMutation.isPending
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === 'lead') deleteLeadMutation.mutate(deleteTarget.item.id);
          else if (deleteTarget.kind === 'client') deleteClientMutation.mutate(deleteTarget.item.id);
          else if (deleteTarget.kind === 'proposal') deleteProposalMutation.mutate(deleteTarget.item.id);
          else deleteContractMutation.mutate(deleteTarget.item.id);
        }}
      />
    </div>
  );
}

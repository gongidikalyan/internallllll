import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Download,
  Edit3,
  FileText,
  FolderLock,
  HardDrive,
  Search,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import type { DocumentAccessScope, DocumentCategory, DocumentRecord } from '../../types/erp';
import { ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  policy: 'Company Policy',
  architecture: 'Architecture',
  product_spec: 'Product Spec',
  contract: 'Client Contract',
  finance: 'Finance',
  hr: 'People & HR',
  general: 'General',
};

const SCOPE_LABELS: Record<DocumentAccessScope, string> = {
  company: 'Company-Wide',
  business_unit: 'Business Unit',
  project: 'Project Scoped',
  restricted: 'Restricted',
};

const SCOPE_TONES: Record<DocumentAccessScope, 'nominal' | 'warning' | 'critical' | 'neutral'> = {
  company: 'nominal',
  business_unit: 'neutral',
  project: 'neutral',
  restricted: 'warning',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const documentMetadataSchema = z.object({
  title: z.string().min(2, 'Enter a document title.'),
  category: z.enum(['policy', 'architecture', 'product_spec', 'contract', 'finance', 'hr', 'general']),
  version_label: z.string().min(1, 'Enter a version label (e.g. 1.0).'),
  access_scope: z.enum(['company', 'business_unit', 'project', 'restricted']),
  business_unit_id: z.string().optional(),
  product_id: z.string().optional(),
  project_id: z.string().optional(),
});

type DocumentMetadataForm = z.infer<typeof documentMetadataSchema>;

export function DocumentsPage() {
  const { profile: currentUser, companyId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const canManage = hasPermission('documents.manage');

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [highlightedId, setHighlightedId] = useState<string | null>(searchParams.get('doc'));

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocumentRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    const pDoc = searchParams.get('doc');
    if (pDoc) setHighlightedId(pDoc);
  }, [searchParams]);

  const docsQuery = useQuery({
    queryKey: ['documents', companyId],
    queryFn: () => erpRepository.listDocuments(companyId!),
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

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => erpRepository.listProducts(companyId!),
    enabled: Boolean(companyId),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => erpRepository.listProjects(companyId!),
    enabled: Boolean(companyId),
  });

  const documents = docsQuery.data ?? [];
  const teamMembers = teamQuery.data ?? [];
  const businessUnits = buQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);
  const buMap = useMemo(() => new Map(businessUnits.map((b) => [b.id, b])), [businessUnits]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filteredDocuments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return documents.filter((doc) => {
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
      if (scopeFilter !== 'all' && doc.access_scope !== scopeFilter) return false;
      if (
        q &&
        !doc.title.toLowerCase().includes(q) &&
        !doc.version_label.toLowerCase().includes(q) &&
        !doc.storage_path.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [documents, categoryFilter, scopeFilter, searchTerm]);

  const kpis = useMemo(() => {
    const totalBytes = documents.reduce((acc, d) => acc + d.size_bytes, 0);
    const companyWide = documents.filter((d) => d.access_scope === 'company').length;
    const restricted = documents.filter((d) => d.access_scope === 'restricted').length;
    return {
      total: documents.length,
      companyWide,
      restricted,
      totalBytes,
    };
  }, [documents]);

  const uploadForm = useForm<DocumentMetadataForm>({
    resolver: zodResolver(documentMetadataSchema),
    defaultValues: {
      title: '',
      category: 'general',
      version_label: '1.0',
      access_scope: 'company',
      business_unit_id: '',
      product_id: '',
      project_id: '',
    },
  });

  const editForm = useForm<DocumentMetadataForm>({
    resolver: zodResolver(documentMetadataSchema),
  });

  const uploadMutation = useMutation({
    mutationFn: async (vals: DocumentMetadataForm) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      if (!selectedFile) throw new Error('Select a file to upload.');
      return erpRepository.uploadDocument(currentUser.id, companyId, {
        title: vals.title,
        category: vals.category,
        version_label: vals.version_label,
        access_scope: vals.access_scope,
        business_unit_id: vals.business_unit_id || null,
        product_id: vals.product_id || null,
        project_id: vals.project_id || null,
        file: selectedFile,
      });
    },
    onSuccess: async (doc) => {
      setActionError(null);
      setUploadModalOpen(false);
      setSelectedFile(null);
      uploadForm.reset();
      setHighlightedId(doc.id);
      setActionFeedback(`Uploaded "${doc.title}" (v${doc.version_label}) to private storage.`);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Document upload failed.'),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: DocumentMetadataForm) => {
      if (!currentUser || !companyId || !editingDoc) throw new Error('No document selected.');
      return erpRepository.updateDocumentMetadata(currentUser.id, companyId, {
        id: editingDoc.id,
        title: vals.title,
        category: vals.category,
        version_label: vals.version_label,
        access_scope: vals.access_scope,
        business_unit_id: vals.business_unit_id || null,
        product_id: vals.product_id || null,
        project_id: vals.project_id || null,
      });
    },
    onSuccess: async (doc) => {
      setActionError(null);
      setEditingDoc(null);
      setActionFeedback(`Updated "${doc.title}" to v${doc.version_label}.`);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Unable to update document.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: DocumentRecord) => {
      if (!currentUser || !companyId) throw new Error('Session unavailable.');
      await erpRepository.deleteDocument(currentUser.id, companyId, doc);
      return doc;
    },
    onSuccess: async (doc) => {
      setActionError(null);
      setDeletingDoc(null);
      if (highlightedId === doc.id) setHighlightedId(null);
      setActionFeedback(`Deleted "${doc.title}" from document repository.`);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => {
      setDeletingDoc(null);
      setActionError(err instanceof Error ? err.message : 'Unable to delete document.');
    },
  });

  const handleDownload = async (doc: DocumentRecord) => {
    if (!companyId) return;
    try {
      setActionError(null);
      const { url, fileName, isObjectUrl } = await erpRepository.getDocumentDownloadUrl(companyId, doc);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (isObjectUrl) {
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to retrieve signed download URL.');
    }
  };

  const openEditModal = (doc: DocumentRecord) => {
    setEditingDoc(doc);
    editForm.reset({
      title: doc.title,
      category: doc.category,
      version_label: doc.version_label,
      access_scope: doc.access_scope,
      business_unit_id: doc.business_unit_id ?? '',
      product_id: doc.product_id ?? '',
      project_id: doc.project_id ?? '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Knowledge &amp; Governance · Private Storage (`company-documents`) with Signed Access
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Documents
          </h1>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              uploadForm.reset({
                title: '',
                category: 'general',
                version_label: '1.0',
                access_scope: 'company',
                business_unit_id: '',
                product_id: '',
                project_id: '',
              });
              setUploadModalOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Document
          </button>
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

      {actionFeedback ? (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{actionFeedback}</span>
          <button type="button" onClick={() => setActionFeedback(null)} className="ml-4 font-medium underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Documents</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {kpis.total}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Company-Wide Policies &amp; Guides</span>
            <Shield className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {kpis.companyWide}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Restricted Files</span>
            <FolderLock className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {kpis.restricted}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Storage Footprint</span>
            <HardDrive className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatFileSize(kpis.totalBytes)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search documents by title, version, or storage path..."
            className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
        >
          <option value="all">All Categories</option>
          {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-100"
        >
          <option value="all">All Access Scopes</option>
          {(Object.keys(SCOPE_LABELS) as DocumentAccessScope[]).map((sc) => (
            <option key={sc} value={sc}>
              {SCOPE_LABELS[sc]}
            </option>
          ))}
        </select>
      </div>

      {/* Document Repository Table */}
      {filteredDocuments.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title="No documents in library"
          description="Upload company policies, technical architecture specs, contracts, or product documentation to private storage."
        />
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#1E3252] dark:bg-[#0C1729]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Document</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Version</th>
                  <th className="px-5 py-3 font-medium">Linked Context</th>
                  <th className="px-5 py-3 font-medium">Access Scope</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 text-right font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3252]">
                {filteredDocuments.map((doc) => {
                  const contextParts: string[] = [];
                  if (doc.business_unit_id && buMap.get(doc.business_unit_id)) {
                    contextParts.push(buMap.get(doc.business_unit_id)!.name);
                  }
                  if (doc.product_id && productMap.get(doc.product_id)) {
                    contextParts.push(productMap.get(doc.product_id)!.name);
                  }
                  if (doc.project_id && projectMap.get(doc.project_id)) {
                    contextParts.push(projectMap.get(doc.project_id)!.code);
                  }
                  const isHighlighted = highlightedId === doc.id;
                  return (
                    <tr
                      key={doc.id}
                      className={
                        isHighlighted
                          ? 'bg-sky-50/70 dark:bg-[#102542]'
                          : 'hover:bg-slate-50/70 dark:hover:bg-[#102038]'
                      }
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{doc.title}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {doc.mime_type || 'application/octet-stream'}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                        {CATEGORY_LABELS[doc.category]}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-800 dark:text-slate-200">
                        v{doc.version_label}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {contextParts.length > 0 ? contextParts.join(' · ') : 'Company General'}
                      </td>
                      <td className="px-5 py-3">
                        <StatusText tone={SCOPE_TONES[doc.access_scope]} label={SCOPE_LABELS[doc.access_scope]} />
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {memberMap.get(doc.owner_id)?.full_name ?? 'Owner'}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatFileSize(doc.size_bytes)}
                      </td>
                      <td className="px-5 py-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {doc.updated_at.slice(0, 10)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </button>
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(doc)}
                                className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
                              >
                                <Edit3 className="h-3 w-3" />
                                Version / Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingDoc(doc)}
                                className="inline-flex h-7 items-center gap-1 rounded border border-red-200 px-2.5 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
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
        </section>
      )}

      {/* Upload Document Modal */}
      {uploadModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Upload Document to Private Repository
              </h2>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={uploadForm.handleSubmit((vals) => uploadMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Select File
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    if (file && !uploadForm.getValues('title')) {
                      uploadForm.setValue('title', file.name.replace(/\.[^.]+$/, ''));
                    }
                  }}
                  className="block w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-[#0B3B66] file:px-3 file:py-1 file:text-xs file:font-medium file:text-white dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-200 dark:file:bg-sky-600"
                />
                {selectedFile ? (
                  <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedFile.name} · {formatFileSize(selectedFile.size)}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Document Title
                </label>
                <input
                  {...uploadForm.register('title')}
                  placeholder="Information Security Policy"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
                {uploadForm.formState.errors.title ? (
                  <p className="mt-1 text-red-600">{uploadForm.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    {...uploadForm.register('category')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Version</label>
                  <input
                    {...uploadForm.register('version_label')}
                    placeholder="1.0"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Access Scope
                  </label>
                  <select
                    {...uploadForm.register('access_scope')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    {(Object.keys(SCOPE_LABELS) as DocumentAccessScope[]).map((sc) => (
                      <option key={sc} value={sc}>
                        {SCOPE_LABELS[sc]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Business Unit
                  </label>
                  <select
                    {...uploadForm.register('business_unit_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="">None</option>
                    {businessUnits.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Product</label>
                  <select
                    {...uploadForm.register('product_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="">None</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Project</label>
                  <select
                    {...uploadForm.register('project_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
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

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploadMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Metadata / Version Modal */}
      {editingDoc && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Update Document Version &amp; Access
              </h2>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={editForm.handleSubmit((vals) => editMutation.mutate(vals))}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Document Title
                </label>
                <input
                  {...editForm.register('title')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    {...editForm.register('category')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Version</label>
                  <input
                    {...editForm.register('version_label')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Access Scope
                  </label>
                  <select
                    {...editForm.register('access_scope')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    {(Object.keys(SCOPE_LABELS) as DocumentAccessScope[]).map((sc) => (
                      <option key={sc} value={sc}>
                        {SCOPE_LABELS[sc]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Business Unit
                  </label>
                  <select
                    {...editForm.register('business_unit_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="">None</option>
                    {businessUnits.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Product</label>
                  <select
                    {...editForm.register('product_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
                  >
                    <option value="">None</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Project</label>
                  <select
                    {...editForm.register('project_id')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-slate-900 dark:border-[#1E3252] dark:bg-[#091221] dark:text-slate-100"
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

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="h-9 rounded-md border border-slate-200 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-300 dark:hover:bg-[#13233C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editMutation.isPending}
                  className="h-9 rounded-md bg-[#0B3B66] px-4 font-medium text-white hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {editMutation.isPending ? 'Saving...' : 'Save Metadata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deletingDoc)}
        title="Delete Document"
        description={
          deletingDoc
            ? `Permanently delete "${deletingDoc.title}" (v${deletingDoc.version_label}) and remove its stored file?`
            : ''
        }
        isPending={deleteMutation.isPending}
        onCancel={() => setDeletingDoc(null)}
        onConfirm={() => {
          if (deletingDoc) deleteMutation.mutate(deletingDoc);
        }}
      />
    </div>
  );
}

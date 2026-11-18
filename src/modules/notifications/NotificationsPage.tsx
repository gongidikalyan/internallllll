import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bell, CheckCheck, Megaphone, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { erpRepository } from '../../services/erpRepository';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusText } from '../../components/ui/StatusText';

const announcementSchema = z.object({
  title: z.string().min(3, 'Title is required.'),
  body: z.string().min(5, 'Announcement message is required.'),
  severity: z.enum(['info', 'advisory', 'urgent']),
  business_unit_id: z.string().optional(),
});

type AnnouncementForm = z.infer<typeof announcementSchema>;

export function NotificationsPage() {
  const { profile, companyId, hasPermission } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [announceOpen, setAnnounceOpen] = useState(false);

  const canPublishAnnouncement = hasPermission('settings.manage');

  const notificationsQuery = useQuery({
    queryKey: ['notifications', companyId, profile?.id],
    queryFn: () => erpRepository.listNotifications(companyId!, profile!.id),
    enabled: Boolean(companyId && profile?.id),
  });

  const announcementsQuery = useQuery({
    queryKey: ['announcements', companyId],
    queryFn: () => erpRepository.listAnnouncements(companyId!),
    enabled: Boolean(companyId),
  });

  const businessUnitsQuery = useQuery({
    queryKey: ['business_units', companyId],
    queryFn: () => erpRepository.listBusinessUnits(companyId!),
    enabled: Boolean(companyId),
  });

  const notifications = notificationsQuery.data ?? [];
  const announcements = announcementsQuery.data ?? [];
  const businessUnits = businessUnitsQuery.data ?? [];

  const visibleNotifications = useMemo(
    () => (filterMode === 'unread' ? notifications.filter((n) => !n.is_read) : notifications),
    [notifications, filterMode]
  );

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!companyId || !profile) return;
      await erpRepository.markNotificationRead(companyId, profile.id, notificationId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !profile) return;
      await erpRepository.markAllNotificationsRead(companyId, profile.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const announceForm = useForm<AnnouncementForm>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { title: '', body: '', severity: 'info', business_unit_id: '' },
  });

  const publishAnnouncementMutation = useMutation({
    mutationFn: async (vals: AnnouncementForm) => {
      if (!profile || !companyId) throw new Error('No active session.');
      return erpRepository.createAnnouncement(profile.id, companyId, {
        title: vals.title,
        body: vals.body,
        severity: vals.severity,
        business_unit_id: vals.business_unit_id || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setAnnounceOpen(false);
      announceForm.reset();
    },
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-[#1E3252]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Alerts & Communications · {notifications.filter((n) => !n.is_read).length} unread
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Notifications & Announcements
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.is_read) ? (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark All Read
            </button>
          ) : null}
          {canPublishAnnouncement ? (
            <button
              type="button"
              onClick={() => setAnnounceOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Publish Announcement
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Personal Notification Inbox */}
        <section className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              My Notifications
            </h2>
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-[#1E3252] dark:bg-[#091221]">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  filterMode === 'all' ? 'bg-white text-slate-900 dark:bg-[#0C1729] dark:text-white' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  filterMode === 'unread' ? 'bg-white text-slate-900 dark:bg-[#0C1729] dark:text-white' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Unread
              </button>
            </div>
          </div>

          {visibleNotifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Inbox clear"
              description="Task assignments, comments, role updates, and company announcements directed to you appear here."
            />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-[#1E3252] dark:border-[#1E3252] dark:bg-[#0C1729]">
              {visibleNotifications.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <StatusText
                        tone={n.is_read ? 'neutral' : 'nominal'}
                        label={n.is_read ? 'Read' : 'Unread'}
                      />
                      <span className="text-slate-400">·</span>
                      <span className="capitalize text-slate-500 dark:text-slate-400">{n.category}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{n.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
                    {n.link_path ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.is_read) markReadMutation.mutate(n.id);
                          navigate(n.link_path!);
                        }}
                        className="mt-2 text-xs font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                      >
                        Open linked record →
                      </button>
                    ) : null}
                  </div>
                  {!n.is_read ? (
                    <button
                      type="button"
                      onClick={() => markReadMutation.mutate(n.id)}
                      className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Company Announcements */}
        <section className="space-y-4 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Company Announcements
          </h2>
          {announcements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements published"
              description="Leadership broadcasts and operational advisories appear here."
            />
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <article
                  key={a.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#1E3252] dark:bg-[#0C1729]"
                >
                  <div className="flex items-center justify-between text-xs">
                    <StatusText
                      tone={a.severity === 'urgent' ? 'critical' : a.severity === 'advisory' ? 'warning' : 'neutral'}
                      label={a.severity.toUpperCase()}
                    />
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(a.published_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{a.body}</p>
                  <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Published by {a.author_name ?? 'Leadership'}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Publish Announcement Modal */}
      {announceOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#1E3252]">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Publish Company Announcement
              </h2>
              <button type="button" onClick={() => setAnnounceOpen(false)} className="rounded p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={announceForm.handleSubmit((vals) => publishAnnouncementMutation.mutate(vals))}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Title *</label>
                <input
                  {...announceForm.register('title')}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Severity</label>
                  <select
                    {...announceForm.register('severity')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="info">Info</option>
                    <option value="advisory">Advisory</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Target Unit</label>
                  <select
                    {...announceForm.register('business_unit_id')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                  >
                    <option value="">All Company</option>
                    {businessUnits.map((bu) => (
                      <option key={bu.id} value={bu.id}>{bu.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Message *</label>
                <textarea
                  rows={4}
                  {...announceForm.register('body')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs dark:border-[#1E3252] dark:bg-[#060D1A]"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
                <button type="button" onClick={() => setAnnounceOpen(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-medium dark:border-[#1E3252]">
                  Cancel
                </button>
                <button type="submit" disabled={publishAnnouncementMutation.isPending} className="h-9 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white dark:bg-sky-600">
                  {publishAnnouncementMutation.isPending ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

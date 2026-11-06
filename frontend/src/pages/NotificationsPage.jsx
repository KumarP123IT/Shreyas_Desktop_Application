import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Bell, Search, RotateCcw, Download, AlertCircle, MessageSquare, Mail,
  CheckCircle2, XCircle, Clock, ChevronRight, Trash2,
} from 'lucide-react';
import clsx from 'clsx';

import { notificationsApi } from '@/api/notifications';
import { customersApi } from '@/api/customers';
import PageHeader from '@/components/ui/PageHeader';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Pagination from '@/components/ui/Pagination';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

const STATUS_OPTIONS = ['sent', 'failed', 'snoozed', 'stopped', 'delivered'];
const CHANNEL_OPTIONS = ['whatsapp', 'email'];

const STATUS_META = {
  sent:      { label: 'Sent',      icon: CheckCircle2, cls: 'bg-green-100 text-success' },
  failed:    { label: 'Failed',    icon: XCircle,      cls: 'bg-red-100 text-error' },
  snoozed:   { label: 'Snoozed',   icon: Clock,        cls: 'bg-orange-100 text-warning' },
  stopped:   { label: 'Stopped',   icon: AlertCircle,  cls: 'bg-gray-200 text-text-secondary' },
  delivered: { label: 'Delivered', icon: CheckCircle2, cls: 'bg-blue-100 text-info' },
};

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.sent;
  const Icon = m.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', m.cls)}>
      <Icon size={11} aria-hidden="true" /> {m.label}
    </span>
  );
}

function ChannelIcon({ channel }) {
  return channel === 'email'
    ? <Mail size={14} className="text-info" aria-label="Email" />
    : <MessageSquare size={14} className="text-success" aria-label="WhatsApp" />;
}

export default function NotificationsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState({ channel: '', customerId: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [detail, setDetail] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ['customers', { page: 1, pageSize: 200 }],
    queryFn: () => customersApi.list({ pageSize: 200 }),
    select: (r) => r.data.data,
  });

  const params = useMemo(() => ({
    page, pageSize,
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59` } : {}),
  }), [filters, page]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', params],
    queryFn: () => notificationsApi.list(params),
    select: (r) => r.data,
  });

  const logs = data?.data ?? [];
  const meta = data?.meta ?? {};

  const retryMutation = useMutation({
    mutationFn: (id) => notificationsApi.retry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notification queued for retry');
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Retry failed'),
  });

  const clearMutation = useMutation({
    mutationFn: () => notificationsApi.clear({
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: `${filters.from}T00:00:00` } : {}),
      ...(filters.to ? { to: `${filters.to}T23:59:59` } : {}),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(`Cleared ${res.data?.data?.deleted ?? 0} notification record(s)`);
      setClearOpen(false);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Clear failed'),
  });

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const hasActiveFilters = !!(filters.channel || filters.customerId || filters.status || filters.from || filters.to);

  const exportCsv = async () => {
    try {
      const r = await notificationsApi.list({ ...params, page: 1, pageSize: 1000 });
      const rows = r.data.data ?? [];
      const header = ['Sent At', 'Channel', 'Recipient', 'Customer', 'Subject', 'Status', 'Error'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [header.join(',')];
      rows.forEach((n) => lines.push([
        n.sentAt ? format(new Date(n.sentAt), 'yyyy-MM-dd HH:mm') : '',
        n.channel, n.recipient,
        n.delivery?.customer?.name || '',
        n.subject || '', n.status, n.errorDetail || '',
      ].map(esc).join(',')));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `notifications_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} notifications`);
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Log of all WhatsApp and email notifications sent by the system."
        actions={
          <div className="flex items-center gap-2">
            <button
              className="fiori-btn-ghost flex items-center gap-1.5 text-error hover:bg-red-50 dark:hover:bg-red-500/10"
              onClick={() => setClearOpen(true)}
              disabled={!logs.length}
            >
              <Trash2 size={14} /> Clear
            </button>
            <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="fiori-card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="fiori-label" htmlFor="nf-channel">Channel</label>
          <select id="nf-channel" className="fiori-input w-36" value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)}>
            <option value="">All</option>
            {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c === 'whatsapp' ? 'WhatsApp' : 'Email'}</option>)}
          </select>
        </div>
        <div>
          <label className="fiori-label" htmlFor="nf-customer">Customer</label>
          <select id="nf-customer" className="fiori-input w-52" value={filters.customerId} onChange={(e) => setFilter('customerId', e.target.value)}>
            <option value="">All</option>
            {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="fiori-label" htmlFor="nf-status">Status</label>
          <select id="nf-status" className="fiori-input w-32" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
          </select>
        </div>
        <div>
          <label className="fiori-label" htmlFor="nf-from">From</label>
          <input id="nf-from" type="date" className="fiori-input w-36" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
        </div>
        <div>
          <label className="fiori-label" htmlFor="nf-to">To</label>
          <input id="nf-to" type="date" className="fiori-input w-36" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
        <div className="flex-1" />
        <span className="text-xs text-text-secondary pb-2">{meta.total ?? 0} records</span>
      </div>

      {/* Table */}
      <div className="fiori-card overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={8} cols={6} /></div>
        ) : isError ? (
          <div className="p-8 text-center text-error text-sm">Failed to load notifications.</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <Bell size={32} className="mx-auto text-text-secondary mb-2" />
            <p className="text-sm font-medium text-text">No notifications found</p>
            <p className="text-xs text-text-secondary mt-1">Adjust the filters or wait for reminders to fire.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-background border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Sent At</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Channel</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Recipient</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Customer</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((n) => (
                  <tr key={n.id} className="border-b border-border hover:bg-background/70">
                    <td className="px-3 py-2 whitespace-nowrap text-text-secondary">
                      {n.sentAt ? format(new Date(n.sentAt), 'dd MMM yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-3 py-2"><ChannelIcon channel={n.channel} /></td>
                    <td className="px-3 py-2 font-mono text-xs max-w-[180px] truncate" title={n.recipient}>{n.recipient}</td>
                    <td className="px-3 py-2">{n.delivery?.customer?.name || '—'}</td>
                    <td className="px-3 py-2"><StatusPill status={n.status} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          className="fiori-btn-ghost text-xs flex items-center gap-1"
                          onClick={() => setDetail(n)}
                          aria-label="View details"
                        >
                          <Search size={12} /> Details
                        </button>
                        {n.status === 'failed' && (
                          <button
                            className="fiori-btn-ghost text-xs text-primary flex items-center gap-1"
                            onClick={() => retryMutation.mutate(n.id)}
                            disabled={retryMutation.isPending}
                            aria-label="Retry notification"
                          >
                            <RotateCcw size={12} /> Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 pb-3">
          <Pagination page={page} totalPages={meta.totalPages || 1} onPage={setPage} />
        </div>
      </div>

      {/* Detail drawer (dialog) */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title="Notification Detail" size="lg"
        footer={<button className="fiori-btn-ghost" onClick={() => setDetail(null)}>Close</button>}
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="fiori-label">Channel</span><p className="flex items-center gap-1.5"><ChannelIcon channel={detail.channel} />{detail.channel}</p></div>
              <div><span className="fiori-label">Status</span><StatusPill status={detail.status} /></div>
              <div><span className="fiori-label">Recipient</span><p className="font-mono text-xs break-all">{detail.recipient}</p></div>
              <div><span className="fiori-label">Customer</span><p>{detail.delivery?.customer?.name || '—'}</p></div>
              <div><span className="fiori-label">Subject</span><p>{detail.subject || '—'}</p></div>
              <div><span className="fiori-label">Sent At</span><p>{detail.sentAt ? format(new Date(detail.sentAt), 'dd MMM yyyy HH:mm:ss') : '—'}</p></div>
            </div>
            {detail.errorDetail && (
              <div className="message-strip-error">
                <p className="font-semibold flex items-center gap-1"><AlertCircle size={14} /> Error</p>
                <p className="mt-1 text-xs whitespace-pre-wrap">{detail.errorDetail}</p>
              </div>
            )}
            <div>
              <span className="fiori-label">Message body</span>
              <pre className="mt-1 p-3 bg-background border border-border rounded-control text-xs whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">{detail.body}</pre>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => clearMutation.mutate()}
        title="Clear Notifications"
        message={hasActiveFilters
          ? 'Permanently delete all notification records matching the current filters? This cannot be undone.'
          : 'Permanently delete ALL notification records? This cannot be undone.'}
        confirmLabel="Clear All"
        danger
        loading={clearMutation.isPending}
      />
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth,
  isSameDay, addMonths, subMonths, parseISO,
} from 'date-fns';
import {
  Bell, CalendarDays, List, RotateCcw, AlertCircle, CheckCircle2, Clock,
  Ban, Send, ChevronLeft, ChevronRight, MessageSquare, Mail, Trash2,
} from 'lucide-react';
import clsx from 'clsx';

import { remindersApi } from '@/api/reminders';
import { customersApi } from '@/api/customers';
import PageHeader from '@/components/ui/PageHeader';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Pagination from '@/components/ui/Pagination';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

const STATUS_META = {
  pending:   { label: 'Scheduled', icon: Clock,        cls: 'bg-blue-100 text-info' },
  sending:   { label: 'Sending',   icon: Send,         cls: 'bg-blue-100 text-info' },
  sent:      { label: 'Sent',      icon: CheckCircle2, cls: 'bg-green-100 text-success' },
  failed:    { label: 'Failed',    icon: AlertCircle,  cls: 'bg-red-100 text-error' },
  snoozed:   { label: 'Snoozed',   icon: Clock,        cls: 'bg-orange-100 text-warning' },
  stopped:   { label: 'Stopped',   icon: Ban,          cls: 'bg-gray-200 text-text-secondary' },
  delivered: { label: 'Delivered', icon: CheckCircle2, cls: 'bg-green-100 text-success' },
};

const STATUS_OPTIONS = Object.keys(STATUS_META);

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  const Icon = m.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap', m.cls)}>
      <Icon size={11} aria-hidden="true" /> {m.label}
    </span>
  );
}

function ChannelBadge({ channel }) {
  return channel === 'email'
    ? <span className="inline-flex items-center gap-1 text-xs text-info"><Mail size={12} /> Email</span>
    : <span className="inline-flex items-center gap-1 text-xs text-success"><MessageSquare size={12} /> WhatsApp</span>;
}

export default function RemindersPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState('list'); // list | calendar
  const [filters, setFilters] = useState({ customerId: '', status: '' });
  const [page, setPage] = useState(1);
  const [calMonth, setCalMonth] = useState(new Date());
  const [calSelected, setCalSelected] = useState(null); // Date for day detail
  const [restartTarget, setRestartTarget] = useState(null); // delivery
  const [clearOpen, setClearOpen] = useState(false);
  const pageSize = 20;

  const { data: customers } = useQuery({
    queryKey: ['customers', { page: 1, pageSize: 200 }],
    queryFn: () => customersApi.list({ pageSize: 200 }),
    select: (r) => r.data.data,
  });

  // For calendar we fetch a wide window; for list we paginate.
  const listParams = useMemo(() => ({
    page, pageSize,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  }), [filters, page]);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['reminders', 'list', listParams],
    queryFn: () => remindersApi.list(listParams),
    select: (r) => r.data,
    enabled: view === 'list',
  });

  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const { data: calData } = useQuery({
    queryKey: ['reminders', 'cal', format(monthStart, 'yyyy-MM'), filters.customerId, filters.status],
    queryFn: () => remindersApi.list({
      page: 1, pageSize: 500,
      from: monthStart.toISOString(), to: monthEnd.toISOString(),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }),
    select: (r) => r.data.data,
    enabled: view === 'calendar',
  });

  const reminders = view === 'list' ? (listData?.data ?? []) : (calData ?? []);
  const meta = listData?.meta ?? {};

  const restartMutation = useMutation({
    mutationFn: (deliveryId) => remindersApi.restart(deliveryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      toast.success('Reminders restarted for this delivery');
      setRestartTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Restart failed'),
  });

  const clearMutation = useMutation({
    mutationFn: () => remindersApi.clear({
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(`Cleared ${res.data?.data?.deleted ?? 0} reminder record(s)`);
      setClearOpen(false);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Clear failed'),
  });

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const byDay = useMemo(() => {
    const map = {};
    (calData || []).forEach((r) => {
      const d = format(new Date(r.runAt), 'yyyy-MM-dd');
      (map[d] = map[d] || []).push(r);
    });
    return map;
  }, [calData]);

  const calDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthStart, monthEnd]);

  const dayReminders = calSelected ? (byDay[format(calSelected, 'yyyy-MM-dd')] || []) : [];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="Reminders"
        subtitle="Scheduled WhatsApp and email reminders for active deliveries."
        actions={
          <div className="flex items-center gap-2">
            <button
              className="fiori-btn-ghost flex items-center gap-1.5 text-error hover:bg-red-50 dark:hover:bg-red-500/10"
              onClick={() => setClearOpen(true)}
              disabled={reminders.length === 0}
            >
              <Trash2 size={14} /> Clear
            </button>
            <div className="flex rounded-control border border-border overflow-hidden" role="group" aria-label="View mode">
            <button
              className={clsx('flex items-center gap-1.5 px-3 py-2 text-sm', view === 'list' ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-background')}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <List size={14} /> List
            </button>
            <button
              className={clsx('flex items-center gap-1.5 px-3 py-2 text-sm', view === 'calendar' ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-background')}
              onClick={() => setView('calendar')}
              aria-pressed={view === 'calendar'}
            >
              <CalendarDays size={14} /> Calendar
            </button>
            </div>
          </div>
        }
      />

      {/* Filters */}
      <div className="fiori-card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="fiori-label" htmlFor="rf-customer">Customer</label>
          <select id="rf-customer" className="fiori-input w-56" value={filters.customerId} onChange={(e) => setFilter('customerId', e.target.value)}>
            <option value="">All customers</option>
            {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="fiori-label" htmlFor="rf-status">Status</label>
          <select id="rf-status" className="fiori-input w-36" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-text-secondary pb-2">{view === 'list' ? `${meta.total ?? 0} reminders` : `${(calData || []).length} this month`}</span>
      </div>

      {view === 'list' ? (
        <div className="fiori-card overflow-hidden">
          {isLoading ? (
            <div className="p-4"><SkeletonTable rows={8} cols={6} /></div>
          ) : reminders.length === 0 ? (
            <div className="p-10 text-center">
              <Bell size={32} className="mx-auto text-text-secondary mb-2" />
              <p className="text-sm font-medium text-text">No reminders found</p>
              <p className="text-xs text-text-secondary mt-1">Activate a delivery to schedule reminders.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="bg-background border-b border-border text-left">
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Scheduled For</th>
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Customer</th>
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Forecast</th>
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Scope</th>
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Channel</th>
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminders.map((r) => (
                      <tr key={r.id} className="border-b border-border hover:bg-background/70">
                        <td className="px-3 py-2 whitespace-nowrap font-medium">
                          {format(new Date(r.runAt), 'dd MMM yyyy HH:mm')}
                        </td>
                        <td className="px-3 py-2">{r.delivery?.customer?.name || '—'}</td>
                        <td className="px-3 py-2 text-text-secondary">{r.delivery?.forecastMonth || '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.deliveryItem
                            ? <span className="font-mono">{r.deliveryItem.partNumber}</span>
                            : <span className="text-text-secondary">Whole delivery</span>}
                        </td>
                        <td className="px-3 py-2"><ChannelBadge channel={r.channel} /></td>
                        <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                        <td className="px-3 py-2">
                          {(r.status === 'pending' || r.status === 'snoozed') && r.deliveryId && (
                            <button
                              className="fiori-btn-ghost text-xs flex items-center gap-1"
                              onClick={() => setRestartTarget(r.delivery)}
                              aria-label="Restart reminders for this delivery"
                            >
                              <RotateCcw size={12} /> Restart
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-3">
                <Pagination page={page} totalPages={meta.totalPages || 1} onPage={setPage} />
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── Calendar view ── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="fiori-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <button className="fiori-btn-ghost px-2" onClick={() => setCalMonth(subMonths(calMonth, 1))} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-base font-semibold text-text">{format(calMonth, 'MMMM yyyy')}</h2>
              <button className="fiori-btn-ghost px-2" onClick={() => setCalMonth(addMonths(calMonth, 1))} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-text-secondary mb-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayList = byDay[key] || [];
                const inMonth = isSameMonth(day, calMonth);
                const isToday = isSameDay(day, new Date());
                const isSel = calSelected && isSameDay(day, calSelected);
                return (
                  <button
                    key={key}
                    onClick={() => setCalSelected(day)}
                    className={clsx(
                      'min-h-[64px] p-1 rounded-control border text-left transition-colors',
                      inMonth ? 'bg-surface border-border' : 'bg-background/50 border-transparent text-text-secondary/50',
                      isToday && 'ring-2 ring-primary',
                      isSel && 'border-primary bg-primary/5'
                    )}
                    aria-label={`${format(day, 'dd MMM yyyy')}: ${dayList.length} reminders`}
                    aria-pressed={!!isSel}
                  >
                    <span className={clsx('text-xs font-semibold', isToday && 'text-primary')}>{format(day, 'd')}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayList.slice(0, 3).map((r) => (
                        <div key={r.id} className={clsx('text-[10px] leading-tight px-1 py-0.5 rounded truncate',
                          r.status === 'failed' ? 'bg-red-100 text-error' :
                          r.status === 'sent' || r.status === 'delivered' ? 'bg-green-100 text-success' :
                          'bg-blue-100 text-info')}>
                          {format(new Date(r.runAt), 'HH:mm')} {r.delivery?.customer?.name?.split(' ')[0] || ''}
                        </div>
                      ))}
                      {dayList.length > 3 && <div className="text-[10px] text-text-secondary">+{dayList.length - 3} more</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day detail */}
          <div className="fiori-card p-4">
            <h3 className="text-sm font-semibold text-text mb-3">
              {calSelected ? format(calSelected, 'EEEE, dd MMM yyyy') : 'Select a day'}
            </h3>
            {!calSelected ? (
              <p className="text-sm text-text-secondary">Click a day to see its reminders.</p>
            ) : dayReminders.length === 0 ? (
              <p className="text-sm text-text-secondary">No reminders scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {dayReminders.map((r) => (
                  <li key={r.id} className="border border-border rounded-control p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{r.delivery?.customer?.name || '—'}</span>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                      <ChannelBadge channel={r.channel} />
                      <span>{r.delivery?.forecastMonth}</span>
                      <span>{format(new Date(r.runAt), 'HH:mm')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Restart confirm */}
      <ConfirmDialog
        open={!!restartTarget}
        onClose={() => setRestartTarget(null)}
        onConfirm={() => restartMutation.mutate(restartTarget?.id)}
        title="Restart Reminders"
        message={`Stop all pending reminders for "${restartTarget?.customer?.name || 'this delivery'}" (${restartTarget?.forecastMonth || ''}) and regenerate the schedule?`}
        confirmLabel="Restart"
        loading={restartMutation.isPending}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => clearMutation.mutate()}
        title="Clear Reminders"
        message={filters.customerId || filters.status
          ? 'Permanently delete all reminder records matching the current filters? Pending reminders will stop firing. This cannot be undone.'
          : 'Permanently delete ALL reminder records? Pending reminders will stop firing and this cannot be undone.'}
        confirmLabel="Clear All"
        danger
        loading={clearMutation.isPending}
      />
    </div>
  );
}

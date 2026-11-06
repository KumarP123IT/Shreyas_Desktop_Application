/**
 * Delivery Object Page – SAP Fiori Horizon redesign
 * Tabs: Customer · Forecast · Materials · MSL Monitor · Schedule · Alert Config · History
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, RefreshCw, Calendar, Bell, Download,
  TrendingDown, TrendingUp, CheckCircle2, HelpCircle, AlertTriangle,
  Mail, MessageSquare, Clock, Zap, Building2, FileText,
  Package, Info, XCircle, CheckCircle, Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { format, differenceInDays } from 'date-fns';

import { deliveriesApi, forecastsApi } from '@/api/forecasts';
import { remindersApi } from '@/api/reminders';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { ConfirmDialog } from '@/components/ui/Dialog';
import MaterialSheet from './MaterialSheet';

const TABS = [
  { id: 'customer',  label: 'Customer',      icon: Building2   },
  { id: 'forecast',  label: 'Forecast',       icon: FileText    },
  { id: 'materials', label: 'Material Sheet', icon: Package     },
  { id: 'msl',       label: 'MSL Monitor',    icon: TrendingDown },
  { id: 'schedule',  label: 'Schedule',       icon: Calendar    },
  { id: 'alerts',    label: 'Alert Config',   icon: Bell        },
  { id: 'history',   label: 'History',        icon: Clock       },
];

export default function DeliveryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('msl');
  const [reapplyOpen, setReapplyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deliveryId = parseInt(id);

  const { data: delivery, isLoading } = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => deliveriesApi.getOne(deliveryId),
    select: (r) => r.data.data,
  });

  const { data: mslSummary } = useQuery({
    queryKey: ['delivery-msl', deliveryId],
    queryFn: () => deliveriesApi.mslSummary(deliveryId),
    select: (r) => r.data.data,
    enabled: !!delivery,
  });

  const reapplyMutation = useMutation({
    mutationFn: () => deliveriesApi.reapplyDefaults(deliveryId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['delivery', deliveryId] });
      qc.invalidateQueries({ queryKey: ['delivery-msl', deliveryId] });
      toast.success(`Re-applied defaults to ${res.data.data.updatedCount} parts`);
      setReapplyOpen(false);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deliveriesApi.remove(deliveryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      toast.success('Delivery record deleted');
      navigate('/deliveries');
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to delete delivery'),
  });

  if (isLoading) return (
    <div className="max-w-6xl mx-auto">
      <div className="skeleton h-6 w-48 mb-6" />
      <SkeletonTable rows={6} cols={4} />
    </div>
  );

  if (!delivery) return (
    <div className="text-center py-16">
      <p className="text-text-secondary">Delivery not found.</p>
      <button className="fiori-btn-secondary mt-3" onClick={() => navigate('/deliveries')}>Back</button>
    </div>
  );

  const daysLeft = delivery.dueDate
    ? differenceInDays(new Date(delivery.dueDate), new Date())
    : null;
  const hasBreaches = (mslSummary?.BELOW_MIN ?? 0) + (mslSummary?.ABOVE_MAX ?? 0) > 0;
  const dueDateColor =
    daysLeft === null ? 'text-text-secondary' :
    daysLeft < 0     ? 'text-error font-bold' :
    daysLeft <= 3    ? 'text-warning font-semibold' : 'text-text-secondary';

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        breadcrumb="Deliveries"
        title={`${delivery.customer?.name} — ${delivery.forecastMonth}`}
        subtitle={`${delivery.items?.length ?? 0} parts · ${delivery.forecast?.fileName}`}
        actions={
          <>
            <button className="fiori-btn-ghost flex items-center gap-1.5" onClick={() => navigate('/deliveries')}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="fiori-btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setReapplyOpen(true)}>
              <RefreshCw size={14} /> Re-apply Defaults
            </button>
            <button
              className="fiori-btn-ghost flex items-center gap-1.5 text-sm text-error hover:bg-red-50 dark:hover:bg-red-500/10"
              onClick={() => setDeleteOpen(true)}
              title="Delete this delivery record"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        }
      />

      {/* Status / KPI bar */}
      <div className={clsx('fiori-card p-4 flex flex-wrap items-center gap-4', hasBreaches && 'border-l-4 border-l-error')}>
        <span className={clsx(
          'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide',
          delivery.status === 'active'    ? 'bg-green-100 text-success' :
          delivery.status === 'delivered' ? 'bg-blue-100 text-info' :
          'bg-gray-100 text-text-secondary'
        )}>{delivery.status}</span>

        {mslSummary && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: 'BELOW_MIN',      icon: TrendingDown, color: 'text-error',         bg: 'bg-red-100',    label: 'Below MIN' },
              { key: 'NORMAL',         icon: CheckCircle2, color: 'text-success',        bg: 'bg-green-100',  label: 'Normal' },
              { key: 'ABOVE_MAX',      icon: TrendingUp,   color: 'text-warning',        bg: 'bg-orange-100', label: 'Above MAX' },
              { key: 'NOT_CONFIGURED', icon: HelpCircle,   color: 'text-text-secondary', bg: 'bg-gray-100',   label: 'Not set' },
            ].map(({ key, icon: Icon, color, bg, label }) => (
              <button key={key}
                className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold hover:opacity-80 transition-opacity', bg, color)}
                onClick={() => setActiveTab('msl')} title={`View ${label} parts`}>
                <Icon size={11} />
                <span className="font-bold">{mslSummary[key] ?? 0}</span>
                <span className="opacity-75">{label}</span>
              </button>
            ))}
          </div>
        )}

        <div className={clsx('ml-auto text-xs flex items-center gap-1.5', dueDateColor)}>
          <Calendar size={13} />
          {delivery.dueDate ? (
            <span>Due: {format(new Date(delivery.dueDate), 'dd MMM yyyy')}
              {daysLeft !== null && <span className="ml-1 opacity-75">
                ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
              </span>}
            </span>
          ) : (
            <span className="text-text-secondary">No due date — set one in Schedule</span>
          )}
        </div>
      </div>

      {/* Anchor tabs */}
      <div className="flex gap-0 overflow-x-auto border-b border-border" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id}
              className={clsx(
                'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'
              )}
              onClick={() => setActiveTab(tab.id)}>
              <Icon size={13} aria-hidden="true" />
              {tab.label}
              {tab.id === 'msl' && hasBreaches && (
                <span className="absolute top-1.5 right-1 w-2 h-2 bg-error rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      <div className="fiori-card p-5">
        {activeTab === 'customer'  && <CustomerTab  customer={delivery.customer} />}
        {activeTab === 'forecast'  && <ForecastTab  delivery={delivery} />}
        {activeTab === 'materials' && <MaterialSheet delivery={delivery} />}
        {activeTab === 'msl'       && <MslMonitorTab items={delivery.items} mslSummary={mslSummary} />}
        {activeTab === 'schedule'  && <ScheduleTab  delivery={delivery} deliveryId={deliveryId} />}
        {activeTab === 'alerts'    && <AlertsTab    delivery={delivery} deliveryId={deliveryId} />}
        {activeTab === 'history'   && <HistoryTab   logs={delivery.notificationLogs} />}
      </div>

      <ConfirmDialog
        open={reapplyOpen}
        onClose={() => setReapplyOpen(false)}
        onConfirm={() => reapplyMutation.mutate()}
        title="Re-apply Current MSL Defaults"
        message="This will overwrite the snapshotted min/max for all parts in this delivery with the current configured defaults. This action is logged. Continue?"
        confirmLabel="Re-apply Defaults"
        loading={reapplyMutation.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Delivery Record"
        message={`Delete the delivery record for "${delivery.customer?.name} — ${delivery.forecastMonth}"? This will remove it from the list and stop its pending reminders. This cannot be undone from the app.`}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── CustomerTab ───────────────────────────────────────────────────────────────
function CustomerTab({ customer }) {
  if (!customer) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-text">Customer Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          ['Company Name',   customer.name],
          ['Supplier Code',  customer.supplierCode],
          ['Contact Person', customer.contactName  || '—'],
          ['Email',          customer.contactEmail || '—'],
          ['WhatsApp',       customer.contactWhatsapp || '—'],
          ['Notes',          customer.notes || '—'],
        ].map(([k, v]) => (
          <div key={k} className="bg-background rounded-control p-3 border border-border">
            <p className="fiori-label mb-1">{k}</p>
            <p className="text-sm font-medium text-text break-words">{v}</p>
          </div>
        ))}
      </div>
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-control">
        <p className="text-xs font-semibold text-info mb-2 flex items-center gap-1.5">
          <Bell size={13} /> Notification Channels
        </p>
        <div className="flex items-center gap-3">
          <ChannelChip enabled={customer.notifyWhatsapp} label="WhatsApp" icon={MessageSquare} />
          <ChannelChip enabled={customer.notifyEmail}    label="Email"     icon={Mail} />
        </div>
      </div>
    </div>
  );
}

function ChannelChip({ enabled, label, icon: Icon }) {
  return (
    <div className={clsx(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
      enabled ? 'bg-green-100 text-success' : 'bg-gray-100 text-text-secondary'
    )}>
      <Icon size={12} /> {label}: {enabled ? 'Enabled' : 'Disabled'}
    </div>
  );
}

// ── ForecastTab ───────────────────────────────────────────────────────────────
function ForecastTab({ delivery }) {
  const toast = useToast();
  const handleDownload = async () => {
    try {
      const res = await forecastsApi.download(delivery.forecastId);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = delivery.forecast?.fileName || 'forecast';
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download original file'); }
  };
  const confidence = delivery.forecast?.parserConfidence ?? 0;
  const pct = Math.round(confidence * 100);
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-text">Forecast Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          ['Forecast Month', delivery.forecastMonth],
          ['Sent Date',  delivery.forecast?.sentDate ? format(new Date(delivery.forecast.sentDate), 'dd MMM yyyy') : '—'],
          ['Uploaded',   delivery.forecast?.uploadedAt ? format(new Date(delivery.forecast.uploadedAt), 'dd MMM yyyy') : '—'],
          ['Version',    `v${delivery.forecast?.version || 1}`],
          ['File Name',  delivery.forecast?.fileName || '—'],
          ['File Type',  (delivery.forecast?.fileType || '—').toUpperCase()],
        ].map(([k, v]) => (
          <div key={k} className="bg-background rounded-control p-3 border border-border">
            <p className="fiori-label mb-1">{k}</p>
            <p className="text-sm font-medium text-text truncate" title={String(v)}>{v}</p>
          </div>
        ))}
      </div>
      {confidence > 0 && (
        <div className="p-3 bg-background border border-border rounded-control max-w-sm">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-semibold text-text-secondary">Parser Confidence</span>
            <span className={clsx('text-sm font-bold', pct >= 90 ? 'text-success' : pct >= 70 ? 'text-info' : 'text-warning')}>{pct}%</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full', pct >= 90 ? 'bg-success' : pct >= 70 ? 'bg-info' : 'bg-warning')} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <button className="fiori-btn-secondary flex items-center gap-1.5 text-sm" onClick={handleDownload}>
        <Download size={14} /> Download Original File
      </button>
    </div>
  );
}

// ── MslMonitorTab ─────────────────────────────────────────────────────────────
function MslMonitorTab({ items = [], mslSummary }) {
  const [filter, setFilter] = useState('ALL');
  const filters = [
    { id: 'ALL',            label: 'All',       count: items.length,                    chip: 'bg-background border border-border text-text-secondary' },
    { id: 'BELOW_MIN',      label: 'Below MIN', count: mslSummary?.BELOW_MIN ?? 0,      chip: 'bg-red-100 text-error' },
    { id: 'NORMAL',         label: 'Normal',    count: mslSummary?.NORMAL ?? 0,         chip: 'bg-green-100 text-success' },
    { id: 'ABOVE_MAX',      label: 'Above MAX', count: mslSummary?.ABOVE_MAX ?? 0,      chip: 'bg-orange-100 text-warning' },
    { id: 'NOT_CONFIGURED', label: 'Not Set',   count: mslSummary?.NOT_CONFIGURED ?? 0, chip: 'bg-gray-100 text-text-secondary' },
  ];
  const displayed = filter === 'ALL' ? items : items.filter((i) => i.mslStatus === filter);
  const breachCount = (mslSummary?.BELOW_MIN ?? 0) + (mslSummary?.ABOVE_MAX ?? 0);

  return (
    <div className="space-y-4">
      {breachCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-control">
          <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-error">{breachCount} part{breachCount !== 1 ? 's' : ''} require immediate attention</p>
            <p className="text-xs text-red-700 mt-0.5">
              {mslSummary?.BELOW_MIN > 0 && `${mslSummary.BELOW_MIN} below minimum`}
              {mslSummary?.BELOW_MIN > 0 && mslSummary?.ABOVE_MAX > 0 && ' · '}
              {mslSummary?.ABOVE_MAX > 0 && `${mslSummary.ABOVE_MAX} above maximum`}
              {' — WhatsApp/email breach alerts fire automatically.'}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="MSL status filter">
        {filters.map((f) => (
          <button key={f.id}
            className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all', f.chip,
              filter === f.id ? 'ring-2 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-100')}
            onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
            {f.label} <span className="font-bold">{f.count}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto border border-border rounded-control">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-background border-b border-border text-left">
              {['Part Number','Part Name','Total Qty','Min','Max','Source','Status'].map((h) => (
                <th key={h} className={clsx('px-3 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wide',
                  h === 'Total Qty' ? 'text-right' : h === 'Min' || h === 'Max' ? 'text-center' : '')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((item) => (
              <tr key={item.id} className={clsx('border-b border-border',
                item.mslStatus === 'BELOW_MIN' ? 'bg-red-50/60 hover:bg-red-50' :
                item.mslStatus === 'ABOVE_MAX' ? 'bg-orange-50/60 hover:bg-orange-50' : 'hover:bg-background/50')}>
                <td className="px-3 py-2.5 font-mono text-xs font-semibold">{item.partNumber}</td>
                <td className="px-3 py-2.5">
                  <p className="text-text">{item.partName}</p>
                  {item.needsReview && <span className="text-[10px] text-warning font-semibold flex items-center gap-1 mt-0.5"><AlertTriangle size={9} /> Needs review</span>}
                </td>
                <td className="px-3 py-2.5 text-right"><MslQtyBar item={item} /></td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-text-secondary">{item.snapshotMinQty ?? '—'}</td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-text-secondary">{item.snapshotMaxQty ?? '—'}</td>
                <td className="px-3 py-2.5"><SourceBadge source={item.snapshotSource} /></td>
                <td className="px-3 py-2.5"><MslStatusBadge status={item.mslStatus} /></td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-text-secondary text-sm">No items match the selected filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MslQtyBar({ item }) {
  const { totalQty: qty, snapshotMinQty: min, snapshotMaxQty: max, mslStatus } = item;
  if (mslStatus === 'NOT_CONFIGURED' || min == null)
    return <span className="font-mono font-semibold text-text">{qty}</span>;
  const range = max - min;
  const pct = range > 0 ? Math.min(100, Math.max(0, ((qty - min) / range) * 100)) : 0;
  const barColor = mslStatus === 'BELOW_MIN' ? 'bg-error' : mslStatus === 'ABOVE_MAX' ? 'bg-warning' : 'bg-success';
  return (
    <div className="flex flex-col items-end gap-1 min-w-[80px]">
      <span className={clsx('font-mono font-bold text-sm',
        mslStatus === 'BELOW_MIN' ? 'text-error' : mslStatus === 'ABOVE_MAX' ? 'text-warning' : 'text-text')}>{qty}</span>
      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MslStatusBadge({ status }) {
  const MAP = {
    BELOW_MIN:      { cls: 'bg-red-100 text-error',           icon: TrendingDown,  label: 'Below MIN' },
    ABOVE_MAX:      { cls: 'bg-orange-100 text-warning',      icon: TrendingUp,    label: 'Above MAX' },
    NORMAL:         { cls: 'bg-green-100 text-success',       icon: CheckCircle2,  label: 'Normal' },
    NOT_CONFIGURED: { cls: 'bg-gray-100 text-text-secondary', icon: HelpCircle,    label: 'Not Set' },
  };
  const m = MAP[status] || MAP.NOT_CONFIGURED;
  const Icon = m.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', m.cls)}>
      <Icon size={11} /> {m.label}
    </span>
  );
}

function SourceBadge({ source }) {
  const MAP = {
    part:     { cls: 'bg-blue-100 text-info',           label: 'Part' },
    customer: { cls: 'bg-purple-100 text-purple-700',   label: 'Customer' },
    global:   { cls: 'bg-gray-100 text-text-secondary', label: 'Global' },
  };
  const m = MAP[source];
  if (!m) return <span className="text-text-secondary text-xs">—</span>;
  return <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold', m.cls)}>{m.label}</span>;
}

// ── ScheduleTab ───────────────────────────────────────────────────────────────
function ScheduleTab({ delivery, deliveryId }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [startDate, setStartDate] = useState(
    delivery.startDate ? new Date(delivery.startDate).toISOString().split('T')[0] : ''
  );
  const [dueDate, setDueDate] = useState(
    delivery.dueDate ? new Date(delivery.dueDate).toISOString().split('T')[0] : ''
  );
  const mutation = useMutation({
    mutationFn: (data) => deliveriesApi.updateSchedule(deliveryId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery', deliveryId] }); toast.success('Schedule saved — reminders will be regenerated'); },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to save'),
  });
  const valid = !startDate || !dueDate || new Date(dueDate) >= new Date(startDate);
  const daysLeft = dueDate ? differenceInDays(new Date(dueDate), new Date()) : null;
  return (
    <div className="space-y-5 max-w-md">
      <h3 className="text-sm font-bold text-text">Delivery Schedule</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="fiori-label" htmlFor="sched-start">Start Date</label>
          <input id="sched-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="fiori-input" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="sched-due">
            Due Date
            {daysLeft !== null && (
              <span className={clsx('ml-2 normal-case font-normal text-xs',
                daysLeft < 0 ? 'text-error' : daysLeft <= 3 ? 'text-warning' : 'text-text-secondary')}>
                ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
              </span>
            )}
          </label>
          <input id="sched-due" type="date" value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className={clsx('fiori-input', !valid ? 'border-error' : '')} />
          {!valid && <p className="text-xs text-error mt-1">Due date must be on or after start date</p>}
        </div>
      </div>
      {dueDate && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-control text-xs text-info">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>Setting a due date auto-generates reminders at <strong>10, 5, 3 and 1 day(s)</strong> before at <strong>9:00 AM IST</strong>. Customise in Alert Config.</span>
        </div>
      )}
      <button className="fiori-btn-primary flex items-center gap-1.5"
        onClick={() => mutation.mutate({ startDate: startDate || null, dueDate: dueDate || null })}
        disabled={!valid || mutation.isPending}>
        {mutation.isPending
          ? <><span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
          : <><Calendar size={14} /> Save Schedule</>}
      </button>
    </div>
  );
}

// ── AlertsTab ─────────────────────────────────────────────────────────────────
function AlertsTab({ delivery, deliveryId }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [notifyWa,    setNotifyWa]    = useState(delivery.notifyWhatsapp ?? true);
  const [notifyEmail, setNotifyEmail] = useState(delivery.notifyEmail    ?? true);
  const [offsets,     setOffsets]     = useState((delivery.reminderOffsets || [10,5,3,1]).join(', '));
  const [generating,  setGenerating]  = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data) => deliveriesApi.updateSchedule(deliveryId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery', deliveryId] }); toast.success('Alert config saved'); },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to save'),
  });

  const parseOffsets = (str) => str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);

  const handleSave = () => {
    const parsed = parseOffsets(offsets);
    if (!parsed.length) return toast.error('Enter at least one valid offset (e.g. "10, 5, 3, 1")');
    saveMutation.mutate({ notifyWhatsapp: notifyWa, notifyEmail, reminderOffsets: parsed });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await remindersApi.generate(deliveryId);
      qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder schedule regenerated');
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Failed to regenerate');
    } finally { setGenerating(false); }
  };

  const currentOffsets = parseOffsets(offsets).sort((a,b) => b-a);

  return (
    <div className="space-y-6 max-w-lg">
      <h3 className="text-sm font-bold text-text">Alert Configuration</h3>

      <div>
        <p className="fiori-label mb-2">Notification Channels</p>
        <div className="space-y-2">
          <ChannelToggle icon={MessageSquare} label="WhatsApp Reminders"
            desc="Recipients can reply 1 (snooze), 2 (reschedule), or 3 (mark delivered)."
            enabled={notifyWa} onToggle={() => setNotifyWa(v => !v)}
            activeColor="text-success" activeBg="bg-green-50 border-green-200" />
          <ChannelToggle icon={Mail} label="Email Reminders"
            desc="Sends HTML email alerts to the configured recipient."
            enabled={notifyEmail} onToggle={() => setNotifyEmail(v => !v)}
            activeColor="text-info" activeBg="bg-blue-50 border-blue-200" />
        </div>
      </div>

      <div>
        <label className="fiori-label" htmlFor="alert-offsets">Reminder Days Before Due Date</label>
        <input id="alert-offsets" type="text" value={offsets}
          onChange={e => setOffsets(e.target.value)}
          placeholder="10, 5, 3, 1" className="fiori-input" />
        <p className="text-xs text-text-secondary mt-1">Comma-separated numbers. e.g. "10, 5, 3, 1"</p>
        {currentOffsets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {currentOffsets.map(d => (
              <span key={d} className="px-2 py-0.5 bg-blue-50 text-info border border-blue-200 rounded-full text-xs font-semibold">{d}d before due</span>
            ))}
          </div>
        )}
      </div>

      <div className="p-3.5 bg-background border border-border rounded-control space-y-2">
        <p className="text-xs font-bold text-text flex items-center gap-1.5"><Bell size={13} className="text-primary" /> How reminders work</p>
        <div className="space-y-1.5 text-xs text-text-secondary">
          <p>• Reminders fire at <strong className="text-text">09:00 AM IST</strong> on each scheduled day</p>
          <p>• WhatsApp: reply <strong className="text-text">1</strong> snooze · <strong className="text-text">2</strong> reschedule · <strong className="text-text">3</strong> mark delivered</p>
          <p>• MSL breach alerts (below MIN / above MAX) are sent as a separate automatic digest</p>
          <p>• If offline, notifications queue and send when connectivity returns</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="fiori-btn-primary flex items-center gap-1.5" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending
            ? <><span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
            : <><Bell size={14} /> Save Alert Config</>}
        </button>
        <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={handleGenerate} disabled={generating}>
          {generating
            ? <><span className="inline-block w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" /> Regenerating…</>
            : <><Zap size={14} /> Regenerate Now</>}
        </button>
      </div>
    </div>
  );
}

function ChannelToggle({ icon: Icon, label, desc, enabled, onToggle, activeColor, activeBg }) {
  return (
    <div className={clsx('flex items-start gap-3 p-3.5 rounded-control border cursor-pointer transition-all select-none',
      enabled ? activeBg : 'bg-background border-border opacity-70 hover:opacity-100')}
      onClick={onToggle} role="switch" aria-checked={enabled} tabIndex={0}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onToggle()}>
      <Icon size={18} className={clsx('mt-0.5 shrink-0', enabled ? activeColor : 'text-text-secondary')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-snug">{desc}</p>
      </div>
      <div className={clsx('w-10 h-5 rounded-full relative transition-colors shrink-0 mt-0.5', enabled ? 'bg-success' : 'bg-border')}>
        <div className={clsx('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
      </div>
    </div>
  );
}

// ── HistoryTab ────────────────────────────────────────────────────────────────
function HistoryTab({ logs = [] }) {
  if (logs.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-border/30 rounded-full flex items-center justify-center mb-3">
          <Clock size={24} className="text-text-secondary" />
        </div>
        <p className="text-sm font-semibold text-text">No notifications sent yet</p>
        <p className="text-xs text-text-secondary mt-1 max-w-xs">
          Once a delivery is active with a due date set, the system sends WhatsApp
          and email reminders automatically and logs them here.
        </p>
      </div>
    );
  }

  const STATUS_MAP = {
    sent:      { icon: CheckCircle, cls: 'bg-green-100 text-success',       label: 'Sent' },
    failed:    { icon: XCircle,     cls: 'bg-red-100 text-error',           label: 'Failed' },
    snoozed:   { icon: Clock,       cls: 'bg-orange-100 text-warning',      label: 'Snoozed' },
    stopped:   { icon: XCircle,     cls: 'bg-gray-100 text-text-secondary', label: 'Stopped' },
    delivered: { icon: CheckCircle, cls: 'bg-blue-100 text-info',           label: 'Delivered' },
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-text">Notification History ({logs.length})</h3>
      <div className="overflow-x-auto border border-border rounded-control">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-background border-b border-border text-left">
              {['Sent At','Channel','Recipient','Status'].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const m = STATUS_MAP[log.status] || STATUS_MAP.sent;
              const StatusIcon = m.icon;
              return (
                <tr key={log.id} className="border-b border-border hover:bg-background/50">
                  <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">
                    {format(new Date(log.sentAt), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {log.channel === 'whatsapp'
                        ? <><MessageSquare size={13} className="text-success" /> WhatsApp</>
                        : <><Mail size={13} className="text-info" /> Email</>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-text-secondary max-w-[200px] truncate" title={log.recipient}>
                    {log.recipient}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', m.cls)}>
                      <StatusIcon size={11} /> {m.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity, Database, Wifi, Mail, MessageSquare, HardDrive, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { healthApi } from '@/api/health';

function Chip({ ok, warn, label, detail }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className={clsx(
      'flex items-center gap-2 px-3 py-2 rounded-control border text-sm',
      ok ? 'border-green-300 bg-green-50 text-success' :
      warn ? 'border-orange-300 bg-orange-50 text-warning' :
      'border-red-300 bg-red-50 text-error'
    )}>
      <Icon size={15} className="shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{label}</p>
        {detail && <p className="text-xs opacity-80 truncate">{detail}</p>}
      </div>
    </div>
  );
}

function NaChip({ label, detail }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-control border border-border bg-background text-text-secondary text-sm">
      <Clock size={15} className="shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{label}</p>
        {detail && <p className="text-xs opacity-80 truncate">{detail}</p>}
      </div>
    </div>
  );
}

export default function HealthStatus() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.get(),
    select: (r) => r.data,
    refetchInterval: 15_000,
  });

  const h = data;
  const s = h?.services || {};

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Activity size={16} className="text-primary" /> System Health
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Live status of all integrations. Auto-refreshes every 15 seconds.
            {h?.timestamp && <> Last checked {formatDistanceToNow(new Date(h.timestamp), { addSuffix: true })}.</>}
          </p>
        </div>
        <button className="fiori-btn-secondary flex items-center gap-1.5 shrink-0" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-control" />)}
        </div>
      ) : !h ? (
        <div className="message-strip-error">Health check unavailable.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Chip ok={s.db?.status === 'ok'} label="Database" detail={s.db?.status === 'ok' ? 'MySQL connected' : s.db?.message} />
            <Chip
              ok={s.internet?.status === 'ok'} warn={s.internet?.status !== 'ok'}
              label="Internet" detail={s.internet?.status === 'ok' ? 'Reachable' : 'Offline – notifications will queue'}
            />
            <Chip
              ok={s.scheduler?.status === 'running'} warn={s.scheduler?.status !== 'running'}
              label="Scheduler"
              detail={s.scheduler?.lastTick
                ? `Last tick ${formatDistanceToNow(new Date(s.scheduler.lastTick), { addSuffix: true })}`
                : 'Waiting for first tick'}
            />
            <Chip
              ok={s.waha?.status === 'ok' || s.waha?.status === 'WORKING'}
              warn={s.waha?.status === 'SCAN_QR_CODE' || s.waha?.status === 'not_configured'}
              label="WhatsApp (WAHA)"
              detail={s.waha?.status === 'not_configured' ? 'Not configured' : (s.waha?.status || s.waha?.message || 'unknown')}
            />
            <Chip
              ok={s.smtp?.status === 'ok'} warn={s.smtp?.status === 'not_configured'}
              label="SMTP / Email"
              detail={s.smtp?.status === 'ok' ? 'Connection verified' : s.smtp?.status === 'not_configured' ? 'Not configured' : s.smtp?.message}
            />
            <Chip
              ok={s.backup?.status === 'success' || s.backup?.status === 'never_run'}
              warn={s.backup?.status === 'failed'}
              label="Last Backup"
              detail={s.backup?.status === 'never_run' ? 'Never run'
                : s.backup?.at ? `${formatDistanceToNow(new Date(s.backup.at), { addSuffix: true })} – ${s.backup.status}`
                : s.backup?.status}
            />
          </div>

          <div className="fiori-card p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Notification outbox</h3>
            <div className="flex gap-6 text-sm">
              <span className="flex items-center gap-1.5"><Clock size={14} className="text-info" /> Pending: <strong>{h.outbox?.pending ?? '—'}</strong></span>
              <span className="flex items-center gap-1.5"><XCircle size={14} className="text-error" /> Failed: <strong>{h.outbox?.failed ?? '—'}</strong></span>
            </div>
            {(h.outbox?.pending > 0) && (
              <p className="text-xs text-text-secondary mt-2">
                Pending items are retried automatically with exponential backoff (1m → 5m → 15m → 1h → 2h).
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

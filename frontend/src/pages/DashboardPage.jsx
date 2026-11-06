import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Truck, AlertTriangle, TrendingUp, Calendar, Bell, XCircle,
  ArrowRight, TrendingDown, Building2, Upload, Activity,
  CheckCircle, Clock, Zap, Package, BarChart3,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

import { deliveriesApi } from '@/api/forecasts';
import Dialog from '@/components/ui/Dialog';
import UploadWizard from '@/components/upload/UploadWizard';
import { useThemeStore } from '@/store/themeStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => deliveriesApi.kpis(),
    select: (r) => r.data.data,
    refetchInterval: 30_000,
  });

  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['deliveries', { page: 1, status: 'active' }],
    queryFn: () => deliveriesApi.list({ page: 1, pageSize: 6, status: 'active' }),
    select: (r) => r.data,
    refetchInterval: 60_000,
  });

  const deliveries = deliveriesData?.data ?? [];
  const totalActive = kpis?.activeDeliveries ?? 0;
  const hasAlerts = (kpis?.belowMin ?? 0) + (kpis?.aboveMax ?? 0) > 0;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* ── Hero header ──────────────────────────────────────────── */}
      <div
        className={clsx(
          'relative overflow-hidden rounded-card px-6 py-5',
          isDark
            ? 'bg-gradient-to-br from-[#0A1F44] via-[#0d2a5e] to-[#1a3a6b] text-white shadow-fiori-lg'
            : 'bg-white border border-[#D4DCE8] shadow-fiori'
        )}
        style={isDark ? undefined : { borderLeft: '4px solid #0070F2' }}
      >
        {/* Decorative dot pattern — dark mode only */}
        {isDark && (
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle at 25px 25px, white 2%, transparent 0%), radial-gradient(circle at 75px 75px, white 2%, transparent 0%)',
              backgroundSize: '100px 100px',
            }}
          />
        )}
        {/* Glowing accent — dark mode only */}
        {isDark && (
          <div className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #60A5FA, transparent 70%)' }} />
        )}

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className={clsx(
                'w-6 h-6 rounded-md flex items-center justify-center',
                isDark ? 'bg-white/10' : 'bg-[#E8F0FB]'
              )}>
                <BarChart3 size={13} className={isDark ? 'text-blue-300' : 'text-[#0070F2]'} />
              </div>
              <span className={clsx(
                'text-[11px] font-bold uppercase tracking-widest',
                isDark ? 'text-white/45' : 'text-[#8A9AAD]'
              )}>
                Smart MSL Monitor
              </span>
            </div>
            <h1 className={clsx(
              'text-xl font-bold leading-tight',
              isDark ? 'text-white' : 'text-[#1D2D3E]'
            )}>
              {hasAlerts ? '⚠️ Action Required' : '✅ All Systems Normal'}
            </h1>
            <p className={clsx(
              'text-sm mt-1',
              isDark ? 'text-white/60' : 'text-[#556B82]'
            )}>
              {totalActive} active {totalActive === 1 ? 'delivery' : 'deliveries'} ·{' '}
              {kpis
                ? `${(kpis.belowMin ?? 0) + (kpis.aboveMax ?? 0)} part${(kpis.belowMin ?? 0) + (kpis.aboveMax ?? 0) !== 1 ? 's' : ''} need attention`
                : 'Loading…'}
            </p>
          </div>
          <button
            className={clsx(
              'flex items-center gap-2 font-bold px-5 py-2.5 rounded-control shadow-fiori text-sm shrink-0 transition-colors',
              isDark
                ? 'bg-white text-[#0A1F44] hover:bg-blue-50'
                : 'bg-[#0070F2] text-white hover:bg-[#0064D9]'
            )}
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={15} />
            Upload Forecast
          </button>
        </div>

        {/* Mini-stats row */}
        <div className={clsx(
          'relative mt-4 pt-4 flex flex-wrap gap-3 border-t',
          isDark ? 'border-white/10' : 'border-[#E8ECF2]'
        )}>
          {[
            { label: 'Below MIN',  value: kpis?.belowMin ?? 0,  color: isDark ? 'text-red-300' : 'text-[#D20A0A]',    bg: isDark ? 'bg-red-500/20' : 'bg-red-50',    border: isDark ? 'border-red-400/30' : 'border-red-200',    icon: TrendingDown },
            { label: 'Above MAX',  value: kpis?.aboveMax ?? 0,  color: isDark ? 'text-orange-300' : 'text-[#E9730C]', bg: isDark ? 'bg-orange-500/20' : 'bg-orange-50', border: isDark ? 'border-orange-400/30' : 'border-orange-200', icon: TrendingUp },
            { label: 'Due in 7d',  value: kpis?.dueSoon ?? 0,   color: isDark ? 'text-blue-200' : 'text-[#0070F2]',   bg: isDark ? 'bg-blue-500/20' : 'bg-blue-50',   border: isDark ? 'border-blue-400/30' : 'border-blue-200',   icon: Calendar },
            { label: 'Sent Today', value: kpis?.remindersToday ?? 0, color: isDark ? 'text-green-300' : 'text-[#188918]', bg: isDark ? 'bg-green-500/20' : 'bg-green-50', border: isDark ? 'border-green-400/30' : 'border-green-200', icon: Bell },
          ].map(({ label, value, color, bg, border, icon: Icon }) => (
            <div key={label} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full border', bg, border)}>
              <Icon size={12} className={color} />
              <span className={clsx('text-xs font-bold', color)}>{value}</span>
              <span className={clsx('text-xs', isDark ? 'text-white/55' : 'text-[#8A9AAD]')}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI tiles ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Active Deliveries', value: kpis?.activeDeliveries, icon: Truck,
            accent: 'border-t-primary', text: 'text-primary dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/15',
            onClick: () => navigate('/deliveries'),
          },
          {
            label: 'Below MIN', value: kpis?.belowMin, icon: TrendingDown,
            accent: kpis?.belowMin > 0 ? 'border-t-error' : 'border-t-border',
            text: kpis?.belowMin > 0 ? 'text-error dark:text-red-400' : 'text-text-secondary',
            bg: kpis?.belowMin > 0 ? 'bg-red-50 dark:bg-red-500/15' : 'bg-gray-50 dark:bg-white/5',
            pulse: kpis?.belowMin > 0,
          },
          {
            label: 'Above MAX', value: kpis?.aboveMax, icon: TrendingUp,
            accent: kpis?.aboveMax > 0 ? 'border-t-warning' : 'border-t-border',
            text: kpis?.aboveMax > 0 ? 'text-warning dark:text-orange-400' : 'text-text-secondary',
            bg: kpis?.aboveMax > 0 ? 'bg-orange-50 dark:bg-orange-500/15' : 'bg-gray-50 dark:bg-white/5',
          },
          {
            label: 'Due in 7 Days', value: kpis?.dueSoon, icon: Calendar,
            accent: 'border-t-info', text: 'text-info dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/15',
          },
          {
            label: 'Reminders Today', value: kpis?.remindersToday, icon: Bell,
            accent: 'border-t-success', text: 'text-success dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/15',
            onClick: () => navigate('/reminders'),
          },
          {
            label: 'Failed Alerts', value: kpis?.failedNotifications, icon: XCircle,
            accent: kpis?.failedNotifications > 0 ? 'border-t-error' : 'border-t-border',
            text: kpis?.failedNotifications > 0 ? 'text-error dark:text-red-400' : 'text-text-secondary',
            bg: kpis?.failedNotifications > 0 ? 'bg-red-50 dark:bg-red-500/15' : 'bg-gray-50 dark:bg-white/5',
            onClick: () => navigate('/notifications'),
          },
        ].map(({ label, value, icon: Icon, accent, text, bg, onClick, pulse }) => (
          <div
            key={label}
            className={clsx(
              'fiori-card p-4 flex flex-col gap-2 border-t-4 transition-all duration-200',
              accent,
              onClick && 'cursor-pointer hover:shadow-fiori-md hover:-translate-y-px',
              pulse && 'ring-2 ring-red-200 ring-offset-1'
            )}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
            aria-label={`${label}: ${value ?? '—'}`}
          >
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
              <Icon size={16} className={text} aria-hidden="true" />
            </div>
            {kpisLoading ? (
              <div className="skeleton h-8 w-10" />
            ) : (
              <p className={clsx('text-2xl font-bold', text)}>{value ?? 0}</p>
            )}
            <p className="text-xs text-text-secondary leading-snug font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Active deliveries (2/3 width) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="fiori-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-bold text-text flex items-center gap-2">
                <Truck size={15} className="text-primary" aria-hidden="true" />
                Active Deliveries
              </h2>
              <button
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                onClick={() => navigate('/deliveries')}
              >
                View all <ArrowRight size={12} />
              </button>
            </div>

            {deliveriesLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-control" />)}
              </div>
            ) : deliveries.length === 0 ? (
              <EmptyDeliveries onUpload={() => setUploadOpen(true)} />
            ) : (
              <div className="divide-y divide-border">
                {deliveries.map((d) => (
                  <DeliveryRow key={d.id} delivery={d} onClick={() => navigate(`/deliveries/${d.id}`)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Alert panel */}
          <AlertPanel kpis={kpis} />

          {/* Quick actions */}
          <div className="fiori-card p-4">
            <h2 className="text-sm font-bold text-text mb-3 flex items-center gap-2">
              <Zap size={15} className="text-warning dark:text-orange-400" /> Quick Actions
            </h2>
            <div className="space-y-2">
              <ActionButton icon={Upload} label="Upload new forecast" onClick={() => setUploadOpen(true)} primary />
              <ActionButton icon={Truck} label="View all deliveries" onClick={() => navigate('/deliveries')} />
              <ActionButton icon={Bell} label="Reminder schedule" onClick={() => navigate('/reminders')} />
              <ActionButton icon={Activity} label="Notification log" onClick={() => navigate('/notifications')} />
            </div>
          </div>
        </div>
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Forecast" size="lg">
        <UploadWizard onClose={() => setUploadOpen(false)} />
      </Dialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DeliveryRow({ delivery, onClick }) {
  const belowMin = delivery.mslSummary?.BELOW_MIN ?? 0;
  const aboveMax = delivery.mslSummary?.ABOVE_MAX ?? 0;
  const hasAlert = belowMin > 0 || aboveMax > 0;
  const daysLeft = delivery.dueDate
    ? Math.ceil((new Date(delivery.dueDate) - new Date()) / 86400000)
    : null;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-5 py-3.5 hover:bg-background/70 cursor-pointer transition-colors group',
        hasAlert && 'border-l-4 border-l-error'
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`View delivery for ${delivery.customer?.name}`}
    >
      <div className={clsx(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
        hasAlert ? 'bg-red-100 dark:bg-red-500/15' : 'bg-primary/10'
      )}>
        {hasAlert
          ? <AlertTriangle size={16} className="text-error dark:text-red-400" />
          : <Building2 size={16} className="text-primary" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{delivery.customer?.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-text-secondary font-mono">{delivery.forecastMonth}</span>
          <span className="text-xs text-text-secondary">·</span>
          <span className="text-xs text-text-secondary">{delivery._count?.items ?? 0} parts</span>
          {daysLeft !== null && (
            <>
              <span className="text-xs text-text-secondary">·</span>
              <span className={clsx(
                'text-xs font-semibold',
                daysLeft < 0 ? 'text-error dark:text-red-400' : daysLeft <= 3 ? 'text-warning dark:text-orange-400' : 'text-text-secondary'
              )}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* MSL badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        {belowMin > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-error text-xs font-bold rounded-full">
            <TrendingDown size={10} />{belowMin}
          </span>
        )}
        {aboveMax > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-orange-100 dark:bg-orange-500/15 text-warning text-xs font-bold rounded-full">
            <TrendingUp size={10} />{aboveMax}
          </span>
        )}
        {!hasAlert && delivery._count?.items > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 dark:bg-green-500/15 text-success text-xs font-semibold rounded-full">
            <CheckCircle size={10} /> OK
          </span>
        )}
        <ArrowRight size={14} className="text-text-secondary ml-1 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
}

function AlertPanel({ kpis }) {
  const belowMin = kpis?.belowMin ?? 0;
  const aboveMax = kpis?.aboveMax ?? 0;
  const failed   = kpis?.failedNotifications ?? 0;
  const total = belowMin + aboveMax + failed;

  return (
    <div className="fiori-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <AlertTriangle size={15} className={total > 0 ? 'text-warning dark:text-orange-400' : 'text-success dark:text-green-400'} />
        <h2 className="text-sm font-bold text-text">Attention Needed</h2>
        {total > 0 && (
          <span className="ml-auto text-xs bg-error text-white font-bold px-2 py-0.5 rounded-full">{total}</span>
        )}
      </div>
      <div className="p-4">
        {total === 0 ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-10 h-10 bg-green-50 dark:bg-green-500/15 rounded-full flex items-center justify-center mb-2">
              <CheckCircle size={20} className="text-success dark:text-green-400" />
            </div>
            <p className="text-sm font-semibold text-text">All clear</p>
            <p className="text-xs text-text-secondary mt-1">No parts require attention</p>
          </div>
        ) : (
          <div className="space-y-2">
            {belowMin > 0 && (
              <AlertItem
                icon={TrendingDown}
                color="text-error dark:text-red-400"
                bg="bg-red-50 dark:bg-red-500/10"
                title={`${belowMin} part${belowMin !== 1 ? 's' : ''} below minimum`}
                sub="Quantity below configured MIN threshold"
              />
            )}
            {aboveMax > 0 && (
              <AlertItem
                icon={TrendingUp}
                color="text-warning dark:text-orange-400"
                bg="bg-orange-50 dark:bg-orange-500/10"
                title={`${aboveMax} part${aboveMax !== 1 ? 's' : ''} above maximum`}
                sub="Quantity exceeds configured MAX threshold"
              />
            )}
            {failed > 0 && (
              <AlertItem
                icon={XCircle}
                color="text-error dark:text-red-400"
                bg="bg-red-50 dark:bg-red-500/10"
                title={`${failed} failed notification${failed !== 1 ? 's' : ''}`}
                sub="Check Notifications page to retry"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertItem({ icon: Icon, color, bg, title, sub }) {
  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-control ${bg}`}>
      <Icon size={15} className={`${color} shrink-0 mt-0.5`} />
      <div>
        <p className={`text-xs font-semibold ${color}`}>{title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-control text-sm font-medium transition-colors text-left',
        primary
          ? 'bg-primary/10 text-primary hover:bg-primary/15'
          : 'bg-background hover:bg-border/50 text-text-secondary hover:text-text'
      )}
    >
      <Icon size={15} className={primary ? 'text-primary' : 'text-text-secondary'} />
      {label}
    </button>
  );
}

function EmptyDeliveries({ onUpload }) {
  return (
    <div className="py-12 flex flex-col items-center text-center px-4">
      <div className="w-14 h-14 bg-border/40 rounded-full flex items-center justify-center mb-3">
        <Package size={28} className="text-text-secondary" />
      </div>
      <p className="text-sm font-semibold text-text">No active deliveries</p>
      <p className="text-xs text-text-secondary mt-1 mb-4 max-w-[220px]">
        Upload a customer forecast PDF or Excel file to get started.
      </p>
      <button
        className="fiori-btn-primary flex items-center gap-1.5 text-sm"
        onClick={onUpload}
      >
        <Upload size={14} /> Upload Forecast
      </button>
    </div>
  );
}

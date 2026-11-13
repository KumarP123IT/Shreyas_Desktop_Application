import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Upload, ChevronRight, TrendingDown, TrendingUp,
  CheckCircle2, AlertTriangle, Calendar, Trash2, FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { format, differenceInDays } from 'date-fns';

import { deliveriesApi } from '@/api/forecasts';
import { customersApi } from '@/api/customers';
import { InvoiceTab } from '@/components/customers/CustomerDetail';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import PageHeader from '@/components/ui/PageHeader';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Pagination from '@/components/ui/Pagination';
import UploadWizard from '@/components/upload/UploadWizard';
import { useToast } from '@/components/ui/Toast';

const STATUS_OPTIONS = ['', 'active', 'draft', 'delivered', 'cancelled'];

const STATUS_STYLE = {
  active:    'bg-green-100 text-success',
  draft:     'bg-gray-100 text-text-secondary',
  delivered: 'bg-blue-100 text-info',
  cancelled: 'bg-gray-100 text-text-secondary',
};

export default function DeliveriesList() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage]           = useState(1);
  const [status, setStatus]       = useState('');
  const [uploadOpen, setUploadOpen]     = useState(false);
  const [invoiceOpen, setInvoiceOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', { page, status }],
    queryFn: () => deliveriesApi.list({ page, pageSize: 20, status }),
    select: (r) => r.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deliveriesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['deliveries-kpis'] });
      toast.success('Delivery record deleted');
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to delete delivery'),
  });

  const deliveries = data?.data ?? [];
  const meta       = data?.meta ?? {};

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        title="Deliveries"
        subtitle={`${meta.total ?? 0} delivery records`}
        actions={
          <div className="flex items-center gap-2">
            <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={() => setInvoiceOpen(true)}>
              <FileText size={16} /> Upload Invoice
            </button>
            <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => setUploadOpen(true)}>
              <Upload size={16} /> Upload Forecast
            </button>
          </div>
        }
      />

      {/* Status filter */}
      <div className="fiori-card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide mr-1">Status:</span>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s || 'all'}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
              status === s ? 'bg-primary text-white' : 'bg-background text-text-secondary hover:bg-border'
            )}
            onClick={() => { setStatus(s); setPage(1); }}
          >
            {s || 'All'}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-secondary">{meta.total ?? 0} records</span>
      </div>

      <div className="fiori-card overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : deliveries.length === 0 ? (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-background border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Month</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Parts</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">MSL Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Due Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => {
                    const belowMin = d.mslSummary?.BELOW_MIN ?? 0;
                    const aboveMax = d.mslSummary?.ABOVE_MAX ?? 0;
                    const hasAlert = belowMin > 0 || aboveMax > 0;
                    const daysLeft = d.dueDate ? differenceInDays(new Date(d.dueDate), new Date()) : null;
                    return (
                      <tr
                        key={d.id}
                        className={clsx(
                          'border-b border-border hover:bg-background/70 cursor-pointer transition-colors',
                          hasAlert && 'border-l-4 border-l-error'
                        )}
                        onClick={() => navigate(`/deliveries/${d.id}`)}
                      >
                        <td className="px-4 py-3 font-semibold text-text">{d.customer?.name}</td>
                        <td className="px-4 py-3 text-text-secondary font-mono text-xs">{d.forecastMonth}</td>
                        <td className="px-4 py-3 text-text-secondary">{d._count?.items ?? '—'}</td>
                        <td className="px-4 py-3">
                          <MslInlineSummary belowMin={belowMin} aboveMax={aboveMax} />
                        </td>
                        <td className="px-4 py-3">
                          {d.dueDate ? (
                            <span className={clsx('text-xs font-medium flex items-center gap-1',
                              daysLeft !== null && daysLeft < 0 ? 'text-error' :
                              daysLeft !== null && daysLeft <= 3 ? 'text-warning' : 'text-text-secondary')}>
                              <Calendar size={12} />
                              {format(new Date(d.dueDate), 'dd MMM yyyy')}
                              {daysLeft !== null && (
                                <span className="opacity-75">
                                  {daysLeft < 0 ? ` (${Math.abs(daysLeft)}d over)` : daysLeft === 0 ? ' (today)' : ` (${daysLeft}d)`}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-text-secondary text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold', STATUS_STYLE[d.status] || 'bg-gray-100 text-text-secondary')}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <ChevronRight size={15} />
                        </td>
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="p-1.5 rounded-md text-text-secondary hover:text-error hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title="Delete this delivery record"
                            aria-label={`Delete delivery for ${d.customer?.name} ${d.forecastMonth}`}
                            onClick={() => setDeleteTarget(d)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-3">
              <Pagination page={page} totalPages={meta.totalPages || 1} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Forecast" size="lg">
        <UploadWizard onClose={() => setUploadOpen(false)} />
      </Dialog>

      <InvoiceUploadDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Delete Delivery Record"
        message={deleteTarget
          ? `Delete the delivery record for "${deleteTarget.customer?.name} — ${deleteTarget.forecastMonth}"? This will remove it from the list and stop its pending reminders. This cannot be undone from the app.`
          : ''}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Invoice upload dialog ────────────────────────────────────────────────────
// Lets the user pick a customer, then reuses the same InvoiceTab UI from the
// Customer detail page (upload PDF → review parsed rows → apply to stock).
function InvoiceUploadDialog({ open, onClose }) {
  const [customerId, setCustomerId] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['customers', { pageSize: 200 }],
    queryFn:  () => customersApi.list({ pageSize: 200 }),
    select:   (r) => r.data.data,
    enabled:  open,
  });

  return (
    <Dialog open={open} onClose={onClose} title="Upload Invoice" size="lg">
      {!customerId ? (
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="fiori-label" htmlFor="inv-customer">Customer</label>
            <select
              id="inv-customer"
              className="fiori-input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Select a customer…</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.supplierCode ? ` (${c.supplierCode})` : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-text-secondary">
            Pick the customer this invoice belongs to, then upload the PDF to deduct quantities from stock.
          </p>
        </div>
      ) : (
        <InvoiceTab customerId={parseInt(customerId, 10)} />
      )}
    </Dialog>
  );
}

function MslInlineSummary({ belowMin, aboveMax }) {
  if (belowMin === 0 && aboveMax === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCircle2 size={12} /> OK
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {belowMin > 0 && (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-error text-xs font-bold rounded-full">
          <TrendingDown size={10} /> {belowMin} low
        </span>
      )}
      {aboveMax > 0 && (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-orange-100 text-warning text-xs font-bold rounded-full">
          <TrendingUp size={10} /> {aboveMax} high
        </span>
      )}
    </div>
  );
}

function EmptyState({ onUpload }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <div className="w-14 h-14 bg-border/30 rounded-full flex items-center justify-center mb-3">
        <Truck size={28} className="text-text-secondary" />
      </div>
      <p className="font-semibold text-text">No deliveries yet</p>
      <p className="text-sm text-text-secondary mt-1 mb-4">Upload a customer forecast to create your first delivery.</p>
      <button className="fiori-btn-primary flex items-center gap-1.5" onClick={onUpload}>
        <Upload size={15} /> Upload Forecast
      </button>
    </div>
  );
}

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Edit2, Save, X, Upload, FileText,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  TrendingDown, TrendingUp, Package, Truck, Calendar, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { format, differenceInDays } from 'date-fns';
import { useRef } from 'react';

import { customersApi } from '@/api/customers';
import { mslApi } from '@/api/msl';
import { invoicesApi } from '@/api/invoices';
import { deliveriesApi } from '@/api/forecasts';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import CustomerForm from './CustomerForm';
import SkeletonTable from '@/components/ui/SkeletonTable';
import UploadWizard from '@/components/upload/UploadWizard';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [serverError, setServerError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  const customerId = parseInt(id, 10);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customersApi.getOne(customerId),
    select: (r) => r.data.data,
  });

  const { data: mslDefault } = useQuery({
    queryKey: ['msl-customer', customerId],
    queryFn: () => mslApi.getCustomerDefault(customerId),
    select: (r) => r.data.data,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => customersApi.update(customerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated');
      setEditOpen(false);
      setServerError('');
    },
    onError: (e) => setServerError(e.response?.data?.error?.message || 'Failed to update'),
  });

  if (isLoading) return (
    <div className="max-w-4xl mx-auto">
      <div className="skeleton h-6 w-48 mb-6" />
      <SkeletonTable rows={6} cols={3} />
    </div>
  );

  if (!customer) return (
    <div className="text-center py-16">
      <p className="text-text-secondary">Customer not found.</p>
      <button className="fiori-btn-secondary mt-3" onClick={() => navigate('/customers')}>Back to Customers</button>
    </div>
  );

  const tabs = ['details', 'msl', 'reminders', 'deliveries', 'invoice'];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader
        breadcrumb="Customers"
        title={customer.name}
        subtitle={`Supplier Code: ${customer.supplierCode}`}
        actions={
          <>
            <button className="fiori-btn-ghost flex items-center gap-1.5" onClick={() => navigate('/customers')}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => { setEditOpen(true); setServerError(''); }}>
              <Edit2 size={15} /> Edit
            </button>
          </>
        }
      />

      {/* Anchor bar / Tabs */}
      <div className="flex gap-0 border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'msl' ? 'MSL Defaults' : tab === 'reminders' ? 'Reminder Defaults' : tab === 'invoice' ? 'Invoice' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="fiori-card p-5">
        {activeTab === 'details' && <DetailsTab customer={customer} />}
        {activeTab === 'msl' && <MslTab customer={customer} mslDefault={mslDefault} customerId={customerId} />}
        {activeTab === 'reminders' && <RemindersTab customer={customer} />}
        {activeTab === 'deliveries' && <DeliveriesTab customerId={customerId} />}
        {activeTab === 'invoice' && <InvoiceTab customerId={customerId} />}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer" size="lg">
        <CustomerForm
          defaultValues={customer}
          onSubmit={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
          serverError={serverError}
        />
      </Dialog>
    </div>
  );
}

function DetailsTab({ customer }) {
  const rows = [
    ['Name', customer.name],
    ['Supplier Code', customer.supplierCode],
    ['Contact Person', customer.contactName || '—'],
    ['Contact Email', customer.contactEmail || '—'],
    ['Contact WhatsApp', customer.contactWhatsapp || '—'],
    ['Notify via WhatsApp', customer.notifyWhatsapp ? 'Yes' : 'No'],
    ['Notify via Email', customer.notifyEmail ? 'Yes' : 'No'],
    ['Qty Check Mode', customer.qtyCheckMode === 'actual' ? 'Actual Stock' : 'Forecast Total'],
    ['Override Email', customer.recipientEmail || '— (uses global)'],
    ['Override WhatsApp', customer.recipientWhatsapp || '— (uses global)'],
    ['Notes', customer.notes || '—'],
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="fiori-label">{label}</dt>
          <dd className="text-sm text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MslTab({ customer, mslDefault, customerId }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const setMutation = useMutation({
    mutationFn: (data) => mslApi.setCustomerDefault(customerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['msl-customer', customerId] });
      toast.success('Customer MSL default saved');
      setEditing(false);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to save'),
  });

  const clearMutation = useMutation({
    mutationFn: () => mslApi.clearCustomerDefault(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['msl-customer', customerId] });
      toast.success('Customer default cleared — inheriting global');
      setEditing(false);
    },
  });

  if (editing) {
    return (
      <div className="space-y-4 max-w-sm">
        <p className="text-sm text-text-secondary">
          Set a customer-specific MSL range. Leave blank to inherit the global default (Min 100 / Max 500).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fiori-label" htmlFor="cmin">Min Qty</label>
            <input id="cmin" type="number" min="0" value={min} onChange={e => setMin(e.target.value)} className="fiori-input" />
          </div>
          <div>
            <label className="fiori-label" htmlFor="cmax">Max Qty</label>
            <input id="cmax" type="number" min="1" value={max} onChange={e => setMax(e.target.value)} className="fiori-input" />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="fiori-btn-primary flex items-center gap-1"
            onClick={() => setMutation.mutate({ minQty: parseInt(min), maxQty: parseInt(max) })}
            disabled={setMutation.isPending}
          >
            <Save size={14} /> Save
          </button>
          <button className="fiori-btn-ghost flex items-center gap-1" onClick={() => setEditing(false)}>
            <X size={14} /> Cancel
          </button>
          {mslDefault && (
            <button
              className="fiori-btn-ghost text-error text-xs ml-auto"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              Clear (inherit global)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mslDefault ? (
        <div className="flex items-center gap-6">
          <div>
            <p className="fiori-label">Customer Min</p>
            <p className="text-xl font-bold text-text">{mslDefault.minQty}</p>
          </div>
          <div>
            <p className="fiori-label">Customer Max</p>
            <p className="text-xl font-bold text-text">{mslDefault.maxQty}</p>
          </div>
          <span className="status-badge status-normal">Customer override active</span>
        </div>
      ) : (
        <div className="message-strip-info">
          No customer-specific default set. Using global default (Min 100 / Max 500).
        </div>
      )}
      <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={() => { setEditing(true); setMin(mslDefault?.minQty ?? ''); setMax(mslDefault?.maxQty ?? ''); }}>
        <Edit2 size={14} /> {mslDefault ? 'Edit Default' : 'Set Customer Default'}
      </button>
    </div>
  );
}

function RemindersTab({ customer }) {
  const offsets = customer.reminderOffsets || [10, 5, 3, 1];
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">Default reminder offsets for this customer (days before due date):</p>
      <div className="flex flex-wrap gap-2">
        {offsets.map((d) => (
          <span key={d} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-semibold">
            {d} {d === 1 ? 'day' : 'days'} before
          </span>
        ))}
      </div>
      <p className="text-xs text-text-secondary">Edit reminder defaults per delivery in the Delivery detail page (Phase 5).</p>
    </div>
  );
}

// ─── Deliveries Tab ───────────────────────────────────────────────────────────

const DELIVERY_STATUS_STYLE = {
  active:    'bg-green-100 text-success',
  draft:     'bg-gray-100 text-text-secondary',
  delivered: 'bg-blue-100 text-info',
  cancelled: 'bg-gray-100 text-text-secondary',
};

function DeliveriesTab({ customerId }) {
  const navigate    = useNavigate();
  const toast       = useToast();
  const qc          = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [page, setPage]             = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', { customerId, page }],
    queryFn:  () => deliveriesApi.list({ customerId, page, pageSize: 10 }),
    select:   (r) => r.data,
  });

  const deliveries = data?.data ?? [];
  const meta       = data?.meta ?? {};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text">Deliveries</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {meta.total ?? 0} delivery record{meta.total !== 1 ? 's' : ''} for this customer
          </p>
        </div>
        <button
          className="fiori-btn-primary flex items-center gap-1.5"
          onClick={() => setUploadOpen(true)}
        >
          <Upload size={14} /> Upload Forecast
        </button>
      </div>

      {isLoading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : deliveries.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-secondary">
          <Truck size={32} className="mx-auto mb-2 opacity-30" />
          No deliveries yet.
          <br />
          <button
            className="fiori-btn-secondary mt-3 text-xs"
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={12} className="inline mr-1" /> Upload first forecast
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-background border-b border-border text-left">
                  <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">Month</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">Parts</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">MSL</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">Due Date</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">Status</th>
                  <th className="px-4 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const belowMin = d.mslSummary?.BELOW_MIN ?? 0;
                  const aboveMax = d.mslSummary?.ABOVE_MAX ?? 0;
                  const hasAlert = belowMin > 0 || aboveMax > 0;
                  const daysLeft = d.dueDate
                    ? differenceInDays(new Date(d.dueDate), new Date())
                    : null;
                  return (
                    <tr
                      key={d.id}
                      className={clsx(
                        'border-b border-border last:border-0 hover:bg-background/60 cursor-pointer',
                        hasAlert && 'border-l-2 border-l-error'
                      )}
                      onClick={() => navigate(`/deliveries/${d.id}`)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-text font-medium">
                        {d.forecastMonth}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs">
                        {d._count?.items ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {belowMin === 0 && aboveMax === 0 ? (
                          <span className="text-xs text-success flex items-center gap-1">
                            <CheckCircle2 size={11} /> OK
                          </span>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            {belowMin > 0 && (
                              <span className="text-xs text-error flex items-center gap-0.5 font-semibold">
                                <TrendingDown size={10} /> {belowMin}
                              </span>
                            )}
                            {aboveMax > 0 && (
                              <span className="text-xs text-warning flex items-center gap-0.5 font-semibold">
                                <TrendingUp size={10} /> {aboveMax}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {d.dueDate ? (
                          <span className={clsx(
                            'text-xs flex items-center gap-1',
                            daysLeft !== null && daysLeft < 0
                              ? 'text-error font-semibold'
                              : daysLeft !== null && daysLeft <= 3
                              ? 'text-warning font-semibold'
                              : 'text-text-secondary'
                          )}>
                            <Calendar size={11} />
                            {format(new Date(d.dueDate), 'dd MMM yy')}
                            {daysLeft !== null && (
                              <span className="opacity-70">
                                {daysLeft < 0
                                  ? ` (${Math.abs(daysLeft)}d over)`
                                  : daysLeft === 0 ? ' (today)'
                                  : ` (${daysLeft}d)`}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-semibold',
                          DELIVERY_STATUS_STYLE[d.status] || 'bg-gray-100 text-text-secondary'
                        )}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-text-secondary">
                Page {page} of {meta.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="fiori-btn-secondary text-xs py-1"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Prev
                </button>
                <button
                  className="fiori-btn-secondary text-xs py-1"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload Forecast dialog */}
      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Forecast"
        size="lg"
      >
        <UploadWizard
          preselectedCustomerId={customerId}
          onClose={() => {
            setUploadOpen(false);
            qc.invalidateQueries({ queryKey: ['deliveries', { customerId }] });
          }}
        />
      </Dialog>
    </div>
  );
}

// ─── Invoice Tab ──────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  pending:   'bg-yellow-100 text-yellow-800',
  applied:   'bg-green-100 text-success',
  cancelled: 'bg-gray-100 text-text-secondary',
};

const STATUS_ICON = {
  pending:   AlertTriangle,
  applied:   CheckCircle2,
  cancelled: XCircle,
};

// Map invoice items (with stock info from getOne) into editable preview rows
function toEditableRows(invoice) {
  return (invoice?.items ?? []).map((item) => ({
    id:         item.id,
    partNumber: item.partNumber,
    partName:   item.partName,
    qty:        item.qty,
    stockId:    item.stockId,
    stockQty:   item.stockQty ?? null,
    stockUnit:  item.stockUnit ?? null,
    stockFound: !!item.stockFound,
  }));
}

export function InvoiceTab({ customerId }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const fileRef = useRef(null);

  const [uploading,     setUploading]     = useState(false);
  const [preview,       setPreview]       = useState(null); // { invoice, rows, warnings }
  const [savingItems,   setSavingItems]   = useState(false);
  const [expandId,      setExpandId]      = useState(null);
  const [cancelTarget,  setCancelTarget]  = useState(null);

  // ── Load list ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', customerId],
    queryFn:  () => invoicesApi.list(customerId).then((r) => r.data),
    select:   (r) => r,
  });

  const invoices = data?.data ?? [];
  const meta     = data?.meta ?? {};

  // ── Upload mutation ────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: (formData) => invoicesApi.upload(customerId, formData),
    onMutate:   () => setUploading(true),
    onSettled:  () => setUploading(false),
    onSuccess:  async (res) => {
      const inv      = res.data.data.invoice;
      const warnings = res.data.data.warnings ?? [];
      // Fetch full invoice so preview rows carry ids + live stock quantities
      try {
        const detail = await invoicesApi.getOne(customerId, inv.id);
        setPreview({ invoice: inv, rows: toEditableRows(detail.data.data), warnings });
      } catch {
        setPreview({ invoice: inv, rows: [], warnings });
      }
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Upload failed'),
  });

  // ── Apply mutation ─────────────────────────────────────────────────────────
  const applyMutation = useMutation({
    mutationFn: (invoiceId) => invoicesApi.apply(customerId, invoiceId),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['invoices', customerId] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
      qc.invalidateQueries({ queryKey: ['delivery'] }); // refresh pending stock / invoiced columns
      const results = res.data.data?.results ?? [];
      const applied  = results.filter((r) => r.status === 'applied').length;
      const missing  = results.filter((r) => r.status === 'not_found').length;
      toast.success(`Invoice applied — ${applied} part(s) deducted from stock${missing ? `, ${missing} not found in stocks` : ''}`);
      setPreview(null);
    },
    onError: (e) => { setSavingItems(false); toast.error(e.response?.data?.error?.message || 'Apply failed'); },
  });

  // ── Cancel mutation ────────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (invoiceId) => invoicesApi.cancel(customerId, invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices', customerId] });
      toast.success('Invoice cancelled');
      setCancelTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Cancel failed'),
  });

  const updateRow = (i, field, value) => {
    setPreview((p) => ({
      ...p,
      rows: p.rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  };

  // Save edited rows, then apply — parser mistakes can be fixed before deducting
  const handleApply = async () => {
    if (!preview) return;
    setSavingItems(true);
    try {
      await invoicesApi.updateItems(
        customerId,
        preview.invoice.id,
        preview.rows.map((r) => ({
          id:         r.id,
          partNumber: r.partNumber,
          partName:   r.partName,
          qty:        parseInt(r.qty, 10) || 0,
        }))
      );
      // Refresh rows — stock matches/quantities are re-resolved server-side,
      // so the shortage check below uses fresh data
      const detail = await invoicesApi.getOne(customerId, preview.invoice.id);
      const fresh  = toEditableRows(detail.data.data);
      const short = fresh.some((r) => {
        const q = parseInt(r.qty, 10) || 0;
        return r.stockFound && r.stockQty != null && q > r.stockQty;
      });
      if (short) {
        setPreview((p) => ({ ...p, rows: fresh }));
        toast.error('Some quantities exceed current stock — update stock on the Stocks page first');
        setSavingItems(false);
        return;
      }
      applyMutation.mutate(preview.invoice.id);
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Failed to save edits');
      setSavingItems(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    uploadMutation.mutate(fd);
    e.target.value = '';
  };

  // ── Preview dialog ─────────────────────────────────────────────────────────
  if (preview) {
    const { invoice, rows, warnings } = preview;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">Review Invoice</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {invoice.invoiceNo ? `Invoice #${invoice.invoiceNo}` : 'Invoice'} — {rows.length} line item(s) parsed
            </p>
          </div>
          <button className="fiori-btn-ghost text-xs" onClick={() => setPreview(null)}>
            ← Back to list
          </button>
        </div>

        {/* Insufficient-stock warning — block apply until stock is updated */}
        {(() => {
          const shortages = rows.filter((r) => {
            const q = parseInt(r.qty, 10) || 0;
            return r.stockFound && r.stockQty != null && q > r.stockQty;
          });
          if (shortages.length === 0) return null;
          return (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs font-semibold text-red-800 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> {shortages.length} part(s) exceed current stock
              </p>
              <p className="text-xs text-red-700">
                {shortages.map((r) => `${r.partNumber}: needs ${r.qty}, has ${r.stockQty}`).join(' · ')}
                <br />Please update the stock quantity on the Stocks page first, then apply this invoice.
              </p>
            </div>
          );
        })()}

        {warnings?.length > 0 && (
          <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
            <p className="text-xs font-semibold text-yellow-800 mb-1 flex items-center gap-1">
              <AlertTriangle size={12} /> {warnings.length} parser warning(s)
            </p>
            <ul className="text-xs text-yellow-700 space-y-0.5 list-disc list-inside">
              {warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
              {warnings.length > 5 && <li>…and {warnings.length - 5} more</li>}
            </ul>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-secondary">
            No part numbers could be extracted from this PDF.
            <br />Check the file format or add items to stock manually.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-background border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Part Number</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Part Name</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase text-right">In Stock</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Unit</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase text-right">Qty to Deduct</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase text-right">Remaining</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const qty     = parseInt(r.qty, 10) || 0;
                  const inStock = r.stockQty;
                  const remain  = inStock != null ? Math.max(0, inStock - qty) : null;
                  const short   = inStock != null && qty > inStock;
                  return (
                    <tr key={r.id ?? i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <input
                          className="w-36 font-mono text-xs border border-border rounded px-1.5 py-1 bg-background text-text focus:outline-none focus:ring-1 focus:ring-primary/40"
                          value={r.partNumber}
                          onChange={(e) => updateRow(i, 'partNumber', e.target.value)}
                          aria-label="Part number"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-44 text-xs border border-border rounded px-1.5 py-1 bg-background text-text focus:outline-none focus:ring-1 focus:ring-primary/40"
                          value={r.partName ?? ''}
                          onChange={(e) => updateRow(i, 'partName', e.target.value)}
                          aria-label="Part name"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">
                        {inStock != null ? inStock : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-secondary">{r.stockUnit || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          className={clsx(
                            'w-20 text-right font-semibold border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40',
                            short ? 'border-error text-error' : 'border-border text-error'
                          )}
                          value={r.qty}
                          onChange={(e) => updateRow(i, 'qty', e.target.value)}
                          aria-label="Quantity to deduct"
                        />
                      </td>
                      <td className={clsx('px-3 py-2 text-right font-mono text-xs font-semibold',
                        remain != null && (short || remain === 0) ? 'text-error' : 'text-success')}>
                        {remain != null ? remain : '—'}
                        {short && <span className="block text-[10px] font-normal text-error">exceeds stock</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.stockFound
                          ? <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={12} /> In stock</span>
                          : <span className="text-xs text-text-secondary flex items-center gap-1"><AlertTriangle size={12} /> Not in stocks yet</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-text-secondary">
          You can fix part numbers and quantities directly in the table — edits are saved when you apply.
          Apply is blocked while any quantity exceeds current stock — update quantities on the Stocks page first.
          Parts not in stock are skipped.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button className="fiori-btn-secondary" onClick={() => setPreview(null)}>
            Cancel
          </button>
          <button
            className="fiori-btn-primary flex items-center gap-1.5"
            disabled={applyMutation.isPending || savingItems || rows.length === 0 ||
              rows.some((r) => {
                const q = parseInt(r.qty, 10) || 0;
                return r.stockFound && r.stockQty != null && q > r.stockQty;
              })}
            onClick={handleApply}
          >
            <TrendingDown size={14} />
            {applyMutation.isPending || savingItems ? 'Applying…' : 'Save & Apply — Deduct from Stocks'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main list view ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text">Invoices</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Upload a supplier invoice PDF to automatically deduct quantities from global stock.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            className="fiori-btn-primary flex items-center gap-1.5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} />
            {uploading ? 'Parsing…' : 'Upload Invoice PDF'}
          </button>
        </div>
      </div>

      {/* How it works info strip */}
      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-info flex items-start gap-2">
        <Package size={13} className="shrink-0 mt-0.5" />
        <span>
          Upload an invoice PDF → the system extracts part numbers and quantities → review the parsed items →
          click <strong>Apply</strong> to deduct them from your global stock.
        </span>
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <SkeletonTable rows={3} cols={5} />
      ) : invoices.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-secondary">
          <FileText size={32} className="mx-auto mb-2 opacity-30" />
          No invoices uploaded yet. Upload a PDF to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {invoices.map((inv) => {
            const StatusIcon = STATUS_ICON[inv.status] ?? FileText;
            const isExpanded = expandId === inv.id;
            return (
              <div key={inv.id} className="border-b border-border last:border-0">
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-background/60">
                  <StatusIcon size={15} className={clsx(
                    inv.status === 'applied'   ? 'text-success' :
                    inv.status === 'cancelled' ? 'text-text-secondary' : 'text-warning'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {inv.invoiceNo ? `Invoice #${inv.invoiceNo}` : `Invoice ${inv.id}`}
                      <span className="ml-2 text-xs text-text-secondary font-normal">{inv.fileName}</span>
                    </p>
                    <p className="text-xs text-text-secondary">
                      {inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yyyy') : '—'}
                      {' · '}
                      {inv._count?.items ?? 0} items
                      {' · '}
                      Uploaded {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold', STATUS_STYLE[inv.status] || 'bg-gray-100')}>
                    {inv.status}
                  </span>
                  {/* Actions */}
                  <div className="flex items-center gap-1 ml-2">
                    {inv.status === 'pending' && (
                      <>
                        <button
                          className="fiori-btn-primary text-xs py-1 px-2 flex items-center gap-1"
                          onClick={() => invoicesApi.getOne(customerId, inv.id)
                            .then((r) => setPreview({ invoice: inv, rows: toEditableRows(r.data.data), warnings: [] }))
                          }
                        >
                          <TrendingDown size={12} /> Review & Apply
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-border text-text-secondary hover:text-error transition-colors"
                          title="Cancel invoice"
                          onClick={() => setCancelTarget(inv)}
                        >
                          <XCircle size={14} />
                        </button>
                      </>
                    )}
                    <button
                      className="p-1.5 rounded hover:bg-border text-text-secondary transition-colors"
                      onClick={() => setExpandId(isExpanded ? null : inv.id)}
                      title={isExpanded ? 'Collapse' : 'Show items'}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expandable items */}
                {isExpanded && (
                  <InvoiceItemsRow customerId={customerId} invoiceId={inv.id} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate(cancelTarget.id)}
        title="Cancel Invoice"
        description={`Cancel invoice "${cancelTarget?.invoiceNo || cancelTarget?.id}"? The invoice will be marked cancelled and cannot be applied. Stock will not be changed.`}
        confirmLabel="Cancel Invoice"
        confirmVariant="danger"
        loading={cancelMutation.isPending}
      />
    </div>
  );
}

function InvoiceItemsRow({ customerId, invoiceId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-detail', customerId, invoiceId],
    queryFn:  () => invoicesApi.getOne(customerId, invoiceId).then((r) => r.data.data),
  });

  if (isLoading) return (
    <div className="px-4 py-3 bg-background/40">
      <SkeletonTable rows={2} cols={3} />
    </div>
  );

  const items = data?.items ?? [];
  if (items.length === 0) return (
    <div className="px-4 py-3 text-xs text-text-secondary bg-background/40">No items.</div>
  );

  return (
    <div className="bg-background/40 border-t border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="px-4 py-2 font-semibold text-text-secondary">Part Number</th>
            <th className="px-4 py-2 font-semibold text-text-secondary">Part Name</th>
            <th className="px-4 py-2 font-semibold text-text-secondary text-right">Qty Deducted</th>
            <th className="px-4 py-2 font-semibold text-text-secondary">Stock</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono">{item.partNumber}</td>
              <td className="px-4 py-2 text-text">{item.partName}</td>
              <td className="px-4 py-2 text-right font-semibold text-error">{item.qty}</td>
              <td className="px-4 py-2">
                {item.applied
                  ? <span className="text-success flex items-center gap-1"><CheckCircle2 size={11} /> Applied</span>
                  : item.stockFound
                  ? <span className="text-warning flex items-center gap-1"><AlertTriangle size={11} /> Pending · {item.stockQty} in stock</span>
                  : <span className="text-text-secondary flex items-center gap-1"><XCircle size={11} /> No stock match</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

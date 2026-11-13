import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Edit2, Save, X, Upload, FileText,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  TrendingDown, Package,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useRef } from 'react';

import { customersApi } from '@/api/customers';
import { mslApi } from '@/api/msl';
import { invoicesApi } from '@/api/invoices';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import CustomerForm from './CustomerForm';
import SkeletonTable from '@/components/ui/SkeletonTable';

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
        {activeTab === 'deliveries' && (
          <div className="py-8 text-center text-text-secondary text-sm">
            Deliveries will appear here once forecasts are uploaded. (Phase 3)
          </div>
        )}
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

export function InvoiceTab({ customerId }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const fileRef = useRef(null);

  const [uploading,     setUploading]     = useState(false);
  const [preview,       setPreview]       = useState(null); // { invoice, rows, warnings }
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
    onSuccess:  (res) => {
      setPreview(res.data.data);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Upload failed'),
  });

  // ── Apply mutation ─────────────────────────────────────────────────────────
  const applyMutation = useMutation({
    mutationFn: (invoiceId) => invoicesApi.apply(customerId, invoiceId),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['invoices', customerId] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
      const results = res.data.data?.results ?? [];
      const applied  = results.filter((r) => r.status === 'applied').length;
      const missing  = results.filter((r) => r.status === 'not_found').length;
      toast.success(`Invoice applied — ${applied} part(s) deducted from stock${missing ? `, ${missing} not found in stocks` : ''}`);
      setPreview(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Apply failed'),
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
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase text-right">Qty to Deduct</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Stock Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{r.partNumber}</td>
                    <td className="px-3 py-2 text-xs text-text max-w-xs truncate">{r.partName}</td>
                    <td className="px-3 py-2 text-right font-semibold text-error">{r.qty}</td>
                    <td className="px-3 py-2">
                      {r.stockId
                        ? <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={12} /> In stock</span>
                        : <span className="text-xs text-text-secondary flex items-center gap-1"><AlertTriangle size={12} /> Not in stocks yet</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="fiori-btn-secondary" onClick={() => setPreview(null)}>
            Cancel
          </button>
          <button
            className="fiori-btn-primary flex items-center gap-1.5"
            disabled={applyMutation.isPending || rows.length === 0}
            onClick={() => applyMutation.mutate(invoice.id)}
          >
            <TrendingDown size={14} />
            {applyMutation.isPending ? 'Applying…' : 'Apply — Deduct from Stocks'}
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
                            .then((r) => setPreview({ invoice: inv, rows: r.data.data.items.map(item => ({
                              partNumber: item.partNumber, partName: item.partName,
                              qty: item.qty, stockId: item.stockId,
                            })), warnings: [] }))
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
                  : item.stockId
                  ? <span className="text-warning flex items-center gap-1"><AlertTriangle size={11} /> Pending</span>
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

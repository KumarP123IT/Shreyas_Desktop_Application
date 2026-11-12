/**
 * StocksList – global parts inventory list with inline add/edit/adjust dialogs.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Package, Plus, Search, Edit2, Trash2, TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { stocksApi } from '@/api/stocks';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import PageHeader from '@/components/ui/PageHeader';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';

// ── Schemas ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  partNumber: z.string().min(1, 'Part number is required'),
  partName:   z.string().min(1, 'Part name is required'),
  quantity:   z.coerce.number().int().min(0, 'Must be ≥ 0').default(0),
  unit:       z.string().optional(),
  notes:      z.string().optional(),
});

const editSchema = z.object({
  partName: z.string().min(1, 'Part name is required'),
  unit:     z.string().optional(),
  notes:    z.string().optional(),
});

const adjustSchema = z.object({
  quantity: z.coerce.number().int({ message: 'Must be a whole number' }),
  mode:     z.enum(['set', 'adjust']).default('adjust'),
  note:     z.string().optional(),
});

// ── Status badge ──────────────────────────────────────────────────────────────

function StockBadge({ qty }) {
  if (qty === 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-error">
      <AlertTriangle size={11} /> Out of stock
    </span>
  );
  if (qty < 50) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-warning">
      <TrendingDown size={11} /> Low
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-success">
      <TrendingUp size={11} /> In stock
    </span>
  );
}

// ── Form helpers ──────────────────────────────────────────────────────────────

function FieldError({ err }) {
  return err ? <p className="mt-1 text-xs text-error">{err}</p> : null;
}

function FormField({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}</label>
      {children}
      <FieldError err={error?.message} />
    </div>
  );
}

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

// ── Add dialog ────────────────────────────────────────────────────────────────

function AddStockDialog({ open, onClose, onSuccess }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { quantity: 0 },
  });

  const mutation = useMutation({
    mutationFn: (data) => stocksApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Part added to stock');
      reset();
      onSuccess?.();
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to add part'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Add Part to Stock" className="max-w-lg w-full">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Part Number *" error={errors.partNumber}>
            <input {...register('partNumber')} className={inputCls} placeholder="e.g. 71109-06001-00" />
          </FormField>
          <FormField label="Quantity" error={errors.quantity}>
            <input {...register('quantity')} type="number" min={0} className={inputCls} placeholder="0" />
          </FormField>
        </div>
        <FormField label="Part Name *" error={errors.partName}>
          <input {...register('partName')} className={inputCls} placeholder="Descriptive part name" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Unit" error={errors.unit}>
            <input {...register('unit')} className={inputCls} placeholder="pcs / kg / m" />
          </FormField>
        </div>
        <FormField label="Notes" error={errors.notes}>
          <textarea {...register('notes')} rows={2} className={inputCls} placeholder="Optional notes..." />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="fiori-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="fiori-btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Add Part'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditStockDialog({ stock, open, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      partName: stock?.partName ?? '',
      unit:     stock?.unit ?? '',
      notes:    stock?.notes ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => stocksApi.update(stock.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Part updated');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Update failed'),
  });

  return (
    <Dialog open={open} onClose={onClose} title={`Edit — ${stock?.partNumber}`} className="max-w-md w-full">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField label="Part Name *" error={errors.partName}>
          <input {...register('partName')} className={inputCls} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Unit" error={errors.unit}>
            <input {...register('unit')} className={inputCls} placeholder="pcs / kg / m" />
          </FormField>
        </div>
        <FormField label="Notes" error={errors.notes}>
          <textarea {...register('notes')} rows={2} className={inputCls} />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="fiori-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="fiori-btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Adjust quantity dialog ────────────────────────────────────────────────────

function AdjustDialog({ stock, open, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(adjustSchema),
    defaultValues: { quantity: 0, mode: 'adjust', note: '' },
  });

  const mode = watch('mode');

  const mutation = useMutation({
    mutationFn: (data) => stocksApi.adjust(stock.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Quantity updated');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Adjustment failed'),
  });

  return (
    <Dialog open={open} onClose={onClose} title={`Adjust Stock — ${stock?.partNumber}`} className="max-w-md w-full">
      <div className="mb-4 p-3 rounded-lg bg-background border border-border text-sm">
        <span className="text-text-secondary">Current quantity: </span>
        <span className="font-bold text-text">{stock?.quantity ?? 0} {stock?.unit || 'pcs'}</span>
      </div>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField label="Mode" error={errors.mode}>
          <div className="flex gap-3">
            {[
              { value: 'adjust', label: 'Adjust (±)' },
              { value: 'set', label: 'Set exact value' },
            ].map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" value={value} {...register('mode')} className="accent-primary" />
                {label}
              </label>
            ))}
          </div>
        </FormField>
        <FormField
          label={mode === 'set' ? 'New quantity' : 'Delta (use negative to subtract)'}
          error={errors.quantity}
        >
          <input
            {...register('quantity')}
            type="number"
            className={inputCls}
            placeholder={mode === 'set' ? 'Enter new total' : 'e.g. +50 or -20'}
          />
        </FormField>
        <FormField label="Reason / Note (optional)" error={errors.note}>
          <input {...register('note')} className={inputCls} placeholder="e.g. stock count, delivery received" />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="fiori-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="fiori-btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Update Quantity'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StocksList() {
  const navigate = useNavigate();
  const toast    = useToast();
  const qc       = useQueryClient();

  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [addOpen, setAddOpen]     = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Debounce search input
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(handleSearch._t);
    handleSearch._t = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 350);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['stocks', { page, search: debouncedSearch }],
    queryFn: () => stocksApi.list({ page, pageSize: 50, search: debouncedSearch }),
    select: (r) => r.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => stocksApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Part removed from stock');
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Delete failed'),
  });

  const stocks = data?.data ?? [];
  const meta   = data?.meta ?? {};

  // Summary stats
  const outOfStock = stocks.filter((s) => s.quantity === 0).length;
  const lowStock   = stocks.filter((s) => s.quantity > 0 && s.quantity < 50).length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        title="Stocks"
        subtitle={`${meta.total ?? 0} parts tracked`}
        actions={
          <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Add Part
          </button>
        }
      />

      {/* KPI bar */}
      {!isLoading && stocks.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Parts',    value: meta.total ?? 0,  color: 'text-primary' },
            { label: 'Low Stock',      value: lowStock,          color: 'text-warning' },
            { label: 'Out of Stock',   value: outOfStock,        color: 'text-error'   },
          ].map(({ label, value, color }) => (
            <div key={label} className="fiori-card p-4 flex flex-col">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</span>
              <span className={clsx('text-2xl font-bold mt-1', color)}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="fiori-card p-3 flex items-center gap-3">
        <Search size={15} className="text-text-secondary shrink-0" />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by part number or name…"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-secondary focus:outline-none"
        />
        {search && (
          <button
            className="text-xs text-text-secondary hover:text-text"
            onClick={() => handleSearch('')}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="fiori-card overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={6} cols={5} /></div>
        ) : stocks.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} hasSearch={!!debouncedSearch} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-background border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Part Number</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Part Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">Quantity</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Notes</th>
                    <th className="px-4 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border hover:bg-background/60 cursor-pointer"
                      onClick={() => navigate(`/stocks/${s.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium text-text">{s.partNumber}</td>
                      <td className="px-4 py-3 text-text max-w-xs truncate">{s.partName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-text">
                        {s.quantity.toLocaleString()}
                        {s.unit && <span className="ml-1 text-xs font-normal text-text-secondary">{s.unit}</span>}
                      </td>
                      <td className="px-4 py-3"><StockBadge qty={s.quantity} /></td>
                      <td className="px-4 py-3 text-xs text-text-secondary max-w-xs truncate">{s.notes || '—'}</td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            title="Adjust quantity"
                            className="p-1.5 rounded hover:bg-border text-text-secondary hover:text-primary transition-colors"
                            onClick={() => setAdjustTarget(s)}
                          >
                            <TrendingUp size={14} />
                          </button>
                          <button
                            title="Edit part details"
                            className="p-1.5 rounded hover:bg-border text-text-secondary hover:text-primary transition-colors"
                            onClick={() => setEditTarget(s)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            title="Remove part"
                            className="p-1.5 rounded hover:bg-border text-text-secondary hover:text-error transition-colors"
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta.totalPages > 1 && (
              <div className="p-4 border-t border-border">
                <Pagination
                  page={page}
                  totalPages={meta.totalPages}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <AddStockDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />

      {editTarget && (
        <EditStockDialog
          stock={editTarget}
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {adjustTarget && (
        <AdjustDialog
          stock={adjustTarget}
          open={!!adjustTarget}
          onClose={() => setAdjustTarget(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Remove Part"
        description={`Remove "${deleteTarget?.partNumber} — ${deleteTarget?.partName}" from stock? This cannot be undone.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function EmptyState({ onAdd, hasSearch }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Package size={40} className="text-text-secondary mb-3 opacity-50" />
      {hasSearch ? (
        <>
          <p className="font-semibold text-text">No parts match your search</p>
          <p className="text-sm text-text-secondary mt-1">Try a different part number or name</p>
        </>
      ) : (
        <>
          <p className="font-semibold text-text">No parts in stock yet</p>
          <p className="text-sm text-text-secondary mt-1">Add parts manually, or they'll appear automatically when you activate forecasts</p>
          <button className="fiori-btn-primary mt-4 flex items-center gap-1.5" onClick={onAdd}>
            <Plus size={15} /> Add First Part
          </button>
        </>
      )}
    </div>
  );
}

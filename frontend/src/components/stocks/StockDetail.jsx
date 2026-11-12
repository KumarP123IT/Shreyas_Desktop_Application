/**
 * StockDetail – per-part stock history and inline quantity adjustment.
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, TrendingUp, TrendingDown, Package,
  Clock, FileText, Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { stocksApi } from '@/api/stocks';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';

const adjustSchema = z.object({
  quantity: z.coerce.number().int({ message: 'Must be a whole number' }),
  mode:     z.enum(['set', 'adjust']).default('adjust'),
  note:     z.string().optional(),
});

const REASON_LABELS = {
  MANUAL_SET:    { label: 'Manual set',   icon: Wrench,    color: 'text-primary' },
  MANUAL_ADJUST: { label: 'Manual adj.',  icon: Wrench,    color: 'text-primary' },
  FORECAST_UPLOAD: { label: 'Forecast',   icon: FileText,  color: 'text-info' },
  DELIVERY_RECEIVED: { label: 'Delivery', icon: TrendingUp, color: 'text-success' },
};

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

export default function StockDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [adjustMode, setAdjustMode] = useState(false);

  const { data: stock, isLoading, error } = useQuery({
    queryKey: ['stock', id],
    queryFn: () => stocksApi.getOne(id).then((r) => r.data.data),
  });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(adjustSchema),
    defaultValues: { quantity: 0, mode: 'adjust', note: '' },
  });
  const mode = watch('mode');

  const adjustMutation = useMutation({
    mutationFn: (data) => stocksApi.adjust(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', id] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Quantity updated');
      reset();
      setAdjustMode(false);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Adjustment failed'),
  });

  if (isLoading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="fiori-card p-8 flex items-center justify-center">
        <span className="text-text-secondary text-sm">Loading…</span>
      </div>
    </div>
  );

  if (error || !stock) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="fiori-card p-8 flex items-center justify-center">
        <span className="text-error text-sm">Part not found.</span>
      </div>
    </div>
  );

  const transactions = stock.transactions ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader
        title={stock.partNumber}
        subtitle={stock.partName}
        actions={
          <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={() => navigate('/stocks')}>
            <ArrowLeft size={15} /> Back to Stocks
          </button>
        }
      />

      {/* Quantity card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="fiori-card p-5 flex flex-col">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Current Stock</span>
          <span className={clsx(
            'text-3xl font-bold',
            stock.quantity === 0 ? 'text-error' : stock.quantity < 50 ? 'text-warning' : 'text-success'
          )}>
            {stock.quantity.toLocaleString()}
          </span>
          {stock.unit && <span className="text-xs text-text-secondary mt-0.5">{stock.unit}</span>}
        </div>

        <div className="fiori-card p-5 flex flex-col">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Unit</span>
          <span className="text-lg font-semibold text-text">{stock.unit || '—'}</span>
        </div>

        <div className="fiori-card p-5 flex flex-col">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Notes</span>
          <span className="text-sm text-text leading-snug">{stock.notes || '—'}</span>
        </div>
      </div>

      {/* Adjust quantity panel */}
      <div className="fiori-card">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-text"
          onClick={() => setAdjustMode((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Adjust Quantity
          </span>
          <span className="text-text-secondary text-xs">{adjustMode ? 'Collapse ▲' : 'Expand ▼'}</span>
        </button>

        {adjustMode && (
          <form onSubmit={handleSubmit((d) => adjustMutation.mutate(d))} className="px-5 pb-5 space-y-4 border-t border-border pt-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">Mode</label>
              <div className="flex gap-4">
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  {mode === 'set' ? 'New quantity' : 'Delta (+ or −)'}
                </label>
                <input {...register('quantity')} type="number" className={inputCls} placeholder={mode === 'set' ? 'Enter total' : 'e.g. 50 or -10'} />
                {errors.quantity && <p className="mt-1 text-xs text-error">{errors.quantity.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Reason / Note</label>
                <input {...register('note')} className={inputCls} placeholder="e.g. stock count" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="fiori-btn-secondary" onClick={() => { setAdjustMode(false); reset(); }}>
                Cancel
              </button>
              <button type="submit" className="fiori-btn-primary" disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? 'Saving…' : 'Update Quantity'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Transaction history */}
      <div className="fiori-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Clock size={15} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text">Transaction History</span>
          <span className="ml-auto text-xs text-text-secondary">{transactions.length} records</span>
        </div>

        {transactions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-text-secondary">No transactions yet</div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((tx) => {
              const meta = REASON_LABELS[tx.reason] ?? { label: tx.reason, icon: Package, color: 'text-text' };
              const Icon = meta.icon;
              const isPositive = tx.deltaQty > 0;
              const isZero = tx.deltaQty === 0;
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-4 hover:bg-background/60">
                  <div className={clsx('shrink-0', meta.color)}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{meta.label}</p>
                    {tx.note && <p className="text-xs text-text-secondary truncate">{tx.note}</p>}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {format(new Date(tx.createdAt), 'dd MMM yyyy, HH:mm')}
                  </div>
                  <div className={clsx(
                    'w-20 text-right font-semibold text-sm',
                    isZero ? 'text-text-secondary' : isPositive ? 'text-success' : 'text-error'
                  )}>
                    {isZero ? '—' : isPositive ? `+${tx.deltaQty}` : tx.deltaQty}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

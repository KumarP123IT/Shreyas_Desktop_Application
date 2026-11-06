/**
 * Settings → MSL Configuration
 * Three sections: Global default, Customer defaults, Part overrides
 * Plus a "Resolved range preview" panel.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, Trash2, Edit2, Search, Upload, HelpCircle } from 'lucide-react';

import { mslApi } from '@/api/msl';
import { customersApi } from '@/api/customers';
import { useToast } from '@/components/ui/Toast';
import Dialog from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/Dialog';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Pagination from '@/components/ui/Pagination';

export default function MslConfig() {
  const [section, setSection] = useState('global'); // global | customer | parts | preview

  const tabs = [
    { id: 'global',   label: 'Global Default' },
    { id: 'customer', label: 'Customer Defaults' },
    { id: 'parts',    label: 'Part Overrides' },
    { id: 'preview',  label: 'Resolved Range Preview' },
  ];

  return (
    <div>
      <h2 className="text-base font-semibold text-text mb-4">MSL Configuration</h2>
      <p className="text-sm text-text-secondary mb-4">
        Priority: <strong>Part Override</strong> → <strong>Customer Default</strong> → <strong>Global Default</strong>
      </p>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border mb-5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={section === t.id}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              section === t.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'
            }`}
            onClick={() => setSection(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === 'global'   && <GlobalSection />}
      {section === 'customer' && <CustomerSection />}
      {section === 'parts'    && <PartOverridesSection />}
      {section === 'preview'  && <ResolverPreview />}
    </div>
  );
}

// ── Global default ─────────────────────────────────────────────────────────

function GlobalSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['msl-global'],
    queryFn: () => mslApi.getGlobal(),
    select: (r) => r.data.data,
    onSuccess: (d) => { if (d) { setMin(d.minQty); setMax(d.maxQty); } },
  });

  // Sync form when data loads
  React.useEffect(() => {
    if (data) { setMin(String(data.minQty)); setMax(String(data.maxQty)); }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (d) => mslApi.setGlobal(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['msl-global'] });
      toast.success('Global MSL default saved');
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Save failed'),
  });

  const handleSave = () => {
    const minQty = parseInt(min, 10);
    const maxQty = parseInt(max, 10);
    if (isNaN(minQty) || isNaN(maxQty)) return toast.error('Enter valid integers');
    if (maxQty <= minQty) return toast.error('Max must be greater than Min');
    mutation.mutate({ minQty, maxQty });
  };

  if (isLoading) return <SkeletonTable rows={2} cols={2} />;

  return (
    <div className="max-w-sm space-y-4">
      <p className="text-sm text-text-secondary">
        Applied to all parts and customers that have no specific override.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="fiori-label" htmlFor="g-min">Global Min Qty</label>
          <input id="g-min" type="number" min="0" value={min} onChange={e => setMin(e.target.value)} className="fiori-input" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="g-max">Global Max Qty</label>
          <input id="g-max" type="number" min="1" value={max} onChange={e => setMax(e.target.value)} className="fiori-input" />
        </div>
      </div>
      {parseInt(max) <= parseInt(min) && min && max && (
        <p className="text-xs text-error">Max must be greater than Min</p>
      )}
      <button className="fiori-btn-primary flex items-center gap-1.5" onClick={handleSave} disabled={mutation.isPending}>
        <Save size={14} /> {mutation.isPending ? 'Saving…' : 'Save Global Default'}
      </button>
    </div>
  );
}

// ── Customer defaults ───────────────────────────────────────────────────────

function CustomerSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState(null);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const { data: customerDefaults, isLoading } = useQuery({
    queryKey: ['msl-customer-defaults'],
    queryFn: () => mslApi.listCustomerDefaults(),
    select: (r) => r.data.data,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', { page: 1, pageSize: 200 }],
    queryFn: () => customersApi.list({ pageSize: 200 }),
    select: (r) => r.data.data,
  });

  const setMutation = useMutation({
    mutationFn: ({ id, data }) => mslApi.setCustomerDefault(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['msl-customer-defaults'] });
      toast.success('Customer default saved');
      setEditTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed'),
  });

  const clearMutation = useMutation({
    mutationFn: (id) => mslApi.clearCustomerDefault(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['msl-customer-defaults'] });
      toast.success('Customer default cleared');
    },
  });

  if (isLoading) return <SkeletonTable rows={4} cols={4} />;

  const defaultsMap = {};
  (customerDefaults || []).forEach((d) => { defaultsMap[d.customerId] = d; });
  const allCustomers = customers || [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Set per-customer min/max. Leave blank to inherit the global default.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-background border-b border-border text-left">
            <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Customer</th>
            <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Min</th>
            <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Max</th>
            <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Source</th>
            <th className="px-3 py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {allCustomers.map((c) => {
            const def = defaultsMap[c.id];
            return (
              <tr key={c.id} className="border-b border-border hover:bg-background/70">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2">{def ? def.minQty : <span className="text-text-secondary">—</span>}</td>
                <td className="px-3 py-2">{def ? def.maxQty : <span className="text-text-secondary">—</span>}</td>
                <td className="px-3 py-2">
                  <span className={`status-badge ${def ? 'status-normal' : 'status-unknown'}`}>
                    {def ? 'Customer' : 'Inherit global'}
                  </span>
                </td>
                <td className="px-3 py-2 flex gap-1">
                  <button
                    className="fiori-btn-ghost text-xs flex items-center gap-1"
                    onClick={() => { setEditTarget(c); setMin(def?.minQty ?? ''); setMax(def?.maxQty ?? ''); }}
                    aria-label={`Edit MSL for ${c.name}`}
                  >
                    <Edit2 size={12} />
                  </button>
                  {def && (
                    <button
                      className="fiori-btn-ghost text-xs text-error"
                      onClick={() => clearMutation.mutate(c.id)}
                      aria-label={`Clear MSL for ${c.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title={`Set MSL: ${editTarget?.name}`} size="sm"
        footer={
          <>
            <button className="fiori-btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
            <button
              className="fiori-btn-primary flex items-center gap-1"
              onClick={() => setMutation.mutate({ id: editTarget.id, data: { minQty: parseInt(min), maxQty: parseInt(max) } })}
              disabled={setMutation.isPending}
            >
              <Save size={13} /> Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="fiori-label" htmlFor="cm-min">Min Qty</label>
            <input id="cm-min" type="number" min="0" value={min} onChange={e => setMin(e.target.value)} className="fiori-input" />
          </div>
          <div>
            <label className="fiori-label" htmlFor="cm-max">Max Qty</label>
            <input id="cm-max" type="number" min="1" value={max} onChange={e => setMax(e.target.value)} className="fiori-input" />
          </div>
        </div>
        {parseInt(max) <= parseInt(min) && min && max && (
          <p className="text-xs text-error mt-2">Max must be greater than Min</p>
        )}
      </Dialog>
    </div>
  );
}

// ── Part overrides ─────────────────────────────────────────────────────────

function PartOverridesSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ partNumber: '', customerId: '', minQty: '', maxQty: '' });

  const { data: customers } = useQuery({
    queryKey: ['customers', { page: 1, pageSize: 200 }],
    queryFn: () => customersApi.list({ pageSize: 200 }),
    select: (r) => r.data.data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['msl-overrides', { search, page }],
    queryFn: () => mslApi.listOverrides({ search, page, pageSize: 20 }),
    select: (r) => r.data,
  });

  const createMutation = useMutation({
    mutationFn: (d) => mslApi.createOverride(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['msl-overrides'] }); toast.success('Override created'); setAddOpen(false); },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => mslApi.updateOverride(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['msl-overrides'] }); toast.success('Override updated'); setEditTarget(null); },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => mslApi.deleteOverride(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['msl-overrides'] }); toast.success('Override deleted'); setDeleteTarget(null); },
  });

  const overrides = data?.data ?? [];
  const meta = data?.meta ?? {};

  const resetForm = () => setForm({ partNumber: '', customerId: '', minQty: '', maxQty: '' });

  const handleSave = (isEdit = false) => {
    const payload = {
      partNumber: form.partNumber,
      customerId: form.customerId ? parseInt(form.customerId) : null,
      minQty: parseInt(form.minQty),
      maxQty: parseInt(form.maxQty),
    };
    if (isEdit) updateMutation.mutate({ id: editTarget.id, data: { minQty: payload.minQty, maxQty: payload.maxQty } });
    else createMutation.mutate(payload);
  };

  const overrideForm = (
    <div className="space-y-3">
      {!editTarget && (
        <div>
          <label className="fiori-label" htmlFor="po-pn">Part Number *</label>
          <input id="po-pn" value={form.partNumber} onChange={e => setForm({ ...form, partNumber: e.target.value })} className="fiori-input" placeholder="71109-06001-00" />
        </div>
      )}
      {!editTarget && (
        <div>
          <label className="fiori-label" htmlFor="po-cid">Customer (leave blank for global override)</label>
          <select id="po-cid" value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} className="fiori-input">
            <option value="">Global (all customers)</option>
            {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="fiori-label" htmlFor="po-min">Min Qty</label>
          <input id="po-min" type="number" min="0" value={form.minQty} onChange={e => setForm({ ...form, minQty: e.target.value })} className="fiori-input" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="po-max">Max Qty</label>
          <input id="po-max" type="number" min="1" value={form.maxQty} onChange={e => setForm({ ...form, maxQty: e.target.value })} className="fiori-input" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="search"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by part number…"
            className="fiori-input pl-8"
          />
        </div>
        <button
          className="fiori-btn-primary flex items-center gap-1.5 shrink-0"
          onClick={() => { resetForm(); setAddOpen(true); }}
        >
          <Plus size={14} /> Add Override
        </button>
      </div>

      {isLoading ? <SkeletonTable rows={4} cols={5} /> : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-background border-b border-border text-left">
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Part Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Scope</th>
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Min</th>
                <th className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Max</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {overrides.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-text-secondary text-sm">No part overrides yet.</td></tr>
              ) : overrides.map((o) => (
                <tr key={o.id} className="border-b border-border hover:bg-background/70">
                  <td className="px-3 py-2 font-mono text-xs">{o.partNumber}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    {o.customerId ? `Customer #${o.customerId}` : 'Global'}
                  </td>
                  <td className="px-3 py-2 font-semibold">{o.minQty}</td>
                  <td className="px-3 py-2 font-semibold">{o.maxQty}</td>
                  <td className="px-3 py-2 flex gap-1">
                    <button className="fiori-btn-ghost text-xs" onClick={() => { setEditTarget(o); setForm({ ...o, customerId: o.customerId ?? '' }); }} aria-label="Edit">
                      <Edit2 size={12} />
                    </button>
                    <button className="fiori-btn-ghost text-xs text-error" onClick={() => setDeleteTarget(o)} aria-label="Delete">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={meta.totalPages || 1} onPage={setPage} />
        </>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Part Override" size="sm"
        footer={
          <>
            <button className="fiori-btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="fiori-btn-primary" onClick={() => handleSave(false)} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save Override'}
            </button>
          </>
        }
      >{overrideForm}</Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Override: ${editTarget?.partNumber}`} size="sm"
        footer={
          <>
            <button className="fiori-btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
            <button className="fiori-btn-primary" onClick={() => handleSave(true)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >{overrideForm}</Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget?.id)}
        title="Delete Override"
        message={`Delete override for part "${deleteTarget?.partNumber}"?`}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Resolver preview ───────────────────────────────────────────────────────

function ResolverPreview() {
  const [customerId, setCustomerId] = useState('');
  const [partNo, setPartNo] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ['customers', { page: 1, pageSize: 200 }],
    queryFn: () => customersApi.list({ pageSize: 200 }),
    select: (r) => r.data.data,
  });

  const handleResolve = async () => {
    if (!partNo) return;
    setLoading(true);
    try {
      const r = await mslApi.resolve({ customerId: customerId || undefined, partNo });
      setResult(r.data.data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const sourceLabel = result?.source === 'part' ? 'Part Override' : result?.source === 'customer' ? 'Customer Default' : result?.source === 'global' ? 'Global Default' : 'Not Configured';
  const sourceBadge = result?.source ? (result.source === 'part' ? 'status-normal' : result.source === 'customer' ? 'status-below' : 'status-unknown') : 'status-unknown';

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-text-secondary flex items-start gap-1.5">
        <HelpCircle size={14} className="shrink-0 mt-0.5 text-info" />
        Choose a customer and enter a part number to see which MSL limits will be applied and from which level.
      </p>
      <div className="space-y-3">
        <div>
          <label className="fiori-label" htmlFor="rv-cid">Customer</label>
          <select id="rv-cid" value={customerId} onChange={e => setCustomerId(e.target.value)} className="fiori-input">
            <option value="">No specific customer (global lookup)</option>
            {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="fiori-label" htmlFor="rv-pn">Part Number</label>
          <input id="rv-pn" value={partNo} onChange={e => setPartNo(e.target.value)} placeholder="71109-06001-00" className="fiori-input" />
        </div>
        <button className="fiori-btn-primary" onClick={handleResolve} disabled={loading || !partNo}>
          {loading ? 'Resolving…' : 'Resolve'}
        </button>
      </div>

      {result && (
        <div className="fiori-card p-4 space-y-3 mt-2">
          {result.source ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Effective Range</span>
                <span className={`status-badge ${sourceBadge}`}>{sourceLabel}</span>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="fiori-label">Min Qty</p>
                  <p className="text-2xl font-bold text-text">{result.min}</p>
                </div>
                <div>
                  <p className="fiori-label">Max Qty</p>
                  <p className="text-2xl font-bold text-text">{result.max}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="message-strip-warning">
              No MSL limits configured for this part/customer combination. Status will be <strong>NOT_CONFIGURED</strong>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

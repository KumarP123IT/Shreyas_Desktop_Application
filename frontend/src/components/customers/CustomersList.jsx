import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, LayoutGrid, List, ArchiveRestore, Trash2, Building2 } from 'lucide-react';
import clsx from 'clsx';

import { customersApi } from '@/api/customers';
import { useToast } from '@/components/ui/Toast';
import Dialog from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/Dialog';
import PageHeader from '@/components/ui/PageHeader';
import SkeletonTable from '@/components/ui/SkeletonTable';
import Pagination from '@/components/ui/Pagination';
import CustomerForm from './CustomerForm';

export default function CustomersList() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch]               = useState('');
  const [page, setPage]                   = useState(1);
  const [includeArchived, setArchived]    = useState(false);
  const [viewMode, setViewMode]           = useState('table'); // 'table' | 'card'
  const [addOpen, setAddOpen]             = useState(false);
  const [serverError, setServerError]     = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, page, includeArchived }],
    queryFn: () => customersApi.list({ search, page, pageSize: 20, includeArchived }),
    select: (r) => r.data,
  });

  const createMutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created successfully');
      setAddOpen(false);
      setServerError('');
    },
    onError: (e) => setServerError(e.response?.data?.error?.message || 'Failed to create customer'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => customersApi.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer archived');
      setArchiveTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Failed to archive'),
  });

  const restoreMutation = useMutation({
    mutationFn: (id) => customersApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer restored');
    },
  });

  const customers = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        title="Customers"
        subtitle={`${meta.total ?? 0} customer${(meta.total ?? 0) !== 1 ? 's' : ''}`}
        actions={
          <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => { setAddOpen(true); setServerError(''); }}>
            <Plus size={16} /> Add Customer
          </button>
        }
      />

      {/* Toolbar */}
      <div className="fiori-card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or supplier code…"
            className="fiori-input pl-8"
            aria-label="Search customers"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setArchived(e.target.checked)}
            className="accent-primary w-4 h-4"
          />
          Show archived
        </label>
        <div className="flex rounded-control border border-border overflow-hidden">
          <button
            className={clsx('px-3 py-1.5 text-sm transition-colors', viewMode === 'table' ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-background')}
            onClick={() => setViewMode('table')}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
          >
            <List size={15} />
          </button>
          <button
            className={clsx('px-3 py-1.5 text-sm transition-colors', viewMode === 'card' ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-background')}
            onClick={() => setViewMode('card')}
            aria-label="Card view"
            aria-pressed={viewMode === 'card'}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="fiori-card overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : customers.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : viewMode === 'table' ? (
          <TableView
            customers={customers}
            onView={(c) => navigate(`/customers/${c.id}`)}
            onArchive={(c) => setArchiveTarget(c)}
            onRestore={(c) => restoreMutation.mutate(c.id)}
          />
        ) : (
          <CardView
            customers={customers}
            onView={(c) => navigate(`/customers/${c.id}`)}
            onArchive={(c) => setArchiveTarget(c)}
            onRestore={(c) => restoreMutation.mutate(c.id)}
          />
        )}
        {meta.totalPages > 1 && (
          <div className="px-4 pb-3">
            <Pagination page={page} totalPages={meta.totalPages} onPage={setPage} />
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Customer" size="lg">
        <CustomerForm
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          serverError={serverError}
        />
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveMutation.mutate(archiveTarget?.id)}
        title="Archive Customer"
        message={`Archive "${archiveTarget?.name}"? It will be hidden from active lists but can be restored.`}
        confirmLabel="Archive"
        danger
        loading={archiveMutation.isPending}
      />
    </div>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────
function TableView({ customers, onView, onArchive, onRestore }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" role="grid">
        <thead>
          <tr className="bg-background border-b border-border text-left">
            <th className="px-4 py-3 font-semibold text-text-secondary text-xs uppercase tracking-wide">Customer</th>
            <th className="px-4 py-3 font-semibold text-text-secondary text-xs uppercase tracking-wide">Supplier Code</th>
            <th className="px-4 py-3 font-semibold text-text-secondary text-xs uppercase tracking-wide">Contact</th>
            <th className="px-4 py-3 font-semibold text-text-secondary text-xs uppercase tracking-wide">Deliveries</th>
            <th className="px-4 py-3 font-semibold text-text-secondary text-xs uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr
              key={c.id}
              className="border-b border-border hover:bg-background/70 transition-colors cursor-pointer"
              onClick={() => onView(c)}
              role="row"
            >
              <td className="px-4 py-3 font-medium text-text">{c.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">{c.supplierCode}</td>
              <td className="px-4 py-3 text-text-secondary">{c.contactName || '—'}</td>
              <td className="px-4 py-3 text-text-secondary">{c._count?.deliveries ?? 0}</td>
              <td className="px-4 py-3">
                <span className={clsx('status-badge', c.deletedAt ? 'status-unknown' : 'status-normal')}>
                  {c.deletedAt ? 'Archived' : 'Active'}
                </span>
              </td>
              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                {c.deletedAt ? (
                  <button
                    onClick={() => onRestore(c)}
                    className="fiori-btn-ghost text-xs flex items-center gap-1"
                    aria-label={`Restore ${c.name}`}
                  >
                    <ArchiveRestore size={13} /> Restore
                  </button>
                ) : (
                  <button
                    onClick={() => onArchive(c)}
                    className="fiori-btn-ghost text-xs text-error flex items-center gap-1"
                    aria-label={`Archive ${c.name}`}
                  >
                    <Trash2 size={13} /> Archive
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Card view ─────────────────────────────────────────────────────────────────
function CardView({ customers, onView, onArchive, onRestore }) {
  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {customers.map((c) => (
        <div
          key={c.id}
          className={clsx(
            'border border-border rounded-card p-4 cursor-pointer hover:shadow-fiori-md transition-all',
            c.deletedAt ? 'opacity-60' : ''
          )}
          onClick={() => onView(c)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onView(c)}
          aria-label={`View ${c.name}`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-primary" />
            </div>
            <span className={clsx('status-badge text-xs', c.deletedAt ? 'status-unknown' : 'status-normal')}>
              {c.deletedAt ? 'Archived' : 'Active'}
            </span>
          </div>
          <p className="font-semibold text-text text-sm leading-snug">{c.name}</p>
          <p className="text-xs text-text-secondary mt-0.5 font-mono">{c.supplierCode}</p>
          <p className="text-xs text-text-secondary mt-2">{c._count?.deliveries ?? 0} deliveries</p>
          {c.contactName && <p className="text-xs text-text-secondary">{c.contactName}</p>}
          <div className="mt-3 pt-2 border-t border-border flex justify-end" onClick={(e) => e.stopPropagation()}>
            {c.deletedAt ? (
              <button onClick={() => onRestore(c)} className="text-xs text-primary hover:underline flex items-center gap-1">
                <ArchiveRestore size={12} /> Restore
              </button>
            ) : (
              <button onClick={() => onArchive(c)} className="text-xs text-error hover:underline flex items-center gap-1">
                <Trash2 size={12} /> Archive
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <Building2 size={40} className="text-border mb-3" />
      <p className="font-semibold text-text">No customers yet</p>
      <p className="text-sm text-text-secondary mt-1 mb-4">Add your first customer to get started.</p>
      <button className="fiori-btn-primary flex items-center gap-1.5" onClick={onAdd}>
        <Plus size={15} /> Add Customer
      </button>
    </div>
  );
}

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, Save, X } from 'lucide-react';

import { customersApi } from '@/api/customers';
import { mslApi } from '@/api/msl';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import Dialog from '@/components/ui/Dialog';
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

  const tabs = ['details', 'msl', 'reminders', 'deliveries'];

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
            {tab === 'msl' ? 'MSL Defaults' : tab === 'reminders' ? 'Reminder Defaults' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

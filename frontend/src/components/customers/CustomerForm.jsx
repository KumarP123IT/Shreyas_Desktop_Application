/**
 * Customer add/edit form – React Hook Form + Zod.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';

const schema = z.object({
  name:               z.string().min(1, 'Name is required').max(200),
  supplierCode:       z.string().min(1, 'Supplier code is required').max(50),
  contactName:        z.string().max(150).optional().nullable(),
  contactEmail:       z.string().email('Invalid email').optional().or(z.literal('')).nullable(),
  contactWhatsapp:    z.string().max(30).optional().nullable(),
  notes:              z.string().optional().nullable(),
  notifyWhatsapp:     z.boolean().default(true),
  notifyEmail:        z.boolean().default(true),
  recipientEmail:     z.string().email('Invalid email').optional().or(z.literal('')).nullable(),
  recipientWhatsapp:  z.string().max(30).optional().nullable(),
  qtyCheckMode:       z.enum(['forecast', 'actual']).default('forecast'),
});

export default function CustomerForm({ defaultValues, onSubmit, isLoading, serverError }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || {
      name: '', supplierCode: '', contactName: '', contactEmail: '',
      contactWhatsapp: '', notes: '', notifyWhatsapp: true, notifyEmail: true,
      recipientEmail: '', recipientWhatsapp: '', qtyCheckMode: 'forecast',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <div className="message-strip-error flex items-start gap-2" role="alert">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="fiori-label" htmlFor="c-name">Customer Name *</label>
          <input id="c-name" {...register('name')} className="fiori-input" placeholder="Kirloskar Toyota…" />
          {errors.name && <p className="text-xs text-error mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="fiori-label" htmlFor="c-code">Supplier Code *</label>
          <input id="c-code" {...register('supplierCode')} className="fiori-input" placeholder="S0965" />
          {errors.supplierCode && <p className="text-xs text-error mt-1">{errors.supplierCode.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="fiori-label" htmlFor="c-contact">Contact Person</label>
          <input id="c-contact" {...register('contactName')} className="fiori-input" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="c-email">Contact Email</label>
          <input id="c-email" type="email" {...register('contactEmail')} className="fiori-input" />
          {errors.contactEmail && <p className="text-xs text-error mt-1">{errors.contactEmail.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="fiori-label" htmlFor="c-wa">Contact WhatsApp</label>
          <input id="c-wa" {...register('contactWhatsapp')} className="fiori-input" placeholder="919876543210" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="c-qty">Quantity Check Mode</label>
          <select id="c-qty" {...register('qtyCheckMode')} className="fiori-input">
            <option value="forecast">Forecast Total (default)</option>
            <option value="actual">Actual Stock</option>
          </select>
        </div>
      </div>

      <div>
        <label className="fiori-label" htmlFor="c-notes">Notes</label>
        <textarea id="c-notes" {...register('notes')} className="fiori-input min-h-[72px] resize-y" />
      </div>

      <fieldset className="border border-border rounded-control p-3">
        <legend className="text-xs font-semibold text-text-secondary px-1">Notification Channels</legend>
        <div className="flex flex-wrap gap-4 mt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('notifyWhatsapp')} className="accent-primary w-4 h-4" />
            Send WhatsApp reminders
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('notifyEmail')} className="accent-primary w-4 h-4" />
            Send email reminders
          </label>
        </div>
      </fieldset>

      <fieldset className="border border-border rounded-control p-3">
        <legend className="text-xs font-semibold text-text-secondary px-1">Recipient Overrides (leave blank to use global settings)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div>
            <label className="fiori-label" htmlFor="c-remail">Override Email</label>
            <input id="c-remail" type="email" {...register('recipientEmail')} className="fiori-input" />
            {errors.recipientEmail && <p className="text-xs text-error mt-1">{errors.recipientEmail.message}</p>}
          </div>
          <div>
            <label className="fiori-label" htmlFor="c-rwa">Override WhatsApp</label>
            <input id="c-rwa" {...register('recipientWhatsapp')} className="fiori-input" placeholder="919876543210" />
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="submit"
          className="fiori-btn-primary"
          disabled={isLoading}
        >
          {isLoading ? 'Saving…' : 'Save Customer'}
        </button>
      </div>
    </form>
  );
}

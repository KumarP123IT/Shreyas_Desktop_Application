import React, { useEffect, useState } from 'react';
import { Save, Users } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useSettings } from './useSettings';

export default function RecipientsSettings() {
  const { settings, isLoading, save, saving } = useSettings();
  const [form, setForm] = useState({ recipient_whatsapp: '', recipient_email: '' });

  useEffect(() => {
    if (settings.recipient_whatsapp !== undefined) {
      setForm({
        recipient_whatsapp: settings.recipient_whatsapp || '',
        recipient_email: settings.recipient_email || '',
      });
    }
  }, [settings]);

  if (isLoading) return <SkeletonTable rows={3} cols={2} />;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          <Users size={16} className="text-primary" /> Notification Recipients
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Default recipients for system notifications. A customer can override these in its own settings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="fiori-label" htmlFor="rc-wa">WhatsApp number</label>
          <input id="rc-wa" className="fiori-input" value={form.recipient_whatsapp}
            onChange={(e) => setForm({ ...form, recipient_whatsapp: e.target.value })}
            placeholder="919876543210 (with country code)" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="rc-email">Email address</label>
          <input id="rc-email" type="email" className="fiori-input" value={form.recipient_email}
            onChange={(e) => setForm({ ...form, recipient_email: e.target.value })}
            placeholder="alerts@shreyas.local" />
        </div>
      </div>

      <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => save(form)} disabled={saving}>
        <Save size={14} /> {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

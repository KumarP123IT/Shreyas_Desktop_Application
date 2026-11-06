import React, { useEffect, useState } from 'react';
import { Save, Mail } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useSettings } from './useSettings';

export default function RecipientsSettings() {
  const { settings, isLoading, save, saving } = useSettings();
  const [form, setForm] = useState({ recipient_email: '' });

  useEffect(() => {
    if (settings.recipient_email !== undefined) {
      setForm({ recipient_email: settings.recipient_email || '' });
    }
  }, [settings]);

  if (isLoading) return <SkeletonTable rows={3} cols={2} />;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          <Mail size={16} className="text-primary" /> Default Email Recipient
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          The default email address that receives delivery reminders and MSL alerts.
          Individual customers can override this in their own profile.
        </p>
        <p className="text-xs text-text-secondary mt-1">
          To configure the WhatsApp receiver number, go to <strong>Settings → WhatsApp</strong>.
        </p>
      </div>

      <div className="max-w-sm">
        <label className="fiori-label" htmlFor="rc-email">Default receiver email</label>
        <input
          id="rc-email"
          type="email"
          className="fiori-input"
          value={form.recipient_email}
          onChange={(e) => setForm({ recipient_email: e.target.value })}
          placeholder="alerts@shreyas.local"
        />
      </div>

      <button
        className="fiori-btn-primary flex items-center gap-1.5"
        onClick={() => save(form)}
        disabled={saving}
      >
        <Save size={14} /> {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

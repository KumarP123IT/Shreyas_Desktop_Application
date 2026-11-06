import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save, Send, ShieldCheck, ShieldAlert } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useToast } from '@/components/ui/Toast';
import { settingsApi } from '@/api/settings';
import { useSettings } from './useSettings';

export default function EmailSettings() {
  const toast = useToast();
  const { settings, isLoading, save, saving } = useSettings();

  const [form, setForm] = useState({ smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: '' });
  const [testTo, setTestTo]   = useState('');
  const [verify, setVerify]   = useState(null); // { ok, error? }

  useEffect(() => {
    if (settings.smtp_host !== undefined) {
      setForm({
        smtp_host: settings.smtp_host || '',
        smtp_port: settings.smtp_port || '587',
        smtp_user: settings.smtp_user || '',
        smtp_pass: settings.smtp_pass || '',
        smtp_from: settings.smtp_from || '',
      });
    }
  }, [settings]);

  const verifyQuery = useQuery({
    queryKey: ['smtp-verify'],
    queryFn: async () => (await settingsApi.verifySmtp()).data.data,
    enabled: false,
  });

  const handleVerify = async () => {
    const r = await verifyQuery.refetch();
    setVerify(r.data ?? null);
  };

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testEmail(testTo),
    onSuccess: () => toast.success(`Test email sent to ${testTo}`),
    onError:   (e) => toast.error(e.response?.data?.error?.message || 'Test email failed'),
  });

  if (isLoading) return <SkeletonTable rows={6} cols={2} />;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-text">Email (SMTP)</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Outgoing mail server settings. Gmail requires an App Password; Zoho/Outlook use their own SMTP hosts.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="fiori-label" htmlFor="smtp-host">SMTP Host</label>
          <input id="smtp-host" className="fiori-input" value={form.smtp_host}
            onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
            placeholder="smtp.gmail.com" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="smtp-port">Port</label>
          <input id="smtp-port" type="number" className="fiori-input" value={form.smtp_port}
            onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} placeholder="587" />
          <p className="text-xs text-text-secondary mt-1">587 = STARTTLS · 465 = SSL</p>
        </div>
        <div>
          <label className="fiori-label" htmlFor="smtp-from">
            From Address
          </label>
          <input id="smtp-from" type="email" className="fiori-input" value={form.smtp_from}
            onChange={(e) => setForm({ ...form, smtp_from: e.target.value })}
            placeholder="alerts@shreyas.local" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="smtp-user">Username</label>
          <input id="smtp-user" className="fiori-input" value={form.smtp_user}
            onChange={(e) => setForm({ ...form, smtp_user: e.target.value })}
            placeholder="you@gmail.com" autoComplete="off" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="smtp-pass">
            Password / App Password{' '}
            {settings.smtp_pass ? <span className="text-success normal-case font-normal">(set)</span> : null}
          </label>
          <input id="smtp-pass" type="password" className="fiori-input" value={form.smtp_pass}
            onChange={(e) => setForm({ ...form, smtp_pass: e.target.value })}
            placeholder={settings.smtp_pass ? '•••••••• (leave blank to keep)' : 'App password'}
            autoComplete="new-password" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => save(form)} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          className="fiori-btn-secondary flex items-center gap-1.5"
          onClick={handleVerify}
          disabled={verifyQuery.isFetching}
        >
          {verifyQuery.isFetching
            ? <ShieldAlert size={14} className="animate-pulse" />
            : <ShieldCheck size={14} />}
          Verify Connection
        </button>
        {verify && (
          <span className={`status-badge ${verify.ok ? 'status-normal' : 'status-below'}`}>
            {verify.ok
              ? <><ShieldCheck size={11} /> SMTP OK</>
              : <><ShieldAlert size={11} /> {verify.error || 'Connection failed'}</>}
          </span>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-text mb-2">Send test email</h3>
        <div className="flex gap-2 max-w-md">
          <input
            type="email"
            className="fiori-input"
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            aria-label="Test recipient email"
          />
          <button
            className="fiori-btn-primary flex items-center gap-1.5 shrink-0"
            onClick={() => testMutation.mutate()}
            disabled={!testTo || testMutation.isPending}
          >
            <Send size={14} /> {testMutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

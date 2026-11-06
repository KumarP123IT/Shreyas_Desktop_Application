import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Save, Send, QrCode, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useToast } from '@/components/ui/Toast';
import { settingsApi } from '@/api/settings';
import { useSettings } from './useSettings';

export default function WhatsAppSettings() {
  const toast = useToast();
  const { settings, isLoading, save, saving } = useSettings();

  const [form, setForm] = useState({ waha_url: '', waha_api_key: '', waha_session: 'default' });
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState(null);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (settings.waha_url !== undefined) {
      setForm({
        waha_url: settings.waha_url || '',
        // Prefill with the masked placeholder – stripped on save so the
        // stored secret is preserved unless the user types a new key.
        waha_api_key: settings.waha_api_key || '',
        waha_session: settings.waha_session || 'default',
      });
    }
  }, [settings]);

  const refreshStatus = async () => {
    try {
      const r = await settingsApi.wahaStatus();
      setStatus(r.data.data);
    } catch (e) {
      setStatus({ ok: false, status: 'error', error: e.message });
    }
  };

  useEffect(() => { refreshStatus(); }, []);

  const qrMutation = useMutation({
    mutationFn: () => settingsApi.wahaQr(),
    onSuccess: (r) => {
      if (r.data.data?.qr) setQr(r.data.data.qr);
      else toast.error(r.data.data?.error || 'Could not get QR code');
    },
    onError: () => toast.error('QR request failed'),
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testWhatsapp(testTo),
    onSuccess: () => toast.success(`Test message sent to ${testTo}`),
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Test message failed'),
  });

  if (isLoading) return <SkeletonTable rows={5} cols={2} />;

  const sessionOk = status?.ok && (status.status === 'WORKING' || status.status === 'SCAN_QR_CODE' || status.status === 'ok');

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-text">WhatsApp (WAHA)</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Connect via a self-hosted WAHA instance. Pair by scanning the QR code with WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="fiori-label" htmlFor="wa-url">WAHA URL</label>
          <input id="wa-url" className="fiori-input" value={form.waha_url}
            onChange={(e) => setForm({ ...form, waha_url: e.target.value })}
            placeholder="http://localhost:3000" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="wa-key">API Key {settings.waha_api_key ? <span className="text-success normal-case">(set)</span> : null}</label>
          <input id="wa-key" type="password" className="fiori-input" value={form.waha_api_key}
            onChange={(e) => setForm({ ...form, waha_api_key: e.target.value })}
            placeholder={settings.waha_api_key ? '•••••••• (leave blank to keep)' : 'WAHA API key'}
            autoComplete="new-password" />
        </div>
        <div>
          <label className="fiori-label" htmlFor="wa-session">Session Name</label>
          <input id="wa-session" className="fiori-input" value={form.waha_session}
            onChange={(e) => setForm({ ...form, waha_session: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => save(form)} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={refreshStatus}>
          <RefreshCw size={14} /> Check Status
        </button>
        <button className="fiori-btn-secondary flex items-center gap-1.5" onClick={() => qrMutation.mutate()} disabled={qrMutation.isPending}>
          <QrCode size={14} /> {qrMutation.isPending ? 'Loading…' : 'Show QR Code'}
        </button>
        {status && (
          <span className={`status-badge ${sessionOk ? 'status-normal' : 'status-below'}`}>
            {sessionOk ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
            {status.ok ? `Session: ${status.status}` : `Error: ${status.error || status.status}`}
          </span>
        )}
      </div>

      {qr && (
        <div className="fiori-card p-4 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
          <img src={qr} alt="WhatsApp pairing QR code" className="w-52 h-52 border border-border rounded-control" />
          <p className="text-xs text-text-secondary">WhatsApp → Linked Devices → Link a Device</p>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-text mb-2">Send test message</h3>
        <div className="flex gap-2 max-w-md">
          <input
            className="fiori-input"
            placeholder="e.g. 919876543210"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            aria-label="Test recipient number"
          />
          <button
            className="fiori-btn-primary flex items-center gap-1.5 shrink-0"
            onClick={() => testMutation.mutate()}
            disabled={!testTo || testMutation.isPending}
          >
            <Send size={14} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * WhatsApp Settings – redesigned for clarity.
 *
 * Two-phone model:
 *   SENDER  phone  → connected to WAHA, scans QR, sends alerts
 *   RECEIVER phone → gets the alert messages (recipient number)
 */
import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Save, Send, QrCode, RefreshCw, CheckCircle2, XCircle,
  Smartphone, ArrowRight, Bell, Settings2, Eye, EyeOff,
} from 'lucide-react';
import clsx from 'clsx';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useToast } from '@/components/ui/Toast';
import { settingsApi } from '@/api/settings';
import { useSettings } from './useSettings';
import { useThemeStore } from '@/store/themeStore';

export default function WhatsAppSettings() {
  const toast = useToast();
  const { settings, isLoading, save, saving } = useSettings();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const [wahaForm, setWahaForm] = useState({
    waha_url: '',
    waha_api_key: '',
    waha_session: 'default',
  });
  const [recipientForm, setRecipientForm] = useState({
    recipient_whatsapp: '',
  });

  const [showKey, setShowKey]   = useState(false);
  const [status, setStatus]     = useState(null);
  const [qr, setQr]             = useState(null);
  const [testTo, setTestTo]     = useState('');

  useEffect(() => {
    if (settings.waha_url !== undefined) {
      setWahaForm({
        waha_url:     settings.waha_url     || '',
        waha_api_key: settings.waha_api_key || '',
        waha_session: settings.waha_session || 'default',
      });
    }
    if (settings.recipient_whatsapp !== undefined) {
      setRecipientForm({ recipient_whatsapp: settings.recipient_whatsapp || '' });
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
    mutationFn: () => settingsApi.testWhatsapp(testTo || recipientForm.recipient_whatsapp),
    onSuccess: () => toast.success(`Test message sent to ${testTo || recipientForm.recipient_whatsapp}`),
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Test message failed'),
  });

  if (isLoading) return <SkeletonTable rows={6} cols={2} />;

  const isConnected = status?.ok && (
    status.status === 'WORKING' ||
    status.status === 'ok' ||
    status.status === 'SCAN_QR_CODE'
  );
  const isWorking = status?.ok && (status.status === 'WORKING' || status.status === 'ok');

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-text">WhatsApp Notifications</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Two phones are involved — one sends the alerts, one receives them.
        </p>
      </div>

      {/* ── Two-phone explainer ──────────────────────────────────────── */}
      <div className={clsx(
        'rounded-card p-4 flex items-center gap-3 flex-wrap',
        isDark ? 'bg-[#162030] border border-[#243650]' : 'bg-[#F0F6FF] border border-[#C8DCFF]'
      )}>
        {/* Sender phone */}
        <div className="flex items-center gap-2 min-w-[130px]">
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            isDark ? 'bg-blue-500/20' : 'bg-blue-100'
          )}>
            <Smartphone size={17} className={isDark ? 'text-blue-300' : 'text-blue-600'} />
          </div>
          <div>
            <p className={clsx('text-xs font-bold', isDark ? 'text-blue-300' : 'text-blue-700')}>SENDER phone</p>
            <p className="text-[11px] text-text-secondary leading-tight">Connected to WAHA<br/>Scans the QR code</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <ArrowRight size={18} className="text-text-secondary" />
          <span className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider">sends alert</span>
        </div>

        {/* Receiver phone */}
        <div className="flex items-center gap-2 min-w-[130px]">
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            isDark ? 'bg-green-500/20' : 'bg-green-100'
          )}>
            <Bell size={17} className={isDark ? 'text-green-300' : 'text-green-700'} />
          </div>
          <div>
            <p className={clsx('text-xs font-bold', isDark ? 'text-green-300' : 'text-green-700')}>RECEIVER phone</p>
            <p className="text-[11px] text-text-secondary leading-tight">Your WhatsApp number<br/>Gets the notifications</p>
          </div>
        </div>

        {/* Connection status pill */}
        {status && (
          <div className="ml-auto shrink-0">
            <span className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
              isWorking
                ? (isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700 border border-green-200')
                : (isDark ? 'bg-red-500/20 text-red-300'   : 'bg-red-50 text-red-600 border border-red-200')
            )}>
              {isWorking ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {isWorking ? 'Connected' : (status.status === 'SCAN_QR_CODE' ? 'Needs QR scan' : 'Not connected')}
            </span>
          </div>
        )}
      </div>

      {/* ── Section 1: SENDER — WAHA connection ────────────────────── */}
      <div className="fiori-card overflow-hidden">
        <div className={clsx(
          'flex items-center gap-2 px-5 py-3 border-b border-border',
          isDark ? 'bg-blue-500/5' : 'bg-blue-50/60'
        )}>
          <div className={clsx('w-2 h-2 rounded-full', isWorking ? 'bg-green-500' : 'bg-gray-400')} />
          <Smartphone size={14} className={isDark ? 'text-blue-300' : 'text-blue-600'} />
          <h3 className="text-sm font-bold text-text">Sender Phone — WAHA Connection</h3>
          <span className="text-xs text-text-secondary ml-1">(the phone that sends alerts)</span>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-text-secondary">
            WAHA runs in Docker and connects your sender phone to the app.
            Start it with <code className={clsx('px-1.5 py-0.5 rounded text-xs font-mono', isDark ? 'bg-white/10' : 'bg-gray-100')}>docker compose up -d</code>,
            then scan the QR code with the sender phone.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="fiori-label" htmlFor="wa-url">WAHA Server URL</label>
              <input
                id="wa-url"
                className="fiori-input"
                value={wahaForm.waha_url}
                onChange={(e) => setWahaForm({ ...wahaForm, waha_url: e.target.value })}
                placeholder="http://localhost:3000"
              />
              <p className="text-[11px] text-text-secondary mt-1">Usually http://localhost:3000 when running on the same PC.</p>
            </div>

            <div>
              <label className="fiori-label" htmlFor="wa-key">
                API Key
                {settings.waha_api_key && <span className="text-success normal-case ml-1">(saved)</span>}
              </label>
              <div className="relative">
                <input
                  id="wa-key"
                  type={showKey ? 'text' : 'password'}
                  className="fiori-input pr-10"
                  value={wahaForm.waha_api_key}
                  onChange={(e) => setWahaForm({ ...wahaForm, waha_api_key: e.target.value })}
                  placeholder={settings.waha_api_key ? '•••••••• (leave blank to keep)' : 'Optional API key'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="fiori-label" htmlFor="wa-session">Session Name</label>
              <input
                id="wa-session"
                className="fiori-input"
                value={wahaForm.waha_session}
                onChange={(e) => setWahaForm({ ...wahaForm, waha_session: e.target.value })}
                placeholder="default"
              />
              <p className="text-[11px] text-text-secondary mt-1">Leave as "default" unless you have multiple sessions.</p>
            </div>
          </div>

          {/* Actions row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              className="fiori-btn-primary flex items-center gap-1.5 text-sm"
              onClick={() => save(wahaForm).then(refreshStatus)}
              disabled={saving}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="fiori-btn-secondary flex items-center gap-1.5 text-sm"
              onClick={refreshStatus}
            >
              <RefreshCw size={14} /> Check Status
            </button>
            <button
              className="fiori-btn-secondary flex items-center gap-1.5 text-sm"
              onClick={() => { setQr(null); qrMutation.mutate(); }}
              disabled={qrMutation.isPending}
            >
              <QrCode size={14} /> {qrMutation.isPending ? 'Loading…' : 'Show QR Code'}
            </button>
          </div>

          {/* QR code panel */}
          {qr && (
            <div className={clsx(
              'rounded-control p-4 flex flex-col items-center gap-3 border',
              isDark ? 'bg-white/5 border-[#243650]' : 'bg-[#F8FAFC] border-[#D9D9D9]'
            )}>
              <div className={clsx('p-2 rounded-lg', isDark ? 'bg-white' : '')}>
                <img src={qr} alt="WhatsApp pairing QR code" className="w-48 h-48 rounded" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text">Scan with the SENDER phone</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  WhatsApp → Settings → Linked Devices → Link a Device
                </p>
              </div>
              <button
                className="fiori-btn-ghost text-xs flex items-center gap-1"
                onClick={() => setQr(null)}
              >
                <XCircle size={12} /> Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: RECEIVER — who gets the alerts ──────────────── */}
      <div className="fiori-card overflow-hidden">
        <div className={clsx(
          'flex items-center gap-2 px-5 py-3 border-b border-border',
          isDark ? 'bg-green-500/5' : 'bg-green-50/60'
        )}>
          <Bell size={14} className={isDark ? 'text-green-300' : 'text-green-600'} />
          <h3 className="text-sm font-bold text-text">Receiver Phone — Who Gets Alerts</h3>
          <span className="text-xs text-text-secondary ml-1">(your WhatsApp number)</span>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-text-secondary">
            This is the number that receives delivery reminders and MSL breach alerts.
            It can be different from the sender phone.
            Individual customers can also have their own receiver number set under their profile.
          </p>

          <div className="max-w-sm">
            <label className="fiori-label" htmlFor="recv-wa">Default receiver WhatsApp number</label>
            <input
              id="recv-wa"
              className="fiori-input"
              value={recipientForm.recipient_whatsapp}
              onChange={(e) => setRecipientForm({ ...recipientForm, recipient_whatsapp: e.target.value })}
              placeholder="919876543210 (country code + number, no + or spaces)"
            />
            <p className="text-[11px] text-text-secondary mt-1">
              Example: India +91 98765 43210 → enter <strong>919876543210</strong>
            </p>
          </div>

          <button
            className="fiori-btn-primary flex items-center gap-1.5 text-sm"
            onClick={() => save(recipientForm)}
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save Receiver Number'}
          </button>
        </div>
      </div>

      {/* ── Section 3: Test ─────────────────────────────────────────── */}
      <div className="fiori-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Send size={14} className="text-primary" />
          <h3 className="text-sm font-bold text-text">Send a Test Message</h3>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-text-secondary">
            Sends a test message from the SENDER phone to verify the connection works end-to-end.
            Defaults to the receiver number above, or enter any number below.
          </p>
          <div className="flex gap-2 max-w-md">
            <input
              className="fiori-input"
              placeholder={recipientForm.recipient_whatsapp || '919876543210'}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              aria-label="Test recipient number (optional override)"
            />
            <button
              className="fiori-btn-primary flex items-center gap-1.5 shrink-0 text-sm"
              onClick={() => testMutation.mutate()}
              disabled={(!testTo && !recipientForm.recipient_whatsapp) || testMutation.isPending}
            >
              <Send size={14} /> {testMutation.isPending ? 'Sending…' : 'Send Test'}
            </button>
          </div>
          {!isWorking && (
            <p className={clsx(
              'text-xs flex items-center gap-1.5 px-3 py-2 rounded-control',
              isDark ? 'bg-yellow-500/10 text-yellow-300' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            )}>
              <XCircle size={12} />
              WAHA is not connected. Save the WAHA settings and scan the QR code first.
            </p>
          )}
        </div>
      </div>

    </div>
  );
}

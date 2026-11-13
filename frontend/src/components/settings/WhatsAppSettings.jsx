/**
 * WhatsApp Setup — Baileys (no Docker)
 *
 * Simple 3-step flow:
 *   Step 1 – Scan QR code with your sender phone
 *   Step 2 – Enter the receiver number
 *   Step 3 – Send a test message
 *
 * WhatsApp runs directly inside the app — no Docker, no extra installs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, QrCode,
  Send, Smartphone, Bell, LogOut, Save,
} from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/components/ui/Toast';
import { settingsApi } from '@/api/settings';
import { useSettings } from './useSettings';

// ── Step wrapper ───────────────────────────────────────────────────────────

function Step({ n, title, done, active, children }) {
  return (
    <div className={clsx(
      'rounded-card border transition-all',
      done   ? 'border-green-200 bg-green-50/40'
             : active ? 'border-[#0070F2]/40 bg-white shadow-fiori'
             : 'border-[#E2E8F0] bg-[#FAFBFC] opacity-60'
    )}>
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Circle */}
        {done ? (
          <div className="w-8 h-8 rounded-full bg-[#188918] flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} className="text-white" />
          </div>
        ) : (
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold border-2',
            active ? 'border-[#0070F2] bg-[#0070F2] text-white' : 'border-[#D4DCE8] text-[#8A9AAD]'
          )}>
            {n}
          </div>
        )}
        <span className={clsx(
          'text-sm font-semibold flex-1',
          done ? 'text-green-700' : active ? 'text-[#1D2D3E]' : 'text-[#8A9AAD]'
        )}>
          {title}
        </span>
        {done && <span className="text-xs font-semibold text-green-600">Done ✓</span>}
      </div>
      {(active || done) && children && (
        <div className="px-5 pb-5">{children}</div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function WhatsAppSettings() {
  const toast = useToast();
  const { settings, isLoading, save, saving } = useSettings();

  const [receiverNo, setReceiverNo]     = useState('');
  const [testTo,     setTestTo]         = useState('');
  const [qr,         setQr]             = useState(null);
  const [waStatus,   setWaStatus]       = useState(null);  // { ok, status }
  const [checking,   setChecking]       = useState(false);
  const [qrLoading,  setQrLoading]      = useState(false);

  // Sync receiver number from saved settings
  useEffect(() => {
    if (settings?.recipient_whatsapp) setReceiverNo(settings.recipient_whatsapp);
  }, [settings]);

  // ── Poll status every 5s while not connected ───────────────────────────
  const refreshStatus = useCallback(async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const r = await settingsApi.wahaStatus();
      setWaStatus(r.data.data);
    } catch {
      setWaStatus({ ok: false, status: 'STOPPED' });
    } finally {
      if (!silent) setChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus(true);
    const id = setInterval(() => refreshStatus(true), 5000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const logoutMutation = useMutation({
    mutationFn: () => settingsApi.wahaLogout(),
    onSuccess: () => {
      toast.info('Logged out — scan a new QR code');
      setQr(null);
      refreshStatus();
    },
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Logout failed'),
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testWhatsapp(testTo || receiverNo),
    onSuccess: () => toast.success('Test message sent! Check the receiver phone.'),
    onError: (e) => toast.error(e.response?.data?.error?.message || 'Send failed'),
  });

  const handleShowQr = async () => {
    setQrLoading(true);
    setQr(null);
    try {
      const r = await settingsApi.wahaQr();
      if (r.data.data?.qr) setQr(r.data.data.qr);
      else toast.error(r.data.data?.error || 'Could not get QR code');
    } catch {
      toast.error('Failed to get QR code');
    } finally {
      setQrLoading(false);
    }
  };

  // ── Derived state ───────────────────────────────────────────────────────
  const isConnected = waStatus?.status === 'WORKING';
  const needsQr     = waStatus?.status === 'SCAN_QR_CODE';

  const step1Done = isConnected;
  const step2Done = isConnected && !!receiverNo;
  const activeStep = !step1Done ? 1 : !step2Done ? 2 : 3;

  // ── Auto-refresh QR while WhatsApp is waiting for a (re)scan ──────────
  // Baileys rc14 emits a new QR after the first scan ("scan again" prompt).
  // The backend always serves the latest QR via wahaQr(), so poll it while
  // in SCAN_QR_CODE state to pick up the refreshed code automatically.
  useEffect(() => {
    if (!needsQr) return;
    const refreshQr = async () => {
      try {
        const r = await settingsApi.wahaQr();
        const newQr = r.data.data?.qr;
        if (newQr) setQr(newQr);
      } catch { /* status poll surfaces connection errors */ }
    };
    const id = setInterval(refreshQr, 15_000);
    return () => clearInterval(id);
  }, [needsQr]);

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-card" />)}
    </div>
  );

  return (
    <div className="space-y-4 max-w-xl">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold text-[#1D2D3E]">WhatsApp Setup</h2>
        <p className="text-sm text-[#556B82] mt-0.5">
          WhatsApp is built into the app — no Docker or extra software needed.
          Just scan a QR code with your phone.
        </p>
      </div>

      {/* ── Live status bar ─────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-control border text-sm',
        isConnected
          ? 'bg-green-50 border-green-200 text-green-700'
          : needsQr
          ? 'bg-[#FFF8E1] border-yellow-200 text-yellow-700'
          : 'bg-[#F5F6F7] border-[#D4DCE8] text-[#556B82]'
      )}>
        <div className={clsx(
          'w-2.5 h-2.5 rounded-full shrink-0',
          isConnected ? 'bg-green-500 animate-pulse'
          : needsQr   ? 'bg-yellow-400 animate-pulse'
          : 'bg-[#C8D0D9]'
        )} />
        <span className="flex-1 font-medium">
          {checking    ? 'Checking…'
          : isConnected ? 'WhatsApp connected'
          : needsQr    ? 'Waiting for QR scan'
          : 'Not connected'}
        </span>
        <button onClick={() => refreshStatus()} disabled={checking}
          className="text-[#8A9AAD] hover:text-[#556B82] transition-colors" aria-label="Refresh">
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
        </button>
        {isConnected && (
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-1 text-xs text-[#D20A0A] hover:underline ml-1"
          >
            <LogOut size={12} />
            {logoutMutation.isPending ? 'Logging out…' : 'Disconnect'}
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          STEP 1 — Scan QR
      ══════════════════════════════════════════════════════════════ */}
      <Step n={1} title="Connect your sender phone" done={step1Done} active={activeStep === 1}>
        <div className="space-y-4">
          <p className="text-sm text-[#556B82]">
            Open <strong>WhatsApp</strong> on the phone you want to use for sending alerts, then:
          </p>
          <ol className="text-sm text-[#556B82] space-y-1 pl-4 list-decimal">
            <li>Tap <strong>⋮ Menu</strong> (or Settings on iPhone)</li>
            <li>Tap <strong>Linked Devices → Link a Device</strong></li>
            <li>Point the camera at the QR code below</li>
          </ol>

          <button
            className="fiori-btn-primary flex items-center gap-2 text-sm"
            onClick={handleShowQr}
            disabled={qrLoading}
          >
            {qrLoading
              ? <><Loader2 size={14} className="animate-spin" /> Loading QR…</>
              : <><QrCode size={14} /> Show QR Code</>
            }
          </button>

          {/* QR image */}
          {qr && (
            <div className="flex flex-col items-center gap-3 p-5 bg-white border border-[#D4DCE8] rounded-card shadow-fiori w-fit">
              <div className="p-2 bg-white border border-[#E2E8F0] rounded-lg">
                <img src={qr} alt="WhatsApp QR code" className="w-52 h-52" />
              </div>
              <p className="text-xs text-[#556B82] text-center max-w-[200px]">
                QR expires in ~60s. Click below to refresh it.
              </p>
              <div className="flex gap-2">
                <button className="fiori-btn-secondary flex items-center gap-1.5 text-xs"
                  onClick={handleShowQr} disabled={qrLoading}>
                  <RefreshCw size={11} /> Refresh QR
                </button>
                <button className="fiori-btn-ghost text-xs" onClick={() => setQr(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Auto-poll notice */}
          {!isConnected && (
            <p className="text-xs text-[#8A9AAD] flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Checking connection every 5 seconds…
            </p>
          )}
        </div>
      </Step>

      {/* ══════════════════════════════════════════════════════════════
          STEP 2 — Receiver number
      ══════════════════════════════════════════════════════════════ */}
      <Step n={2} title="Set the receiver number" done={step2Done} active={activeStep === 2}>
        <div className="space-y-3">
          <p className="text-sm text-[#556B82]">
            This number gets all delivery reminders and MSL breach alerts.
            It can be different from the sender phone.
          </p>
          <div className="max-w-sm space-y-1">
            <label className="fiori-label" htmlFor="recv-wa">Receiver WhatsApp number</label>
            <input id="recv-wa" className="fiori-input" value={receiverNo}
              onChange={e => setReceiverNo(e.target.value)}
              placeholder="919876543210"
            />
            <p className="text-[11px] text-[#8A9AAD]">
              Country code + number, no +, no spaces.
              India: +91 98765 43210 → <strong>919876543210</strong>
            </p>
          </div>
          <button
            className="fiori-btn-primary flex items-center gap-1.5 text-sm"
            onClick={() => save({ recipient_whatsapp: receiverNo })}
            disabled={saving || !receiverNo || !isConnected}
          >
            <Save size={13} /> {saving ? 'Saving…' : 'Save Number'}
          </button>
        </div>
      </Step>

      {/* ══════════════════════════════════════════════════════════════
          STEP 3 — Test
      ══════════════════════════════════════════════════════════════ */}
      <Step n={3} title="Send a test message" done={false} active={activeStep === 3 || step2Done}>
        <div className="space-y-3">
          <p className="text-sm text-[#556B82]">
            Sends a quick test from the sender phone to confirm everything works end-to-end.
          </p>
          <div className="flex gap-2 max-w-sm">
            <input className="fiori-input"
              placeholder={receiverNo || '919876543210'}
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              aria-label="Override test number (optional)"
            />
            <button
              className="fiori-btn-primary shrink-0 flex items-center gap-1.5 text-sm"
              onClick={() => testMutation.mutate()}
              disabled={(!testTo && !receiverNo) || testMutation.isPending || !isConnected}
            >
              {testMutation.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <Send size={13} />}
              {testMutation.isPending ? 'Sending…' : 'Send Test'}
            </button>
          </div>
          {!isConnected && (
            <p className="text-xs text-[#E9730C] flex items-center gap-1.5">
              <XCircle size={12} /> Complete Step 1 first.
            </p>
          )}
        </div>
      </Step>

      {/* ── All done ────────────────────────────────────────────────── */}
      {step2Done && (
        <div className="rounded-card border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-800">WhatsApp is fully set up!</p>
            <p className="text-xs text-green-700 mt-0.5">
              Alerts will be sent automatically. The connection persists through app restarts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

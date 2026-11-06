/**
 * Toast notification system.
 * Usage: import { useToast } from '@/components/ui/Toast'
 *        const toast = useToast(); toast.success('Saved!')
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import clsx from 'clsx';

const ToastContext = createContext(null);

let _id = 0;

const ICONS = {
  success: <CheckCircle2 size={16} className="text-success shrink-0" />,
  error:   <XCircle      size={16} className="text-error shrink-0"   />,
  warning: <AlertTriangle size={16} className="text-warning shrink-0" />,
  info:    <Info          size={16} className="text-info shrink-0"    />,
};

const BG = {
  success: 'border-success/40 bg-green-50',
  error:   'border-error/40   bg-red-50',
  warning: 'border-warning/40 bg-orange-50',
  info:    'border-info/40    bg-blue-50',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++_id;
    setToasts((t) => [...t, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
    }
    return id;
  }, []);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const api = {
    success: (msg, dur) => show(msg, 'success', dur),
    error:   (msg, dur) => show(msg, 'error',   dur ?? 6000),
    warning: (msg, dur) => show(msg, 'warning', dur),
    info:    (msg, dur) => show(msg, 'info',    dur),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 w-80 pointer-events-none"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'flex items-start gap-2 p-3 rounded-card border shadow-fiori-md',
              'pointer-events-auto bg-surface text-text text-sm',
              'animate-[slideUp_0.2s_ease]',
              BG[t.type]
            )}
            role="alert"
          >
            {ICONS[t.type]}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 p-0.5 rounded hover:bg-black/10 transition-colors"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

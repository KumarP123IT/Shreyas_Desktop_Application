/**
 * Accessible modal dialog with Fiori styling.
 * Usage:
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Edit Customer">
 *     ...content...
 *   </Dialog>
 */

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export default function Dialog({ open, onClose, title, children, size = 'md', footer }) {
  const overlayRef = useRef(null);
  const firstFocusRef = useRef(null);

  // Trap focus + close on Escape
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    firstFocusRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size] || 'max-w-lg';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full bg-surface rounded-card shadow-fiori-lg border border-border',
          'flex flex-col max-h-[90vh]',
          sizeClass
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="dialog-title" className="text-base font-semibold text-text">
            {title}
          </h2>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            className="p-1 rounded hover:bg-background transition-colors text-text-secondary"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-border bg-background/50 flex items-center justify-end gap-2 shrink-0 rounded-b-card">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple confirmation dialog */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <button className="fiori-btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={danger ? 'px-4 py-2 rounded-control font-semibold text-white bg-error hover:bg-red-700 transition-colors disabled:opacity-50' : 'fiori-btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-text-secondary">{message}</p>
    </Dialog>
  );
}

import React from 'react';

/**
 * Reusable Fiori-style page header with title, subtitle and action slot.
 */
export default function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        {breadcrumb && (
          <p className="text-xs text-text-secondary mb-1">{breadcrumb}</p>
        )}
        <h1 className="text-xl font-bold text-text">{title}</h1>
        {subtitle && (
          <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

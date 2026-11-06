import React from 'react';

export default function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading…">
      {/* Header */}
      <div className="flex gap-3 pb-2 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton h-4 flex-1" style={{ opacity: 0.6 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-1">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-4 flex-1" style={{ opacity: 0.4 - r * 0.04 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

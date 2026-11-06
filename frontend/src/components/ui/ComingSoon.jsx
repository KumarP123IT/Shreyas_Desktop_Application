import React from 'react';
import { Construction } from 'lucide-react';

export default function ComingSoon({ title, phase }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
        <Construction size={32} className="text-primary" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-text">{title}</h2>
        <p className="text-text-secondary mt-1">
          Coming in <span className="font-semibold text-primary">{phase}</span>
        </p>
        <p className="text-sm text-text-secondary mt-2 max-w-sm">
          This section is scaffolded and will be fully implemented in the
          next build phase.
        </p>
      </div>
    </div>
  );
}

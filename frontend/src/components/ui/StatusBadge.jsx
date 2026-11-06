import React from 'react';
import { TrendingDown, TrendingUp, CheckCircle2, HelpCircle } from 'lucide-react';
import clsx from 'clsx';

const CONFIG = {
  BELOW_MIN:      { label: 'Below MIN', icon: TrendingDown,  cls: 'status-below'   },
  ABOVE_MAX:      { label: 'Above MAX', icon: TrendingUp,    cls: 'status-above'   },
  NORMAL:         { label: 'Normal',    icon: CheckCircle2,  cls: 'status-normal'  },
  NOT_CONFIGURED: { label: 'Not Set',   icon: HelpCircle,    cls: 'status-unknown' },
};

export default function StatusBadge({ status }) {
  const cfg = CONFIG[status] || CONFIG.NOT_CONFIGURED;
  const Icon = cfg.icon;
  return (
    <span className={cfg.cls} aria-label={cfg.label}>
      <Icon size={11} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

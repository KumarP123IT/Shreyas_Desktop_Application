import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import clsx from 'clsx';
import { useThemeStore } from '@/store/themeStore';

export default function AppearanceSettings() {
  const { theme, setTheme } = useThemeStore();

  const options = [
    { id: 'light', label: 'Light', desc: 'Bright theme for daytime use', icon: Sun },
    { id: 'dark',  label: 'Dark',  desc: 'Low-light theme',            icon: Moon },
  ];

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          <Monitor size={16} className="text-primary" /> Appearance
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">Choose the application theme.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Theme">
        {options.map(({ id, label, desc, icon: Icon }) => (
          <button
            key={id}
            role="radio"
            aria-checked={theme === id}
            onClick={() => setTheme(id)}
            className={clsx(
              'fiori-card p-4 text-left transition-colors flex items-start gap-3',
              theme === id ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'
            )}
          >
            <Icon size={20} className={theme === id ? 'text-primary' : 'text-text-secondary'} />
            <span>
              <span className="block text-sm font-semibold text-text">{label}</span>
              <span className="block text-xs text-text-secondary mt-0.5">{desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

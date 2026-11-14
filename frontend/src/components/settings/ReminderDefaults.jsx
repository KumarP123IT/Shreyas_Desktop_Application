import React, { useEffect, useState } from 'react';
import { Save, Bell, Plus, X } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useSettings } from './useSettings';

/**
 * Reminder Defaults – global fallback schedule (days before due).
 * Stored as JSON array in AppSetting `default_reminder_offsets`.
 * Priority: delivery override → customer override → this global default → [10,5,3,1].
 */
export default function ReminderDefaults() {
  const { settings, isLoading, save, saving } = useSettings();
  const [offsets, setOffsets] = useState([10, 5, 3, 1]);
  const [sendTime, setSendTime] = useState('09:00');
  const [newVal, setNewVal] = useState('');

  useEffect(() => {
    if (settings.default_reminder_offsets !== undefined) {
      try {
        const parsed = JSON.parse(settings.default_reminder_offsets || 'null');
        if (Array.isArray(parsed) && parsed.length) setOffsets(parsed);
      } catch { /* keep default */ }
    }
    if (settings.default_reminder_time) setSendTime(settings.default_reminder_time);
  }, [settings]);

  const addOffset = () => {
    const n = parseInt(newVal, 10);
    if (isNaN(n) || n < 1 || n > 365) return;
    if (!offsets.includes(n)) setOffsets([...offsets, n].sort((a, b) => b - a));
    setNewVal('');
  };

  const removeOffset = (n) => setOffsets(offsets.filter((o) => o !== n));

  if (isLoading) return <SkeletonTable rows={3} cols={2} />;

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          <Bell size={16} className="text-primary" /> Reminder Defaults
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Days before the delivery due date at which reminders are sent, at the time below.
          A customer or delivery can override this schedule.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="list" aria-label="Reminder offsets">
        {offsets.map((n) => (
          <span key={n} className="status-badge status-normal !px-3 !py-1 text-sm" role="listitem">
            {n} day{n === 1 ? '' : 's'} before
            <button onClick={() => removeOffset(n)} className="ml-1 hover:text-error" aria-label={`Remove ${n} days`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div>
          <label className="fiori-label" htmlFor="ro-new">Add days-before-due</label>
          <input
            id="ro-new" type="number" min="1" max="365" className="fiori-input w-32"
            value={newVal} onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOffset()}
            placeholder="e.g. 7"
          />
        </div>
        <button className="fiori-btn-secondary flex items-center gap-1" onClick={addOffset}>
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="max-w-xs">
        <label className="fiori-label" htmlFor="reminder-time">Send Time ({/* app timezone */}IST)</label>
        <input
          id="reminder-time" type="time" className="fiori-input"
          value={sendTime} onChange={(e) => setSendTime(e.target.value)}
        />
        <p className="text-xs text-text-secondary mt-1">Reminders go out at this time on each scheduled day.</p>
      </div>

      <button
        className="fiori-btn-primary flex items-center gap-1.5"
        onClick={() => save({
          default_reminder_offsets: JSON.stringify(offsets),
          default_reminder_time: sendTime || '09:00',
        })}
        disabled={saving || offsets.length === 0}
      >
        <Save size={14} /> {saving ? 'Saving…' : 'Save Defaults'}
      </button>
      {offsets.length === 0 && <p className="text-xs text-error">At least one offset is required.</p>}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Save, Eye, Code2 } from 'lucide-react';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { useSettings } from './useSettings';

const PLACEHOLDERS = [
  { token: '{customer}', desc: 'Customer name' },
  { token: '{part}', desc: 'Part name' },
  { token: '{partNo}', desc: 'Part number' },
  { token: '{total}', desc: 'Total qty' },
  { token: '{min}', desc: 'Min stock' },
  { token: '{max}', desc: 'Max stock' },
  { token: '{dueDate}', desc: 'Delivery due date' },
  { token: '{daysLeft}', desc: 'Days until due' },
];

const SAMPLE = {
  customer: 'Kirloskar Toyota Textile Machinery',
  part: 'SCREW,STUD',
  partNo: '71109-06001-00',
  total: '330', min: '100', max: '500',
  dueDate: '20 Feb 2027', daysLeft: '45',
};

function preview(template) {
  return template.replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? `{${k}}`);
}

function TemplateEditor({ id, label, hint, value, onChange, rows = 8, previewText }) {
  return (
    <div>
      <label className="fiori-label" htmlFor={id}>{label}</label>
      {hint && <p className="text-xs text-text-secondary mb-1">{hint}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <textarea
          id={id}
          className="fiori-input font-mono text-xs"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1 flex items-center gap-1">
            <Eye size={12} /> Live preview
          </p>
          <pre className="fiori-input whitespace-pre-wrap text-xs bg-background min-h-full">{previewText}</pre>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesSettings() {
  const { settings, isLoading, save, saving } = useSettings();
  const [form, setForm] = useState({
    tpl_whatsapp_reminder: '',
    tpl_email_reminder_subject: '',
    tpl_email_reminder_body: '',
  });
  const [activePreview, setActivePreview] = useState('whatsapp');

  useEffect(() => {
    if (settings.tpl_whatsapp_reminder !== undefined) {
      setForm({
        tpl_whatsapp_reminder: settings.tpl_whatsapp_reminder || '',
        tpl_email_reminder_subject: settings.tpl_email_reminder_subject || '',
        tpl_email_reminder_body: settings.tpl_email_reminder_body || '',
      });
    }
  }, [settings]);

  const insertToken = (field, token) => {
    setForm((f) => ({ ...f, [field]: `${f[field] || ''}{${token}}` }));
  };

  if (isLoading) return <SkeletonTable rows={8} cols={2} />;

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="text-base font-semibold text-text">Message Templates</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Templates used for reminder notifications. Use placeholders — click one to append it to the focused field.
        </p>
      </div>

      {/* Placeholder helper */}
      <div className="fiori-card p-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 flex items-center gap-1">
          <Code2 size={12} /> Available placeholders
        </p>
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.token}
              type="button"
              className="px-2 py-1 rounded-control bg-background border border-border text-xs font-mono hover:border-primary hover:text-primary transition-colors"
              title={p.desc}
              onClick={() => insertToken(activePreview === 'email-subject' ? 'tpl_email_reminder_subject' : activePreview === 'email-body' ? 'tpl_email_reminder_body' : 'tpl_whatsapp_reminder', p.token.slice(1, -1))}
            >
              {p.token}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-secondary mt-2">
          Tip: select the template field you are editing, then click a placeholder to append it.
        </p>
      </div>

      <TemplateEditor
        id="tpl-wa"
        label="WhatsApp reminder template"
        hint="Plain text. Sent via WAHA."
        value={form.tpl_whatsapp_reminder}
        onChange={(v) => { setForm({ ...form, tpl_whatsapp_reminder: v }); setActivePreview('whatsapp'); }}
        rows={10}
        previewText={preview(form.tpl_whatsapp_reminder) || '(empty)'}
      />
      <TemplateEditor
        id="tpl-es"
        label="Email reminder – subject"
        value={form.tpl_email_reminder_subject}
        onChange={(v) => { setForm({ ...form, tpl_email_reminder_subject: v }); setActivePreview('email-subject'); }}
        rows={2}
        previewText={preview(form.tpl_email_reminder_subject) || '(empty)'}
      />
      <TemplateEditor
        id="tpl-eb"
        label="Email reminder – body (HTML allowed)"
        value={form.tpl_email_reminder_body}
        onChange={(v) => { setForm({ ...form, tpl_email_reminder_body: v }); setActivePreview('email-body'); }}
        rows={10}
        previewText={preview(form.tpl_email_reminder_body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || '(empty)'}
      />

      <button className="fiori-btn-primary flex items-center gap-1.5" onClick={() => save(form)} disabled={saving}>
        <Save size={14} /> {saving ? 'Saving…' : 'Save Templates'}
      </button>
    </div>
  );
}

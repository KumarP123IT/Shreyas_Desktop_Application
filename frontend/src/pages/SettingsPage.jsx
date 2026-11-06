import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Settings, Sliders, Bell, MessageSquare, Mail, User, Database, Palette,
  Users, FileText, HeartPulse,
} from 'lucide-react';
import clsx from 'clsx';
import MslConfig from '@/components/settings/MslConfig';
import WhatsAppSettings from '@/components/settings/WhatsAppSettings';
import EmailSettings from '@/components/settings/EmailSettings';
import RecipientsSettings from '@/components/settings/RecipientsSettings';
import TemplatesSettings from '@/components/settings/TemplatesSettings';
import ReminderDefaults from '@/components/settings/ReminderDefaults';
import BackupRestore from '@/components/settings/BackupRestore';
import HealthStatus from '@/components/settings/HealthStatus';
import AppearanceSettings from '@/components/settings/AppearanceSettings';
import ProfileSettings from '@/components/settings/ProfileSettings';

const settingsTabs = [
  { id: 'msl',         label: 'MSL Configuration',  icon: Sliders,       path: '/settings/msl' },
  { id: 'reminders',   label: 'Reminder Defaults',   icon: Bell,          path: '/settings/reminders' },
  { id: 'whatsapp',    label: 'WhatsApp',            icon: MessageSquare, path: '/settings/whatsapp' },
  { id: 'email',       label: 'Email (SMTP)',        icon: Mail,          path: '/settings/email' },
  { id: 'recipients',  label: 'Recipients',          icon: Users,         path: '/settings/recipients' },
  { id: 'templates',   label: 'Message Templates',   icon: FileText,      path: '/settings/templates' },
  { id: 'backup',      label: 'Backup / Restore',    icon: Database,      path: '/settings/backup' },
  { id: 'health',      label: 'Health',              icon: HeartPulse,    path: '/settings/health' },
  { id: 'appearance',  label: 'Appearance',          icon: Palette,       path: '/settings/appearance' },
  { id: 'profile',     label: 'Profile & Password',  icon: User,          path: '/settings/profile' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = settingsTabs.find((t) => location.pathname.startsWith(t.path))?.id || 'msl';

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <Settings size={20} className="text-primary" /> Settings
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">Configure MSL defaults, notifications, integrations and more.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Side tab list */}
        <nav className="md:w-52 shrink-0" aria-label="Settings sections">
          <ul className="flex md:flex-col gap-0.5 overflow-x-auto pb-1">
            {settingsTabs.map(({ id, label, icon: Icon, path }) => (
              <li key={id} className="shrink-0">
                <button
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-control text-sm font-medium transition-colors text-left whitespace-nowrap',
                    activeTab === id
                      ? 'bg-primary/10 text-primary border-l-2 border-primary'
                      : 'text-text-secondary hover:bg-background hover:text-text'
                  )}
                  onClick={() => navigate(path)}
                  aria-current={activeTab === id ? 'page' : undefined}
                >
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 fiori-card p-5">
          <Routes>
            <Route index element={<MslConfig />} />
            <Route path="msl" element={<MslConfig />} />
            <Route path="reminders" element={<ReminderDefaults />} />
            <Route path="whatsapp" element={<WhatsAppSettings />} />
            <Route path="email" element={<EmailSettings />} />
            <Route path="recipients" element={<RecipientsSettings />} />
            <Route path="templates" element={<TemplatesSettings />} />
            <Route path="backup" element={<BackupRestore />} />
            <Route path="health" element={<HealthStatus />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="profile" element={<ProfileSettings />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

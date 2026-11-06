/**
 * SAP Fiori Horizon – Shell Bar
 * Adapts between light and dark mode professionally.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Menu, Bell, Wifi, WifiOff, MessageSquare, Sun, Moon,
  ChevronDown, LogOut, User, Settings, Inbox, Activity,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

import { authApi } from '@/api/auth';
import { healthApi } from '@/api/health';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useNotificationStore } from '@/store/notificationStore';
import HexNutLogo from '@/components/ui/HexNutLogo';

export default function ShellBar({ onToggleNav }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearUser = useAuthStore((s) => s.clearUser);
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';
  const {
    unreadCount, isOnline, wahaConnected, queuedCount,
    setOnline, setWahaConnected, setQueuedCount,
  } = useNotificationStore();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const { data: health } = useQuery({
    queryKey: ['health-shell'],
    queryFn: () => healthApi.get(),
    select: (r) => r.data,
    refetchInterval: 30_000,
    retry: 1,
  });

  useEffect(() => {
    if (!health) return;
    const s = health.services || {};
    setOnline(s.internet?.status === 'ok');
    setWahaConnected(s.waha?.status === 'ok' || s.waha?.status === 'WORKING');
    setQueuedCount(health.outbox?.pending ?? 0);
  }, [health, setOnline, setWahaConnected, setQueuedCount]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
      clearUser();
      navigate('/login');
    },
  });

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.username?.[0] || 'U').toUpperCase();

  const iconBtn = clsx(
    'w-9 h-9 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-2',
    isDark
      ? 'hover:bg-white/10 focus-visible:outline-white/50'
      : 'hover:bg-black/5 focus-visible:outline-[#0070F2]'
  );
  const iconColor = isDark ? 'text-white/75' : 'text-[#1D2D3E]/65';

  return (
    <header
      className={clsx(
        'h-[56px] shrink-0 z-50 flex items-center px-3 gap-1',
        isDark
          ? 'bg-[#0A1F44] border-b border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
          : 'bg-white border-b border-[#D9D9D9] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
      )}
      role="banner"
    >
      {/* ── Nav toggle ──────────────────────────────────────────── */}
      <button
        onClick={onToggleNav}
        className={iconBtn}
        aria-label="Toggle navigation"
      >
        <Menu size={19} className={iconColor} />
      </button>

      {/* ── Logo + title ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-2 cursor-pointer select-none group"
        onClick={() => navigate('/dashboard')}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/dashboard')}
        aria-label="Smart MSL Monitor home"
      >
        <div className="w-8 h-8 bg-[#0070F2] rounded-lg flex items-center justify-center shrink-0 shadow-sm group-hover:bg-[#0064D9] transition-colors">
          <HexNutLogo size={17} className="text-white" />
        </div>
        <div className="hidden sm:block leading-none">
          <p className={clsx(
            'text-[10px] font-bold tracking-widest uppercase',
            isDark ? 'text-white/40' : 'text-[#556B82]'
          )}>
            Shreyas Industrial
          </p>
          <p className={clsx(
            'text-[13px] font-bold tracking-tight mt-0.5',
            isDark ? 'text-white' : 'text-[#0A1F44]'
          )}>
            Smart MSL Monitor
          </p>
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div
        className={clsx('hidden sm:block w-px h-6 mx-2', isDark ? 'bg-white/15' : 'bg-[#D9D9D9]')}
        aria-hidden="true"
      />

      {/* ── Spacer ───────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Status chips ─────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-1.5">
        {/* Internet status */}
        <StatusChip
          ok={isOnline}
          okIcon={<Wifi size={11} />}
          failIcon={<WifiOff size={11} />}
          okLabel="Online"
          failLabel="Offline"
          okClass={isDark ? 'text-green-300 bg-green-500/15' : 'text-green-700 bg-green-50 border border-green-200'}
          failClass={isDark ? 'text-red-300 bg-red-500/20' : 'text-red-600 bg-red-50 border border-red-200'}
        />

        {/* Queued notifications */}
        {queuedCount > 0 && (
          <button
            onClick={() => navigate('/notifications')}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors',
              isDark
                ? 'text-yellow-300 bg-yellow-500/15 hover:bg-yellow-500/25'
                : 'text-yellow-700 bg-yellow-50 border border-yellow-200 hover:bg-yellow-100'
            )}
            title={`${queuedCount} notification(s) queued`}
          >
            <Inbox size={11} />
            <span>{queuedCount} queued</span>
          </button>
        )}

        {/* WhatsApp status */}
        <StatusChip
          ok={wahaConnected}
          okIcon={<MessageSquare size={11} />}
          failIcon={<MessageSquare size={11} />}
          okLabel="WhatsApp"
          failLabel="WhatsApp"
          okClass={isDark ? 'text-green-300 bg-green-500/15' : 'text-green-700 bg-green-50 border border-green-200'}
          failClass={isDark ? 'text-[#9AA7B4] bg-white/5' : 'text-[#8A9AAD] bg-[#F5F6F7] border border-[#D9D9D9]'}
          title={wahaConnected ? 'WhatsApp connected' : 'WhatsApp not connected — configure in Settings'}
        />
      </div>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div
        className={clsx('hidden md:block w-px h-6 mx-2', isDark ? 'bg-white/15' : 'bg-[#D9D9D9]')}
        aria-hidden="true"
      />

      {/* ── Notification bell ─────────────────────────────────────── */}
      <button
        onClick={() => navigate('/notifications')}
        className={clsx(iconBtn, 'relative')}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={18} className={iconColor} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] bg-[#D20A0A] rounded-full
                       text-[9px] font-bold text-white flex items-center justify-center px-1 leading-none"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className={iconBtn}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        {isDark
          ? <Sun size={17} className="text-yellow-300" />
          : <Moon size={17} className="text-[#556B82]" />
        }
      </button>

      {/* ── User avatar + menu ───────────────────────────────────── */}
      <div className="relative ml-1" ref={userMenuRef}>
        <button
          onClick={() => setUserMenuOpen(o => !o)}
          className={clsx(
            'flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg transition-colors',
            isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
          )}
          aria-label="User menu"
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0070F2] to-[#0050B0]
                          flex items-center justify-center text-[11px] font-bold text-white shadow-sm shrink-0">
            {initials}
          </div>
          <div className="hidden lg:block text-left">
            <p className={clsx('text-[13px] font-semibold leading-none truncate max-w-[120px]', isDark ? 'text-white' : 'text-[#1D2D3E]')}>
              {user?.displayName || user?.username || 'User'}
            </p>
            <p className={clsx('text-[10px] mt-0.5 truncate max-w-[120px]', isDark ? 'text-white/45' : 'text-[#556B82]')}>
              {user?.role === 'admin' ? 'Administrator' : 'User'}
            </p>
          </div>
          <ChevronDown
            size={13}
            className={clsx(
              'transition-transform duration-150',
              userMenuOpen ? 'rotate-180' : '',
              isDark ? 'text-white/50' : 'text-[#8A9AAD]'
            )}
          />
        </button>

        {/* Dropdown */}
        {userMenuOpen && (
          <div
            className="absolute right-0 top-[calc(100%+8px)] w-60
                       bg-white dark:bg-[#1A2D42]
                       border border-[#E8E8E8] dark:border-[#243650]
                       rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.14)]
                       dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]
                       overflow-hidden z-50 py-1"
            role="menu"
            aria-label="User menu"
          >
            {/* Profile header */}
            <div className="px-4 py-3 border-b border-[#F0F0F0] dark:border-[#243650] bg-[#F8FAFC] dark:bg-[#162030]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0070F2] to-[#0050B0]
                                flex items-center justify-center text-[13px] font-bold text-white shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1D2D3E] dark:text-[#E2EAF4] truncate">
                    {user?.displayName || user?.username}
                  </p>
                  <p className="text-[11px] text-[#556B82] dark:text-[#64788C] truncate mt-0.5">{user?.email}</p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <MenuItem icon={User}     label="Profile & Password" onClick={() => { setUserMenuOpen(false); navigate('/settings/profile'); }} />
              <MenuItem icon={Settings} label="App Settings"       onClick={() => { setUserMenuOpen(false); navigate('/settings'); }} />
              <MenuItem icon={Activity} label="Health Status"      onClick={() => { setUserMenuOpen(false); navigate('/settings/health'); }} />
            </div>

            <div className="border-t border-[#F0F0F0] dark:border-[#243650]" />

            <div className="py-1">
              <MenuItem
                icon={LogOut}
                label={logoutMutation.isPending ? 'Signing out…' : 'Sign Out'}
                onClick={() => logoutMutation.mutate()}
                danger
                disabled={logoutMutation.isPending}
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function StatusChip({ ok, okIcon, failIcon, okLabel, failLabel, okClass, failClass, title }) {
  return (
    <span
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ok ? okClass : failClass}`}
      title={title}
      role="status"
    >
      {ok ? okIcon : failIcon}
      <span className="hidden lg:inline">{ok ? okLabel : failLabel}</span>
    </span>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors',
        danger
          ? 'text-[#D20A0A] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-[#1D2D3E] dark:text-[#C4D4E8] hover:bg-[#F5F6F7] dark:hover:bg-[#1E3150]',
        'disabled:opacity-50'
      )}
      role="menuitem"
    >
      <Icon size={15} aria-hidden="true" className={danger ? undefined : 'text-[#556B82] dark:text-[#64788C]'} />
      {label}
    </button>
  );
}

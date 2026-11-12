/**
 * Side Navigation – professional layout
 * Expanded: labelled items with section header. Collapsed: icon rail with tooltips.
 */
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Truck, Bell, MessageSquare, Settings, Package,
} from 'lucide-react';
import clsx from 'clsx';

import { useNotificationStore } from '@/store/notificationStore';
import { useThemeStore } from '@/store/themeStore';

const NAV_ITEMS = [
  { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/customers',     label: 'Customers',      icon: Users },
  { to: '/deliveries',    label: 'Deliveries',     icon: Truck },
  { to: '/stocks',        label: 'Stocks',         icon: Package },
  { to: '/reminders',     label: 'Reminders',      icon: Bell },
  { to: '/notifications', label: 'Notifications',  icon: MessageSquare, badge: 'unread' },
  { to: '/settings',      label: 'Settings',       icon: Settings },
];

export default function SideNav({ collapsed }) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <nav
      className={clsx(
        'flex flex-col shrink-0 z-30 transition-all duration-200 overflow-hidden',
        isDark
          ? 'bg-[#0F1E30] border-r border-[#182840]'
          : 'bg-[#FAFBFC] border-r border-[#D4DCE8]',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
      aria-label="Side navigation"
      role="navigation"
    >
      {/* Section label */}
      {!collapsed && (
        <p className={clsx(
          'px-5 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.1em]',
          isDark ? 'text-[#3D5070]' : 'text-[#8A9AAD]'
        )}>
          Main Menu
        </p>
      )}
      {collapsed && <div className="h-5" />}

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon, badge }) => {
          const badgeCount = badge === 'unread' ? unreadCount : 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => clsx(
                'group relative flex items-center rounded-lg transition-all duration-150',
                'text-sm font-medium',
                collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                'focus-visible:outline-2',
                isDark ? 'focus-visible:outline-[#60A5FA]' : 'focus-visible:outline-[#0070F2]',
                isActive
                  ? (isDark
                      ? 'bg-[#0070F2]/20 text-[#7AB8FF]'
                      : 'bg-[#E8F0FB] text-[#0070F2]')
                  : (isDark
                      ? 'text-[#8FA3B8] hover:bg-[#1A2D42] hover:text-[#DCE8F5]'
                      : 'text-[#556B82] hover:bg-[#EEF2F7] hover:text-[#1D2D3E]')
              )}
              title={collapsed ? label : undefined}
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  <span className={clsx(
                    'shrink-0 transition-colors',
                    isActive
                      ? (isDark ? 'text-[#7AB8FF]' : 'text-[#0070F2]')
                      : (isDark ? 'text-[#4A6080] group-hover:text-[#94B0CC]' : 'text-[#8A9AAD] group-hover:text-[#556B82]')
                  )}>
                    <Icon size={18} aria-hidden="true" />
                  </span>

                  {!collapsed && (
                    <span className={clsx(
                      'truncate leading-snug flex-1 text-[13px]',
                      isActive && !isDark ? 'font-semibold' : 'font-medium'
                    )}>
                      {label}
                    </span>
                  )}

                  {/* Active indicator bar (light mode only) */}
                  {!collapsed && isActive && !isDark && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#0070F2] rounded-r-full" />
                  )}

                  {/* Unread badge */}
                  {badgeCount > 0 && (
                    <span className={clsx(
                      'min-w-[20px] h-5 px-1.5 rounded-full bg-[#D20A0A] text-white text-[11px] font-bold',
                      'flex items-center justify-center leading-none',
                      collapsed && 'absolute top-1 right-1 min-w-[16px] h-4 text-[9px]'
                    )}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}

                  {/* Tooltip when collapsed */}
                  {collapsed && (
                    <span className={clsx(
                      'absolute left-full ml-3 px-2.5 py-1.5 text-xs font-semibold',
                      'rounded-lg shadow-lg whitespace-nowrap pointer-events-none',
                      'opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50',
                      isDark
                        ? 'bg-[#0A1F44] text-white'
                        : 'bg-[#1D2D3E] text-white'
                    )}>
                      {label}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className={clsx(
          'px-4 py-4 border-t',
          isDark ? 'border-[#182840]' : 'border-[#E2E8F0]'
        )}>
          <p className={clsx(
            'text-[11px] font-bold uppercase tracking-[0.08em]',
            isDark ? 'text-[#3D5070]' : 'text-[#8A9AAD]'
          )}>
            Smart MSL Monitor
          </p>
          <p className={clsx(
            'text-[10px] mt-0.5',
            isDark ? 'text-[#2D4060]' : 'text-[#B0BEC9]'
          )}>
            v1.0 · Shreyas Industrial
          </p>
        </div>
      )}
    </nav>
  );
}

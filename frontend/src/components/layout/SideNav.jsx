/**
 * Side Navigation – professional layout
 * Expanded: labelled items with section header. Collapsed: icon rail with tooltips.
 */
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Truck, Bell, MessageSquare, Settings,
} from 'lucide-react';
import clsx from 'clsx';

import { useNotificationStore } from '@/store/notificationStore';

const NAV_ITEMS = [
  { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/customers',     label: 'Customers',      icon: Users },
  { to: '/deliveries',    label: 'Deliveries',     icon: Truck },
  { to: '/reminders',     label: 'Reminders',      icon: Bell },
  { to: '/notifications', label: 'Notifications',  icon: MessageSquare, badge: 'unread' },
  { to: '/settings',      label: 'Settings',       icon: Settings },
];

export default function SideNav({ collapsed }) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <nav
      className={clsx(
        'flex flex-col shrink-0 z-30 transition-all duration-200 overflow-hidden',
        'bg-white dark:bg-[#0F1E30]',
        'border-r border-[#E8E8E8] dark:border-[#182840]',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
      aria-label="Side navigation"
      role="navigation"
    >
      {/* Section label */}
      {!collapsed && (
        <p className="px-5 pt-5 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9AA7B4] dark:text-[#3D5070]">
          Main Menu
        </p>
      )}
      {collapsed && <div className="h-5" />}

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon, badge }) => {
          const badgeCount = badge === 'unread' ? unreadCount : 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => clsx(
                'group relative flex items-center rounded-lg transition-all duration-150',
                'text-sm font-medium',
                collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3.5 py-2.5',
                'focus-visible:outline-2 focus-visible:outline-[#0070F2]',
                isActive
                  ? 'bg-[#0070F2]/10 dark:bg-[#0070F2]/20 text-[#0070F2] dark:text-[#7AB8FF]'
                  : 'text-[#4A5A6A] dark:text-[#8FA3B8] hover:bg-[#F0F3F6] dark:hover:bg-[#1A2D42] hover:text-[#1D2D3E] dark:hover:text-[#DCE8F5]'
              )}
              title={collapsed ? label : undefined}
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  <span className={clsx(
                    'shrink-0 transition-colors',
                    isActive ? 'text-[#0070F2] dark:text-[#7AB8FF]' : 'text-[#8A9AAD] dark:text-[#4A6080] group-hover:text-[#1D2D3E] dark:group-hover:text-[#94B0CC]'
                  )}>
                    <Icon size={19} aria-hidden="true" />
                  </span>

                  {!collapsed && <span className="truncate leading-snug flex-1">{label}</span>}

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
                    <span className="
                      absolute left-full ml-3 px-2.5 py-1.5 text-xs font-semibold
                      bg-[#1D2D3E] dark:bg-[#0F1E30] text-white rounded-lg
                      shadow-lg whitespace-nowrap pointer-events-none
                      opacity-0 group-hover:opacity-100 transition-opacity duration-150
                      z-50
                    ">
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
        <div className="px-5 py-4 border-t border-[#F0F0F0] dark:border-[#182840]">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9AA7B4] dark:text-[#3D5070]">
            Smart MSL Monitor
          </p>
          <p className="text-[11px] text-[#C0C8D0] dark:text-[#2D4060] mt-0.5">v1.0 · Shreyas Industrial</p>
        </div>
      )}
    </nav>
  );
}

/**
 * Side Navigation – blue gradient rail, professional SaaS look.
 * Expanded: labelled items with section header. Collapsed: icon rail with tooltips.
 */
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Truck, Bell, MessageSquare, Settings, Package,
} from 'lucide-react';
import clsx from 'clsx';

import { useNotificationStore } from '@/store/notificationStore';

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

  return (
    <nav
      className={clsx(
        'flex flex-col shrink-0 z-30 transition-all duration-200 overflow-hidden',
        'bg-gradient-to-b from-[#0A1F44] via-[#0E2C5C] to-[#12407F]',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
      style={{ boxShadow: '4px 0 24px rgba(10,31,68,0.35)' }}
      aria-label="Side navigation"
      role="navigation"
    >
      {/* Brand */}
      {!collapsed && (
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <Package size={15} className="text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-white leading-tight">Smart MSL</p>
              <p className="text-[10px] font-semibold text-sky-300/80 uppercase tracking-wider leading-tight">Monitor</p>
            </div>
          </div>
        </div>
      )}
      {collapsed && <div className="h-5" />}

      {/* Section label */}
      {!collapsed && (
        <p className="px-5 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-300/50">
          Main Menu
        </p>
      )}

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
                collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                'focus-visible:outline-2 focus-visible:outline-sky-300',
                isActive
                  ? 'bg-white/15 text-white shadow-inner'
                  : 'text-sky-100/60 hover:bg-white/10 hover:text-white'
              )}
              title={collapsed ? label : undefined}
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator bar */}
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sky-300 rounded-r-full" />
                  )}
                  {isActive && collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-sky-300 rounded-r-full" />
                  )}

                  <span className={clsx(
                    'shrink-0 transition-colors',
                    isActive ? 'text-sky-300' : 'text-sky-200/50 group-hover:text-sky-200'
                  )}>
                    <Icon size={18} aria-hidden="true" />
                  </span>

                  {!collapsed && (
                    <span className={clsx(
                      'truncate leading-snug flex-1 text-[13px]',
                      isActive ? 'font-semibold' : 'font-medium'
                    )}>
                      {label}
                    </span>
                  )}

                  {/* Unread badge */}
                  {badgeCount > 0 && (
                    <span className={clsx(
                      'min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-r from-rose-500 to-red-500 text-white text-[11px] font-bold',
                      'flex items-center justify-center leading-none shadow-md shadow-red-900/40',
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
                      'bg-[#0A1F44] text-white border border-white/10'
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
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/50">
            Smart MSL Monitor
          </p>
          <p className="text-[10px] mt-0.5 text-sky-200/30">
            v1.0 · Shreyas Industrial
          </p>
        </div>
      )}
    </nav>
  );
}

import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import ShellBar from './ShellBar';
import SideNav from './SideNav';

export default function AppShell() {
  const [navCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#F5F6F7] dark:bg-[#0D1B2A] transition-colors duration-200" style={{ '--shell-height': '59px' }}>
      <ShellBar onToggleNav={() => setNavCollapsed(c => !c)} />

      <div className="flex flex-1 overflow-hidden">
        <SideNav collapsed={navCollapsed} />

        <main
          className="flex-1 overflow-y-auto p-5 md:p-7 bg-[#F5F6F7] dark:bg-[#0D1B2A] transition-colors duration-200"
          id="main-content"
          role="main"
          aria-label="Main content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

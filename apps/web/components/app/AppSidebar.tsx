'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { TrialStatusBanner } from '@/components/billing/TrialStatusBanner';

type AppSidebarProps = {
  userName?: string;
};

const navItems = [
  {
    href: '/dashboard',
    label: 'Releases',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/notes',
    label: 'Notes',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 4h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/pre-save',
    label: 'Pre-save',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 8a8 8 0 0 1 16 0c0 5-8 9-8 9s-8-4-8-9Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/folders',
    label: 'Folders',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const isActivePath = (pathname: string | null, href: string) =>
  pathname === href ||
  (href === '/dashboard/tasks' && pathname?.startsWith('/dashboard/tasks')) ||
  (href === '/dashboard/pre-save' && pathname?.startsWith('/dashboard/pre-save')) ||
  (href === '/dashboard/folders' && pathname?.startsWith('/dashboard/folders')) ||
  (href === '/dashboard' && pathname?.startsWith('/dashboard/plans/')) ||
  (href === '/dashboard' && pathname?.startsWith('/dashboard/releases/'));

export function AppSidebar({ userName }: AppSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      <div className="p-6">
        <Logo size="lg" priority className="justify-start opacity-80" />
      </div>

      <div className="border-b border-white/5" />

      <nav className="flex-1 px-0 py-6">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex min-h-[44px] items-center gap-3 px-6 transition-colors duration-150 ease-in-out ${
                  isActive ? 'text-white font-medium bg-white/5' : 'text-white/40 font-normal hover:text-white/70 hover:bg-white/[0.02]'
                }`}
              >
                <div 
                  className={`absolute left-0 top-0 h-full w-[2px] bg-brand transition-opacity duration-200 ease-in-out ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`} 
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center transition-opacity duration-150 ease-in-out ${
                    isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="font-sans text-sm tracking-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto p-6">
        <div className="font-mono text-[10px] text-white/10 uppercase tracking-widest break-all opacity-50">
          {userName || 'STUDIO_USER'}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open workspace menu"
        className="mobile-safe-top-offset fixed left-4 z-[120] grid h-12 w-12 place-items-center bg-[#0a0a0a] text-white/40 md:hidden"
      >
        <span className="sr-only">Open menu</span>
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-5 bg-current" />
          <span className="block h-0.5 w-5 bg-current" />
          <span className="block h-0.5 w-5 bg-current" />
        </span>
      </button>

      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 border-r border-white/5 md:block">
        {sidebar}
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-[130] md:hidden">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close workspace menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 h-full w-[min(86vw,280px)] border-r border-white/5">
            {sidebar}
          </aside>
        </div>
      )}

      <nav className="mobile-safe-bottom fixed bottom-4 left-4 right-4 z-[110] border border-white/5 bg-[#0a0a0a]/90 backdrop-blur-md md:hidden">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1.5 py-3 transition-colors ${
                  isActive
                    ? 'border-t-2 border-green-400 text-white'
                    : 'text-white/40'
                }`}
              >
                <span className={`h-4 w-4 ${isActive ? 'opacity-100' : 'opacity-40'}`}>{item.icon}</span>
                <span className="font-sans text-[10px] truncate px-1">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

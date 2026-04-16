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
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6.5h16M4 12h16M4 17.5h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 7h11M8 12h11M8 17h11" strokeLinecap="round" />
        <path d="M4.5 7.5h.01M4.5 12h.01M4.5 16.5h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/notes',
    label: 'Notes',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 4.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
        <path d="M14 4.5V9h4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/pre-save',
    label: 'Pre-save',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 8.5a6 6 0 0 1 12 0c0 5-6 9-6 9s-6-4-6-9Z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="8.5" r="1.8" />
      </svg>
    ),
  },
  {
    href: '/dashboard/folders',
    label: 'Folders',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4.5 7.5A1.5 1.5 0 0 1 6 6h4l1.5 2H18A1.5 1.5 0 0 1 19.5 9.5V17A1.5 1.5 0 0 1 18 18.5H6A1.5 1.5 0 0 1 4.5 17V7.5Z" strokeLinecap="round" strokeLinejoin="round" />
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
  const firstName = userName ? userName.split(' ')[0] : '';

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <div className="nav-shell p-4">
        <Logo size="lg" priority className="justify-start" />
        {firstName ? <span className="sr-only">{`${firstName}'s workspace navigation`}</span> : null}
      </div>

      <div className="hidden px-1 md:block">
        <TrialStatusBanner compact />
      </div>

      <nav className="nav-shell p-2">
        <div className="space-y-2">
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[52px] items-center gap-3 rounded-[20px] px-4 transition ${
                  isActive
                    ? 'border border-stroke-default bg-bg-sidebar-active text-content-primary shadow-[0_14px_30px_-22px_rgba(0,0,0,0.5)]'
                    : 'text-content-secondary hover:-translate-y-[1px] hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                    isActive ? 'text-content-primary' : 'text-content-tertiary'
                  }`}
                >
                  {item.icon}
                </span>
                <span className={`min-w-0 text-sm font-semibold ${isActive ? 'text-content-primary' : 'text-content-secondary'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open workspace menu"
        className="mobile-safe-top-offset nav-shell fixed left-4 z-[120] grid h-12 w-12 place-items-center text-content-primary md:hidden"
      >
        <span className="sr-only">Open menu</span>
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
        </span>
      </button>

      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 p-4 md:block">{sidebar}</aside>

      {isOpen && (
        <div className="fixed inset-0 z-[130] md:hidden">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close workspace menu"
            className="modal-scrim absolute inset-0"
          />
          <aside className="absolute left-0 top-0 h-full w-[min(86vw,320px)] p-4 mobile-safe-bottom">
            <div className="h-full">{sidebar}</div>
          </aside>
        </div>
      )}

      <nav className="mobile-safe-bottom nav-shell fixed bottom-4 left-[4.5rem] right-4 z-[110] p-2 md:hidden">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-2 text-center transition ${
                  isActive
                    ? 'border border-stroke-default bg-bg-sidebar-active text-content-primary'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <span className={isActive ? 'text-content-primary' : 'text-content-tertiary'}>{item.icon}</span>
                <span className="truncate text-[11px] font-semibold leading-none tracking-[0.03em]">
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


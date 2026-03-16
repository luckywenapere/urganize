'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';

type AppSidebarProps = {
  userName?: string;
};

const navItems = [
  {
    href: '/dashboard',
    label: 'Releases',
    description: 'Checklist dashboard',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6.5h16M4 12h16M4 17.5h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/notes',
    label: 'Notes',
    description: 'Keep-style workspace',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 4.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
        <path d="M14 4.5V9h4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Account and billing',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
        <path
          d="M19 12a7.8 7.8 0 0 0-.08-1.08l2.02-1.58-1.92-3.32-2.45.74a7.8 7.8 0 0 0-1.87-1.08L14.5 3h-5l-.2 2.68c-.67.25-1.3.61-1.87 1.08l-2.45-.74L3.06 9.34l2.02 1.58A7.8 7.8 0 0 0 5 12c0 .37.03.73.08 1.08l-2.02 1.58 1.92 3.32 2.45-.74c.57.47 1.2.83 1.87 1.08L9.5 21h5l.2-2.68c.67-.25 1.3-.61 1.87-1.08l2.45.74 1.92-3.32-2.02-1.58c.05-.35.08-.71.08-1.08Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function AppSidebar({ userName }: AppSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <Logo size="lg" priority className="justify-start" />
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-content-tertiary">Workspace</p>
        <p className="mt-3 text-sm text-content-secondary">
          {userName ? `${userName.split(' ')[0]}'s release control room` : 'Release execution workspace'}
        </p>
      </div>

      <nav className="mt-5 rounded-[28px] border border-stroke-default bg-bg-surface/95 p-3 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === '/dashboard' && pathname?.startsWith('/dashboard/plans/'));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-3 rounded-[22px] px-4 py-3 transition ${
                  isActive
                    ? 'bg-brand text-content-inverse shadow-[0_14px_30px_-22px_rgba(0,0,0,0.5)]'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <span className={`mt-0.5 ${isActive ? 'text-content-inverse' : 'text-content-tertiary'}`}>{item.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${isActive ? 'text-content-inverse' : 'text-content-primary'}`}>
                    {item.label}
                  </span>
                  <span className={`block text-xs ${isActive ? 'text-content-inverse/80' : 'text-content-tertiary'}`}>
                    {item.description}
                  </span>
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
        className="mobile-safe-top-offset fixed left-4 z-[120] grid h-12 w-12 place-items-center rounded-full border border-stroke-default bg-bg-surface/95 text-content-primary shadow-[0_18px_42px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm md:hidden"
      >
        <span className="sr-only">Open menu</span>
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
        </span>
      </button>

      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 p-5 md:block">{sidebar}</aside>

      {isOpen && (
        <div className="fixed inset-0 z-[130] md:hidden">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close workspace menu"
            className="absolute inset-0 bg-brand/25 backdrop-blur-[2px]"
          />
          <aside className="absolute left-0 top-0 h-full w-[min(86vw,320px)] p-4 mobile-safe-bottom">
            <div className="h-full">{sidebar}</div>
          </aside>
        </div>
      )}

      <nav className="mobile-safe-bottom fixed inset-x-3 bottom-3 z-[110] rounded-[28px] border border-stroke-default bg-bg-surface/95 p-2 shadow-[0_18px_42px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm md:hidden">
        <div className="grid grid-cols-3 gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === '/dashboard' && pathname?.startsWith('/dashboard/plans/'));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2.5 text-center transition ${
                  isActive
                    ? 'bg-brand text-content-inverse'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <span className={isActive ? 'text-content-inverse' : 'text-content-tertiary'}>{item.icon}</span>
                <span className="truncate text-[11px] font-semibold tracking-[0.08em] uppercase">
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

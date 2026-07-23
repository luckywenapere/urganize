'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { openExternalUrl } from '@/lib/external-link';

// The keyboard-shortcuts panel (and its "?" hotkey + menu item) was removed
// 2026-07-23 (founder call) — the menu is Docs / Contact / Settings plus the
// Community link. Restore from git history if a shortcuts panel ever returns.

function openExternalLink(url: string) {
  void openExternalUrl(url);
}

function ItemIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-stroke-subtle bg-bg-hover text-content-secondary group-hover:text-content-primary">
      {children}
    </span>
  );
}

function HelpMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="group flex min-h-[40px] w-full items-center gap-3 rounded-none px-3 py-1.5 text-left text-xs text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
    >
      <ItemIcon>{icon}</ItemIcon>
      <span className="min-w-0 flex-1 font-sans">{label}</span>
    </button>
  );
}

function DocsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.5h7l4.5 4.5V19A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M14 4.5V9h4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 13h7M8.5 16.5h5" strokeLinecap="round" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 7.5A1.5 1.5 0 0 1 6 6h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 18H6a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
      <path d="m6 8 6 4.5L18 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
      <path
        d="M19 12a7.8 7.8 0 0 0-.08-1.08l2.02-1.58-1.92-3.32-2.45.74a7.8 7.8 0 0 0-1.87-1.08L14.5 3h-5l-.2 2.68c-.67.25-1.3.61-1.87 1.08l-2.45-.74L3.06 9.34l2.02 1.58A7.8 7.8 0 0 0 5 12c0 .37.03.73.08 1.08l-2.02 1.58 1.92 3.32 2.45-.74c.57.47 1.2.83 1.87 1.08L9.5 21h5l.2-2.68c.67-.25 1.3-.61 1.87-1.08l2.45.74 1.92-3.32-2.02-1.58c.05-.35.08-.71.08-1.08Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 17.5 4.5 20V7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v7A2.5 2.5 0 0 1 17 16.5H8l-1.5 1Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10.5h7M8.5 13.5H14" strokeLinecap="round" />
    </svg>
  );
}

export function HelpMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const menuGroups = useMemo(
    () => [
      [
        {
          label: 'Docs',
          icon: <DocsIcon />,
          onClick: () => openExternalLink('https://urganize.mintlify.app/'),
        },
        {
          label: 'Contact us',
          icon: <ContactIcon />,
          onClick: () => {
            window.location.href = 'mailto:contact@urganize.app';
          },
        },
        {
          label: 'Settings',
          icon: <SettingsIcon />,
          onClick: () => {
            if (pathname !== '/settings') {
              router.push('/settings');
            }
          },
        },
      ],
      [
        {
          // Renamed from "The Release Room" (2026-07-23) — same WhatsApp
          // community, plainer name.
          label: 'Community',
          icon: <CommunityIcon />,
          onClick: () => openExternalLink('https://chat.whatsapp.com/DGUGyC2GK3d5v6KPGw5aft'),
        },
      ],
    ],
    [pathname, router]
  );

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const runMenuAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 left-6 z-[115] hidden md:block"
    >
      {isOpen ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-4 w-64 animate-in fade-in slide-in-from-bottom-1 duration-150 rounded-none border border-stroke-strong bg-bg-elevated p-2 shadow-2xl"
        >
          {menuGroups.map((group, groupIndex) => (
            <div key={`help-group-${groupIndex}`}>
              {group.map((item) => (
                <HelpMenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => runMenuAction(item.onClick)}
                />
              ))}
              {groupIndex < menuGroups.length - 1 ? <div className="my-2 h-px bg-stroke-subtle" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Open help menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-6 w-6 items-center justify-center font-mono text-[10px] text-content-quaternary transition-all duration-150 hover:text-content-secondary"
      >
        ?
      </button>
    </div>
  );
}

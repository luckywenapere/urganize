'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { openExternalUrl } from '@/lib/external-link';
import { CommunityIcon, ContactIcon, DocsIcon } from '@/components/app/BrandIcons';

// The keyboard-shortcuts panel (and its "?" hotkey + menu item) was removed
// 2026-07-23 (founder call) — the menu is Docs / Contact plus the
// Community link (Settings lives ONLY in the account/profile menu now —
// founder call, removing the duplicate entry). Restore from git history if
// a shortcuts panel ever returns.

function openExternalLink(url: string) {
  void openExternalUrl(url);
}

function ItemIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stroke-subtle bg-bg-hover text-content-secondary group-hover:text-content-primary">
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
      className="group flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-xs text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
    >
      <ItemIcon>{icon}</ItemIcon>
      <span className="min-w-0 flex-1 font-sans">{label}</span>
    </button>
  );
}

export function HelpMenu() {
  const pathname = usePathname();
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
    []
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

  // Lives in the topbar's right cluster since 2026-07-23 (founder call) —
  // the launcher keeps the quiet mono "?" it had bottom-left (that
  // understatement IS the house look; see the Brand Bible notes in
  // globals.css), it just sits with the rest of the navigation now and the
  // menu drops DOWN instead of up.
  return (
    <div ref={containerRef} className="relative hidden shrink-0 md:block">
      <button
        type="button"
        aria-label="Open help menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="motion-focus grid h-10 w-10 place-items-center rounded-full font-mono text-[11px] text-content-quaternary transition-colors hover:bg-bg-hover hover:text-content-secondary"
      >
        ?
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="animate-menu-down absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-stroke-default bg-bg-elevated p-2 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
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
    </div>
  );
}

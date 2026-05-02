'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type ShortcutDefinition = {
  keys: string[];
  description: string;
};

const shortcutDefinitions: ShortcutDefinition[] = [
  {
    keys: ['?'],
    description: 'Open this keyboard shortcuts panel',
  },
  {
    keys: ['Cmd', 'K'],
    description: 'Search releases from the dashboard',
  },
  {
    keys: ['Ctrl', 'K'],
    description: 'Search releases from the dashboard on Windows',
  },
  {
    keys: ['Esc'],
    description: 'Close open menus and dialogs',
  },
];

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

function openExternalLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function ItemIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-white/5 bg-white/5 text-white/40 group-hover:text-white/70">
      {children}
    </span>
  );
}

function ShortcutKeys({
  keys,
}: {
  keys: string[];
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <kbd key={key} className="kbd text-[10px] uppercase">
          {key}
        </kbd>
      ))}
    </span>
  );
}

function HelpMenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="group flex min-h-[40px] w-full items-center gap-3 rounded-none px-3 py-1.5 text-left text-xs text-white/40 transition hover:bg-white/5 hover:text-white/80"
    >
      <ItemIcon>{icon}</ItemIcon>
      <span className="min-w-0 flex-1 font-sans">{label}</span>
      {hint ? <span className="shrink-0 text-white/20 group-hover:text-white/40">{hint}</span> : null}
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

function ShortcutsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="6" width="15" height="12" rx="2.5" />
      <path d="M8 10.5h.01M11.5 10.5h.01M15 10.5h.01M8 14h8" strokeLinecap="round" strokeLinejoin="round" />
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

function ReleaseRoomIcon() {
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
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

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
            window.location.href = 'mailto:support@urganize.co';
          },
        },
        {
          label: 'Keyboard shortcuts',
          icon: <ShortcutsIcon />,
          hint: <ShortcutKeys keys={['?']} />,
          onClick: () => {
            setIsShortcutsModalOpen(true);
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
          label: 'The Release Room',
          icon: <ReleaseRoomIcon />,
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

  useEffect(() => {
    const handleShortcutsHotkey = (event: KeyboardEvent) => {
      const pressedQuestionMark = event.key === '?' || (event.key === '/' && event.shiftKey);
      if (!pressedQuestionMark || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsOpen(false);
      setIsShortcutsModalOpen(true);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsShortcutsModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleShortcutsHotkey);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleShortcutsHotkey);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const runMenuAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <>
      <div
        ref={containerRef}
        className="fixed bottom-6 left-6 z-[115] hidden md:block"
      >
        {isOpen ? (
          <div
            role="menu"
            className="absolute bottom-full left-0 mb-4 w-64 animate-in fade-in slide-in-from-bottom-1 duration-150 rounded-none border border-white/10 bg-[#0a0a0a] p-2 shadow-2xl"
          >
            {menuGroups.map((group, groupIndex) => (
              <div key={`help-group-${groupIndex}`}>
                {group.map((item) => (
                  <HelpMenuItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    hint={item.hint}
                    onClick={() => runMenuAction(item.onClick)}
                  />
                ))}
                {groupIndex < menuGroups.length - 1 ? <div className="my-2 h-px bg-white/5" /> : null}
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
          className="flex h-6 w-6 items-center justify-center font-mono text-[10px] text-white/20 transition-all duration-150 hover:text-white/50"
        >
          ?
        </button>
      </div>

      {isShortcutsModalOpen ? (
        <div className="fixed inset-0 z-[145] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            onClick={() => setIsShortcutsModalOpen(false)}
            className="modal-scrim absolute inset-0"
          />

          <div className="relative z-[1] w-full max-w-md rounded-sm border border-white/10 bg-[#0a0a0a] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Keyboard shortcuts</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Move faster around Urganize</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutsModalOpen(false)}
                className="rounded-none border border-white/10 bg-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-white/40 transition hover:bg-white/10 hover:text-white/70"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {shortcutDefinitions.map((shortcut) => (
                <div
                  key={`${shortcut.keys.join('-')}-${shortcut.description}`}
                  className="flex items-center justify-between gap-4 rounded-none border border-white/5 bg-white/5 px-4 py-3"
                >
                  <p className="text-sm text-content-secondary">{shortcut.description}</p>
                  <ShortcutKeys keys={shortcut.keys} />
                </div>
              ))}
            </div>

            <p className="mt-4 text-sm text-content-tertiary">
              More app-specific shortcuts can be added here as the workspace grows.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

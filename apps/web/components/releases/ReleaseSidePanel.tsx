'use client';

import { useEffect, useState } from 'react';
import { Newspaper, PanelRightClose } from 'lucide-react';
import { EpkSection } from '@/components/releases/EpkSection';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// Release-scoped right side panel (URG-196) — the PostHog side-panel pattern:
// a slim icon rail docked to the right edge of the viewport; clicking an icon
// expands a collapsible panel from the right that hosts that surface. The
// press kit is the first (currently only) item; the shell maps over ITEMS so
// future release-scoped surfaces can dock here without restructuring.
//
// Placement decisions:
// - The rail is vertically centered, NOT full height: the bottom-right
//   corner belongs to the floating SupportChat pill / ChappiDock launcher.
// - Z-tiers follow the ChappiDock ladder: rail z-40 (below the dock's z-50
//   launcher), open panel z-[120] (below the dock's z-[130] panel and far
//   below the z-[170]+ modals the page can open). No Escape-to-close —
//   modals own Escape (the ChappiDock precedent).
// - Open state persists per device via lib/persisted-state.ts, hydrated in a
//   mount effect to avoid SSR mismatch (the TasksPanel precedent).
//
// Only rendered when the EPK flag is on — with a single item, an empty rail
// would be dead chrome. Revisit the gate when a second item docks here.
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

const PANEL_STATE_KEY = 'urganize.release.side-panel';
const PANEL_STATE_VERSION = 1;

type PanelItemKey = 'epk';

const ITEMS: Array<{ key: PanelItemKey; label: string; icon: typeof Newspaper }> = [
  { key: 'epk', label: 'Press kit', icon: Newspaper },
];

const isPanelItemKey = (value: unknown): value is PanelItemKey =>
  value === 'epk';

type ReleaseSidePanelProps = {
  releaseId: string;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function ReleaseSidePanel({ releaseId, onToast }: ReleaseSidePanelProps) {
  const [openItem, setOpenItem] = useState<PanelItemKey | null>(null);

  useEffect(() => {
    const persisted = readPersistedState(PANEL_STATE_KEY, PANEL_STATE_VERSION, isPanelItemKey);
    if (persisted) {
      setOpenItem(persisted);
    }
  }, []);

  const toggleItem = (key: PanelItemKey) => {
    setOpenItem((current) => {
      const next = current === key ? null : key;
      writePersistedState(PANEL_STATE_KEY, PANEL_STATE_VERSION, next);
      return next;
    });
  };

  if (!EPK_ENABLED) return null;

  const activeItem = ITEMS.find((item) => item.key === openItem) || null;

  return (
    <>
      {/* Icon rail — always visible, collapsed state of the menu. */}
      <nav
        aria-label="Release panels"
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-xl border border-r-0 border-stroke-default bg-bg-surface py-1.5 shadow-lg"
      >
        <ul className="flex flex-col items-center gap-1 px-1.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = openItem === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => toggleItem(item.key)}
                  aria-pressed={isActive}
                  aria-label={item.label}
                  title={item.label}
                  className={`motion-focus flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? 'bg-brand/10 text-brand'
                      : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Expanded panel. Covers the rail while open; the header's collapse
          control is the way back to the rail. */}
      {activeItem ? (
        <aside
          role="complementary"
          aria-label={activeItem.label}
          className="fixed inset-y-0 right-0 z-[120] flex w-[min(100vw-2rem,380px)] flex-col border-l border-stroke-default bg-bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-stroke-default px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {activeItem.label}
            </h2>
            <button
              type="button"
              onClick={() => toggleItem(activeItem.key)}
              aria-label={`Collapse ${activeItem.label.toLowerCase()} panel`}
              title="Collapse"
              className="motion-focus flex h-8 w-8 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {activeItem.key === 'epk' ? (
              <EpkSection releaseId={releaseId} onToast={onToast} variant="panel" />
            ) : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}

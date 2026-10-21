'use client';

import { ChevronRight, X } from '@/components/icons';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { readSettingsFlags } from '@/lib/settings-nav';
import { connectionRows } from '@/lib/connection-rows';
import { SwipeSheet } from './SwipeSheet';

/**
 * Connections (URG-380). Only what works is listed: each row opens a real
 * settings section. The placeholder services (the list of coming-later apps and
 * accounts) were removed on 2026-10-21 because tapping them did nothing; they
 * come back one at a time, when the service is actually wired.
 */

const ROW = 'flex min-h-[58px] items-center gap-4 border-b border-content-primary/[0.07] last:border-b-0';
const EYEBROW = 'mb-1 mt-5 font-mono text-[11px] uppercase tracking-[0.6px] text-content-primary/50';

export function ConnectionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const openSettings = useOpenSettings();
  const flags = readSettingsFlags();
  const wired = connectionRows(flags);

  return (
    <SwipeSheet open={open} label="Connections" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h2 className="font-display text-[28px] leading-tight text-content-primary">Connections</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="motion-focus grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-content-primary/[0.06] text-content-primary/70"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {wired.length > 0 ? (
        <section aria-label="Connections">
          <p className={EYEBROW}>Your account</p>
          <ul>
            {wired.map((row) => (
              <li key={row.name}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openSettings({ segment: 'connections', section: row.section });
                  }}
                  className={`motion-focus w-full text-left ${ROW}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] text-content-primary">{row.name}</span>
                    <span className="block text-[13px] text-content-primary/50">{row.sub}</span>
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] text-content-primary/35" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-6 text-[15px] text-content-primary/55">Nothing to connect yet.</p>
      )}
    </SwipeSheet>
  );
}

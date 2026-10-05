'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from '@/components/icons';

/**
 * A fold for a cluster of related settings (2026-10-05, founder call: group the
 * long "Artists & brand" screen). The title is the only text; what is inside
 * stays mounted while folded, so a half-typed field survives closing the group.
 */
export function SettingsGroup({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="motion-focus flex min-h-14 w-full items-center justify-between gap-3 text-left"
        >
          <span className="font-display text-xl text-content-primary">{title}</span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

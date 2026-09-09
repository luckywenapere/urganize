'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, Disc3 } from '@/components/icons';
import type { ExecutionRelease } from '@/lib/execution-types';

type ChappiScopePickerProps = {
  releases: ExecutionRelease[];
  scopedReleaseId: string | null;
  onSelect: (releaseId: string | null) => void;
};

/** 20px cover thumbnail — real art or the theme-aware U-mark default. */
function ScopeThumb({ release }: { release: ExecutionRelease }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded border border-stroke-subtle bg-bg-elevated">
      {release.coverArtUrl ? (
        <Image
          src={release.coverArtUrl}
          alt=""
          width={20}
          height={20}
          className="h-full w-full object-cover"
        />
      ) : (
        <Image
          src="/images/urganize-mark.png"
          alt=""
          width={161}
          height={173}
          className="app-wordmark h-2.5 w-auto opacity-40"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

/**
 * Release scope picker inside the Chappi composer (founder call,
 * 2026-07-23; moved from its own row under the field to a leading chip in
 * the field's row, 2026-08-16) — the Linear-style context selector: pick the release the
 * conversation is about, so instructions like "add a task" or "how's it
 * going" land on the right release without naming it every time. Opens
 * UPWARD (the composer is pinned at the bottom of the surface). "All
 * releases" clears the scope.
 */
export function ChappiScopePicker({ releases, scopedReleaseId, onSelect }: ChappiScopePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const scoped = scopedReleaseId
    ? releases.find((release) => release.id === scopedReleaseId) ?? null
    : null;

  // Outside-click close — mousedown, matching WorkspaceMenu/HelpMenu.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (releases.length === 0) return null;

  const choose = (releaseId: string | null) => {
    onSelect(releaseId);
    setOpen(false);
  };

  return (
    // shrink-0: this is a leading chip inside the composer's single-row pill
    // (2026-08-16), so it must hold its size rather than be squeezed by a
    // long typed message. The label carries its own cap instead.
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={scoped ? `Conversation scoped to ${scoped.title}` : 'Choose a rollout for this conversation'}
        className="motion-focus inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg-elevated px-2 py-1.5 text-xs text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
      >
        {scoped ? (
          <ScopeThumb release={scoped} />
        ) : (
          <Disc3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {/* Capped rather than free-flowing: a long release title would
            otherwise leave a phone's composer with no room to type in. The
            phone cap is measured, not guessed — 4.5rem is what keeps the
            unscoped "All releases" label unclipped at 12px while leaving a
            375px composer ~155px of typing room. The cover thumbnail beside
            it carries the recognition a truncated title loses; the full
            title stays in the aria-label and the dropdown. */}
        <span
          className={`max-w-[4.5rem] truncate sm:max-w-[10rem] ${
            scoped ? 'font-medium text-content-secondary' : ''
          }`}
        >
          {scoped ? scoped.title : 'All rollouts'}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${open ? '' : 'rotate-180'}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Scope this conversation to a rollout"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-72 w-64 max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain rounded-xl border border-stroke-default bg-bg-surface py-1 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
        >
          <button
            type="button"
            role="option"
            aria-selected={!scoped}
            onClick={() => choose(null)}
            className={`motion-focus flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
              !scoped ? 'text-content-primary' : 'text-content-secondary'
            }`}
          >
            <Disc3 className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
            All rollouts
          </button>
          {releases.map((release) => {
            const selected = release.id === scopedReleaseId;
            return (
              <button
                key={release.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(release.id)}
                className={`motion-focus flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
                  selected ? 'text-content-primary' : 'text-content-secondary'
                }`}
              >
                <ScopeThumb release={release} />
                <span className="min-w-0 flex-1 truncate">{release.title}</span>
                {release.releaseDate ? (
                  <span className="shrink-0 font-mono text-[10px] text-content-tertiary">
                    {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
                      new Date(`${release.releaseDate}T00:00:00`)
                    )}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

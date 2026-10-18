'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, ChevronDown, Disc3 } from '@/components/icons';
import type { ExecutionRelease } from '@/lib/execution-types';
import { useKeepInViewport } from '@/lib/use-keep-in-viewport';
import { ThumbImage } from '@/components/shared/ThumbImage';

type NoteReleasePickerProps = {
  releases: ExecutionRelease[];
  linkedReleaseId: string | null;
  onSelect: (releaseId: string | null) => void;
};

/** 20px cover thumbnail — real art or the theme-aware U-mark default. */
function ReleaseThumb({ release }: { release: ExecutionRelease }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded border border-stroke-subtle bg-bg-elevated">
      {release.coverArtUrl ? (
        <ThumbImage
          src={release.coverThumbUrl ?? release.coverArtUrl}
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
 * Links the open note to a release — the optional tie-back to the release
 * spine. Structurally ChappiScopePicker, with two differences: it opens
 * DOWNWARD (this sits in the editor's header, not above a pinned composer),
 * and its clearing option is "No release" rather than "All releases", since
 * this sets a property rather than filtering a view.
 *
 * Escape closes only the dropdown and stops propagation — panes never close on
 * Escape in this app, modals do.
 */
export function NoteReleasePicker({
  releases,
  linkedReleaseId,
  onSelect,
}: NoteReleasePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useKeepInViewport(panelRef, open);
  const panelId = useId();

  const linked = linkedReleaseId
    ? releases.find((release) => release.id === linkedReleaseId) ?? null
    : null;

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

  // A note linked to a release the store no longer holds still deserves its
  // chip; only hide the control entirely when there is nothing to pick from.
  if (releases.length === 0 && !linked) return null;

  const choose = (releaseId: string | null) => {
    onSelect(releaseId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // The visible words are the name's first part, so a voice-control user
        // who says what they see ("Link rollout") reaches it.
        aria-label={linked ? `Linked to ${linked.title}` : 'Link rollout to this note'}
        className={`motion-focus inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors ${
          linked
            ? 'border border-brand/25 bg-brand/10 font-medium text-brand hover:bg-brand/15'
            : 'text-content-tertiary hover:bg-bg-hover hover:text-content-secondary'
        }`}
      >
        {linked ? (
          <ReleaseThumb release={linked} />
        ) : (
          <Disc3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{linked ? linked.title : 'Link rollout'}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        // A group, not a role="listbox": these rows are buttons reached with
        // Tab, and a listbox promises arrow-key movement they never had.
        <div
          id={panelId}
          role="group"
          aria-label="Link this note to a rollout"
          ref={panelRef}
          className="absolute left-0 top-full z-50 mt-2 max-h-72 w-64 max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain rounded-xl border border-stroke-default bg-bg-surface py-1 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
        >
          <button
            type="button"
            aria-current={!linked ? 'true' : undefined}
            onClick={() => choose(null)}
            className={`motion-focus flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
              !linked ? 'text-content-primary' : 'text-content-secondary'
            }`}
          >
            <Disc3 className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1">No rollout</span>
            {!linked ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
          </button>
          {releases.map((release) => {
            const selected = release.id === linkedReleaseId;
            return (
              <button
                key={release.id}
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => choose(release.id)}
                className={`motion-focus flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
                  selected ? 'text-content-primary' : 'text-content-secondary'
                }`}
              >
                <ReleaseThumb release={release} />
                <span className="min-w-0 flex-1 truncate">{release.title}</span>
                {release.releaseDate ? (
                  <span className="shrink-0 font-mono text-[10px] text-content-tertiary">
                    {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
                      new Date(`${release.releaseDate}T00:00:00`)
                    )}
                  </span>
                ) : null}
                {selected ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

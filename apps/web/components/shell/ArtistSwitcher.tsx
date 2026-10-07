'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from '@/components/icons';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { readSavedArtistId, useShellStore } from '@/stores/useShellStore';

/**
 * The top bar's team and artist switcher (text only: the round team mark was removed 2026-10-07, founder call), the counterpart of Deel's group
 * switcher. A manager thinks artist first, so the question it answers is "which
 * artist am I looking at", with "All artists" as the default.
 *
 * The choice is a VIEW filter held in useShellStore: Home and the catalogue read
 * it, nothing is written to the server. A saved artist who has since left the
 * roster quietly falls back to "All artists" rather than showing an empty app.
 */
export function ArtistSwitcher() {
  const teamName = useWorkspaceIdentityStore((state) => state.name);
  const loadIdentity = useWorkspaceIdentityStore((state) => state.load);
  const artists = useArtistRosterStore((state) => state.artists);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const selectedArtistId = useShellStore((state) => state.selectedArtistId);
  const setSelectedArtistId = useShellStore((state) => state.setSelectedArtistId);
  const hydrateSelectedArtistId = useShellStore((state) => state.hydrateSelectedArtistId);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadIdentity();
    void loadRoster();
    const saved = readSavedArtistId();
    if (saved !== undefined) hydrateSelectedArtistId(saved);
  }, [loadIdentity, loadRoster, hydrateSelectedArtistId]);

  // A saved artist who is no longer on the roster falls back to everyone.
  useEffect(() => {
    if (!rosterLoaded || selectedArtistId === null) return;
    if (!artists.some((artist) => artist.id === selectedArtistId)) {
      hydrateSelectedArtistId(null);
    }
  }, [rosterLoaded, artists, selectedArtistId, hydrateSelectedArtistId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectedArtist = useMemo(
    () => artists.find((artist) => artist.id === selectedArtistId) ?? null,
    [artists, selectedArtistId]
  );
  const title = teamName || 'Your team';
  const sub = selectedArtist ? selectedArtist.name : artists.length > 1 ? 'All artists' : artists[0]?.name ?? 'Your team';
  const canSwitch = artists.length > 1;

  if (!canSwitch) {
    return (
      <div className="flex min-w-0 items-center gap-2.5" data-tour="shell-switcher">
        <span className="max-w-[7.5rem] min-w-0 text-left sm:max-w-[10rem]">
          <span className="block truncate text-sm font-semibold leading-4 text-content-primary">{title}</span>
          <span className="block truncate text-xs leading-4 text-content-tertiary">{sub}</span>
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0" data-tour="shell-switcher">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Team ${title}, showing ${sub}. Change artist`}
        className="motion-focus motion-press flex min-h-11 min-w-0 items-center gap-2.5 rounded-full px-2.5 py-1 hover:bg-bg-hover/70"
      >
        <span className="max-w-[7.5rem] min-w-0 text-left sm:max-w-[10rem]">
          <span className="flex items-center gap-1 text-sm font-semibold leading-4 text-content-primary">
            <span className="truncate">{title}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
          </span>
          <span className="block truncate text-xs leading-4 text-content-tertiary">{sub}</span>
        </span>
      </button>

      {open ? (
        <div
          role="group"
          aria-label="Choose an artist"
          className="absolute left-0 top-full z-40 mt-2 w-64 rounded-2xl border border-stroke-default bg-bg-surface p-1.5 shadow-lg"
        >
          {[{ id: null as string | null, name: 'All artists' }, ...artists].map((artist) => {
            const active = artist.id === selectedArtistId;
            return (
              <button
                key={artist.id ?? 'all'}
                type="button"
                onClick={() => {
                  setSelectedArtistId(artist.id);
                  setOpen(false);
                }}
                aria-current={active ? 'true' : undefined}
                className="motion-focus flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm text-content-primary hover:bg-bg-hover"
              >
                <span className="truncate">{artist.name}</span>
                {active ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';
import { feedbackErrorClass, feedbackSuccessClass } from './feedback';
import { HelpTip } from '@/components/shared/HelpTip';
import type { BrandColors } from '@/lib/social-share-colors';

export type WorkspaceArtist = {
  id: string;
  name: string;
  slug: string;
  /**
   * The share images' colors (2026-09-24). Present only while the brand-colors
   * flag is on; absent means none were read, which draws Urganize's colors.
   */
  brandColors?: BrandColors;
};

type WorkspaceArtistSectionProps = {
  artists: WorkspaceArtist[] | undefined;
  /** null = no ceiling, or a tier we could not read. Render nothing either way. */
  artistLimit: number | null;
  isLoading: boolean;
  savingArtistId: string | null;
  removingArtistId: string | null;
  isAdding: boolean;
  message: string;
  error: string;
  onRename: (artistId: string, name: string) => void;
  onAdd: (name: string) => void;
  onRemove: (artistId: string) => void;
};

const inputClass =
  'w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand';

/**
 * The team's artist roster.
 *
 * Was a single name field until 2026-08-30. Data is still fetched once by the
 * parent shell alongside Workspace logo and Teammates, sharing one hoisted
 * access-token resolution, so this component stays presentational apart from
 * the draft text it owns per row — see the parent's redundant-network-call fix.
 *
 * The per-row draft lives here rather than in the hook because it is transient
 * editing state, and lifting it would mean the hook re-rendering every sibling
 * section on each keystroke.
 */
function ArtistRow({
  artist,
  isSaving,
  isRemoving,
  canRemove,
  disabled,
  onRename,
  onRemove,
}: {
  artist: WorkspaceArtist;
  isSaving: boolean;
  isRemoving: boolean;
  /** False for the last artist on the roster — the server refuses that too. */
  canRemove: boolean;
  disabled: boolean;
  onRename: (artistId: string, name: string) => void;
  onRemove: (artistId: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  // Derived, never seeded by an effect: a background refetch hands back a new
  // artist object for the same row, and seeding would clobber what is being
  // typed. `undefined` means "not edited yet" and falls through to the live
  // name. Same shape the curator profile form had to adopt for this reason.
  const value = draft ?? artist.name;
  const dirty = draft !== undefined && draft.trim() !== artist.name;

  return (
    <div className="flex items-end gap-2">
      <label className="block flex-1">
        <span className="sr-only">Artist name</span>
        <input
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          className={inputClass}
          placeholder="e.g. Tems"
          maxLength={120}
          disabled={disabled}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          onRename(artist.id, value);
          setDraft(undefined);
        }}
        disabled={disabled || isSaving || !dirty}
        className="shrink-0 whitespace-nowrap rounded-lg border border-stroke-subtle px-3 py-2 text-sm font-semibold text-content-primary hover:border-brand disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
      {canRemove ? (
        <button
          type="button"
          onClick={() => {
            // window.confirm rather than a bespoke dialog: the server refuses
            // every removal that would actually lose something, so what is left
            // here can only ever remove an artist attached to nothing. The
            // prompt is a slip guard, not a decision point.
            if (
              window.confirm(
                `Remove ${artist.name}? This only works if they have no rollouts and nobody is limited to seeing them.`
              )
            ) {
              onRemove(artist.id);
            }
          }}
          disabled={disabled || isRemoving}
          className="shrink-0 whitespace-nowrap rounded-lg border border-stroke-subtle px-3 py-2 text-sm font-semibold text-content-secondary hover:border-status-error hover:text-status-error disabled:opacity-50"
        >
          {isRemoving ? 'Removing…' : 'Remove'}
        </button>
      ) : null}
    </div>
  );
}

export function WorkspaceArtistSection({
  artists,
  artistLimit,
  isLoading,
  savingArtistId,
  removingArtistId,
  isAdding,
  message,
  error,
  onRename,
  onAdd,
  onRemove,
}: WorkspaceArtistSectionProps) {
  const [newName, setNewName] = useState('');

  const count = artists?.length ?? 0;
  // A disabled Add is a courtesy, not a gate — the server refuses either way.
  const atLimit = artistLimit !== null && count >= artistLimit;

  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Artists
      </h2>
      {/* States its scope explicitly (2026-08-13): the sibling editor under
          Account edits the signed-in user's own profile name. Both used to say
          just "Artist name" with the same placeholder. */}
      {/* Three sentences until 2026-09-08. The two consequences of editing
          here moved into the pullout; what the list IS stays visible. */}
      <p className="mb-4 text-sm text-content-secondary">
        The artists this team works on.{' '}
        <HelpTip helpKey="settings.artists" className="align-text-bottom" />
      </p>

      {isLoading && artists === undefined ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-10 w-full rounded-lg" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
        </div>
      ) : artists === undefined ? (
        <p className="text-sm text-content-secondary">Could not load your artists.</p>
      ) : (
        <div className="space-y-3">
          {artistLimit !== null && (
            <p className="text-xs text-content-tertiary">
              {count} of {artistLimit} {artistLimit === 1 ? 'artist' : 'artists'}
            </p>
          )}

          {count === 0 ? (
            <p className="text-sm text-content-secondary">
              No artists yet. Add the first one below.
            </p>
          ) : (
            <div className="space-y-2">
              {artists.map((artist) => (
                <ArtistRow
                  key={artist.id}
                  artist={artist}
                  isSaving={savingArtistId === artist.id}
                  isRemoving={removingArtistId === artist.id}
                  canRemove={count > 1}
                  disabled={
                    (savingArtistId !== null && savingArtistId !== artist.id) ||
                    (removingArtistId !== null && removingArtistId !== artist.id)
                  }
                  onRename={onRename}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}

          {message && <p className={feedbackSuccessClass}>{message}</p>}
          {error && <p className={feedbackErrorClass}>{error}</p>}

          <div className="flex items-end gap-2 border-t border-stroke-subtle pt-3">
            <label className="block flex-1">
              <span className="mb-1 block text-sm text-content-secondary">Add an artist</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className={inputClass}
                placeholder="e.g. Tems"
                maxLength={120}
                disabled={atLimit}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                onAdd(newName);
                setNewName('');
              }}
              disabled={isAdding || atLimit || !newName.trim()}
              className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
            >
              {isAdding ? 'Adding…' : 'Add'}
            </button>
          </div>

          {atLimit && (
            <p className="text-xs text-content-tertiary">
              Your plan covers {artistLimit} {artistLimit === 1 ? 'artist' : 'artists'}. Upgrade to
              add more.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

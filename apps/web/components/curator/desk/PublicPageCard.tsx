'use client';

// "Your public page" on a computer (#1237): the card beside the profile form.
// Same store actions as CuratorPublicPageSection (publish, take down, change
// link). The link shown and copied is always the public one
// (publicPageLink), never the address this page happens to be open on.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CopyLinkButton } from '@/components/shared/CopyLinkButton';
import { curatorPagePath, isValidCuratorSlug } from '@/lib/curator-public';
import { curatorInitials, publicPageLink } from '@/lib/curator-desk';
import { useCuratorStore } from '@/stores/useCuratorStore';

const linkButton =
  'motion-focus text-[13px] font-semibold text-brand underline underline-offset-[3px] disabled:opacity-50';

export function PublicPageCard({ displayName }: { displayName: string }) {
  const profile = useCuratorStore((state) => state.profile);
  const playlists = useCuratorStore((state) => state.playlists);
  const loadPlaylists = useCuratorStore((state) => state.loadPlaylists);
  const publishPage = useCuratorStore((state) => state.publishPage);
  const unpublishPage = useCuratorStore((state) => state.unpublishPage);
  const saveProfile = useCuratorStore((state) => state.saveProfile);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  if (!profile) return null;

  const slug = profile.slug || '';
  const isLive = Boolean(profile.publishedAt);
  const link = publicPageLink(slug);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const saveSlug = async () => {
    const next = draft.trim().toLowerCase();
    if (next === slug) {
      setEditing(false);
      return;
    }
    if (!isValidCuratorSlug(next)) {
      setError('Use two to sixty characters: lowercase letters, numbers and single hyphens between them.');
      return;
    }
    await run(async () => {
      await saveProfile({ slug: next });
      setEditing(false);
    });
  };

  return (
    <section className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-content-primary">Your public page</h2>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
            Live
          </span>
        ) : (
          <span className="text-xs font-medium text-content-tertiary">Not live</span>
        )}
      </div>
      <p className="mt-1.5 text-[13px] text-content-secondary">
        Post this link anywhere. Artists who open it see your playlists and can pitch you.
      </p>

      {isLive && link ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <p className="flex h-10 min-w-0 flex-1 items-center truncate rounded-xl border border-stroke-control bg-bg-base px-3.5 text-[13px] text-content-secondary">
              {link.display}
            </p>
            <CopyLinkButton value={link.href} label="Copy" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <a href={curatorPagePath(slug)} target="_blank" rel="noopener noreferrer" className={linkButton}>
              View
            </a>
            <button
              type="button"
              onClick={() => {
                setDraft(slug);
                setEditing(true);
                setError('');
              }}
              className={linkButton}
            >
              Change link
            </button>
            <span className="flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(unpublishPage)}
              className="motion-focus text-[13px] text-content-secondary hover:text-content-primary disabled:opacity-50"
            >
              Take it down
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(publishPage)}
            className="motion-focus inline-flex h-10 items-center rounded-full bg-content-primary px-5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Publishing…' : 'Publish my page'}
          </button>
          <p className="mt-2 text-xs text-content-tertiary">
            {slug
              ? 'Your link is kept, so putting the page back gives you the same address.'
              : 'Nothing goes public until you press this.'}
          </p>
        </div>
      )}

      {editing ? (
        <div className="mt-4 space-y-2">
          <label htmlFor="desk-curator-slug" className="block text-xs text-content-secondary">
            The last part of your link
          </label>
          <div className="flex items-center gap-2">
            <input
              id="desk-curator-slug"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-stroke-control bg-bg-base px-3 text-sm text-content-primary"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSlug()}
              className="motion-focus inline-flex h-9 items-center rounded-full bg-content-primary px-4 text-sm font-semibold text-bg-base disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError('');
              }}
              className="motion-focus inline-flex h-9 items-center rounded-full px-3 text-sm text-content-secondary hover:bg-bg-hover"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-content-tertiary">Changing this breaks the old link for anyone who already has it.</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-4 rounded-2xl border border-stroke-default bg-bg-base p-4" aria-label="Preview">
        <p className="mb-3 text-xs font-medium text-content-tertiary">What artists see</p>
        <div className="flex items-center gap-3">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-active text-[13px] font-semibold text-content-secondary">
            {profile.photoUrl ? (
              <Image src={profile.photoUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
            ) : (
              curatorInitials(displayName)
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-content-primary">{displayName || 'Your name'}</p>
            <p className="text-[13px] text-content-secondary">
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

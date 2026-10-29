'use client';

// "Your public page" — the block a curator copies her link from.
//
// WHY IT EXISTS. A curator posted her own settings URL to a WhatsApp status
// telling artists to pitch her. That link opens the sign-in screen for everyone
// but her, and nothing on her side of the product had ever given her one to
// post. This is it.
//
// It sits OUTSIDE the profile form on purpose. The form autosaves and disables
// itself while saving, and a copy button swept into that would go dead at the
// exact moment somebody wanted to use it.

import { useEffect, useState } from 'react';
import { CopyLinkButton } from '@/components/shared/CopyLinkButton';
import { curatorPagePath, isValidCuratorSlug } from '@/lib/curator-public';
import { useCuratorStore } from '@/stores/useCuratorStore';
import { currentShareOrigin } from '@/lib/app-hosts';

export function CuratorPublicPageSection() {
  const profile = useCuratorStore((state) => state.profile);
  const publishPage = useCuratorStore((state) => state.publishPage);
  const unpublishPage = useCuratorStore((state) => state.unpublishPage);
  const saveProfile = useCuratorStore((state) => state.saveProfile);

  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => setOrigin(currentShareOrigin()), []);

  if (!profile) return null;

  const slug = profile.slug || '';
  const isLive = Boolean(profile.publishedAt);
  const url = slug && origin ? `${origin}${curatorPagePath(slug)}` : '';

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
      setError(
        'Use two to sixty characters: lowercase letters, numbers and single hyphens between them.'
      );
      return;
    }
    await run(async () => {
      await saveProfile({ slug: next });
      setEditing(false);
    });
  };

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <h2 className="text-sm font-medium text-content-primary">Your public page</h2>
      <p className="mt-1 text-sm text-content-secondary">
        One link you can post anywhere. Artists who open it can see your playlists and send you a
        song.
      </p>

      {isLive && url ? (
        <div className="mt-4 space-y-3">
          <p className="break-all rounded-lg border border-stroke-subtle bg-bg-base px-3 py-2 font-mono text-xs text-content-primary">
            {url}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CopyLinkButton value={url} />
            <a
              href={curatorPagePath(slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-lg border border-stroke-default px-3 text-sm text-content-primary transition-colors hover:bg-bg-elevated"
            >
              View
            </a>
            <button
              type="button"
              onClick={() => {
                setDraft(slug);
                setEditing(true);
                setError('');
              }}
              className="inline-flex h-9 items-center rounded-lg border border-stroke-default px-3 text-sm text-content-primary transition-colors hover:bg-bg-elevated"
            >
              Change link
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(unpublishPage)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-content-secondary transition-colors hover:bg-bg-elevated disabled:opacity-60"
            >
              Take it down
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(publishPage)}
            className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Publishing...' : 'Publish my page'}
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
          <label htmlFor="curator-slug" className="block text-xs text-content-secondary">
            The last part of your link
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="curator-slug"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-stroke-control bg-bg-base px-3 text-sm text-content-primary"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={busy}
              onClick={saveSlug}
              className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError('');
              }}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-content-secondary transition-colors hover:bg-bg-elevated"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-content-tertiary">
            Changing this breaks the old link for anyone who already has it.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

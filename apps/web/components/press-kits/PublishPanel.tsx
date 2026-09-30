'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from '@/components/icons';
import {
  PRESS_KIT_SECTION_LABELS,
  canPublishKit,
  hasUnpublishedChanges,
} from '@/lib/press-kits';
import { authHeaders, readError } from './press-kit-client';
import type { PressKit, PressKitSection, PressKitVisibility } from '@/types/press-kits';

/**
 * Publishing a kit, and everything about the link it lives at.
 *
 * One panel rather than a settings page, because these belong together: who
 * can find the kit, when press may run it, and whether the current wording is
 * the wording strangers are reading. Splitting them would let somebody change
 * the visibility and never notice the kit is not published at all.
 */

const VISIBILITY_OPTIONS: { value: PressKitVisibility; label: string; hint: string }[] = [
  {
    value: 'link_only',
    label: 'Anyone with the link',
    hint: 'Not in search results. Share it yourself.',
  },
  {
    value: 'public',
    label: 'Anyone with the link, and it stays off search',
    hint: 'The same as above today. Kept apart so you can change your mind later.',
  },
  {
    value: 'public_listed',
    label: 'Anyone, and search engines can find it',
    hint: 'Google and the rest can list this page.',
  },
];

const selectClass =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary ' +
  'focus:border-brand focus:outline-none disabled:opacity-60';

export function PublishPanel({
  kit,
  sections,
  onKitChange,
}: {
  kit: PressKit;
  sections: PressKitSection[];
  onKitChange: (kit: PressKit) => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const publicUrl = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/k/${kit.slug}`;
  }, [kit.slug]);

  const isLive = Boolean(kit.publishedAt);
  const blocker = canPublishKit(sections);
  const changed = useMemo(
    () => sections.filter((section) => !section.hidden && hasUnpublishedChanges(section)),
    [sections]
  );

  const call = async (
    path: string,
    init: RequestInit,
    fallback: string
  ): Promise<Record<string, unknown> | null> => {
    const headers = await authHeaders();
    if (!headers) return null;
    setError('');
    try {
      const response = await fetch(path, { ...init, headers });
      if (!response.ok) {
        setError(await readError(response, fallback));
        return null;
      }
      return (await response.json()) as Record<string, unknown>;
    } catch {
      setError(fallback);
      return null;
    }
  };

  const publish = async () => {
    setBusy('publish');
    const body = await call(
      `/api/press-kits/${kit.id}/publish`,
      { method: 'POST' },
      'Could not publish the press kit.'
    );
    setBusy('');
    if (body?.kit) onKitChange(body.kit as PressKit);
  };

  const unpublish = async () => {
    if (!window.confirm('Take the press kit down? The link stops working until you publish again.'))
      return;
    setBusy('unpublish');
    const body = await call(
      `/api/press-kits/${kit.id}/publish`,
      { method: 'DELETE' },
      'Could not take the press kit down.'
    );
    setBusy('');
    if (body?.kit) onKitChange(body.kit as PressKit);
  };

  const patchKit = async (patch: Record<string, unknown>, fallback: string) => {
    setBusy('settings');
    const body = await call(
      `/api/press-kits/${kit.id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      fallback
    );
    setBusy('');
    if (body?.kit) onKitChange(body.kit as PressKit);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-stroke-default p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-content-primary">
            {isLive ? 'This kit is live' : 'Not published yet'}
          </h2>
          <p className="mt-1 text-sm text-content-secondary">
            {isLive
              ? 'Anyone with the link can read it.'
              : 'Nobody can open the link until you publish.'}
          </p>
        </div>

        {isLive ? (
          <button
            type="button"
            onClick={() => void unpublish()}
            disabled={Boolean(busy)}
            className="motion-focus inline-flex items-center gap-2 rounded-lg border border-stroke-default px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover disabled:opacity-60"
          >
            {busy === 'unpublish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Take it down
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void publish()}
            disabled={Boolean(busy) || !blocker.ok}
            title={blocker.ok ? undefined : blocker.reason}
            className="motion-focus inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Publish
          </button>
        )}
      </div>

      {/* The one precondition, said out loud rather than left as a disabled
          button nobody can explain. The server checks it too. */}
      {!isLive && !blocker.ok ? (
        <p className="mt-3 text-sm text-status-warning">{blocker.reason}</p>
      ) : null}

      {isLive ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-stroke-default bg-bg-base px-3 py-2 font-mono text-xs text-content-secondary">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="motion-focus inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stroke-default px-3 py-2 text-xs text-content-secondary hover:bg-bg-hover"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a
            href={`/k/${kit.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="motion-focus inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stroke-default px-3 py-2 text-xs text-content-secondary hover:bg-bg-hover"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open
          </a>
        </div>
      ) : null}

      {/* Named rather than counted. "Three sections have changed" makes a
          manager hunt; naming them means one glance decides whether the change
          is worth republishing for. */}
      {isLive && changed.length > 0 ? (
        <div className="mt-4 rounded-lg border border-stroke-default bg-bg-base p-3">
          <p className="text-sm text-content-secondary">
            Edited since you published:{' '}
            <span className="text-content-primary">
              {changed.map((section) => PRESS_KIT_SECTION_LABELS[section.section]).join(', ')}
            </span>
            . Press are still reading the older wording.
          </p>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={Boolean(busy)}
            className="motion-focus mt-2 inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Publish the changes
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            Who can find it
          </span>
          <select
            value={kit.visibility}
            disabled={Boolean(busy)}
            onChange={(event) =>
              void patchKit({ visibility: event.target.value }, 'Could not save that setting.')
            }
            className={selectClass}
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-content-tertiary">
            {VISIBILITY_OPTIONS.find((option) => option.value === kit.visibility)?.hint}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            Under embargo until
          </span>
          <input
            type="date"
            value={kit.embargoDate || ''}
            disabled={Boolean(busy)}
            onChange={(event) =>
              void patchKit(
                { embargoDate: event.target.value || null },
                'Could not save that date.'
              )
            }
            className={selectClass}
          />
          <span className="mt-1 block text-xs text-content-tertiary">
            A line asking press to hold the story. It does not hide the kit.
          </span>
        </label>
      </div>

      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={kit.availableForInterview}
          disabled={Boolean(busy)}
          onChange={(event) =>
            void patchKit(
              { availableForInterview: event.target.checked },
              'Could not save that setting.'
            )
          }
          className="mt-0.5 h-4 w-4 rounded border-stroke-default"
        />
        <span className="text-sm text-content-secondary">
          The artist will do interviews. Shows on the kit so press know to ask.
        </span>
      </label>

      {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}

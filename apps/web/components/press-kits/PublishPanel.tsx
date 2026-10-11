'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, Loader2 } from '@/components/icons';
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
    label: 'Only people I send it to',
    hint: 'Google will not show it.',
  },
  {
    value: 'public',
    label: 'Only people I send it to (old setting)',
    hint: 'Google will not show it.',
  },
  {
    value: 'public_listed',
    label: 'Everyone, even on Google',
    hint: 'People can find it by searching.',
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
    if (!window.confirm('Turn off the link? It stops working until you share it again.'))
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

  // One question answered loudly: can people see it, and how do I send it?
  // Everything else (search, embargo, interviews, taking it down) waits under
  // "More options" (founder brief, 2026-10-11: too overwhelming).
  return (
    <section
      className={`mb-6 rounded-xl border p-4 sm:p-5 ${
        isLive ? 'border-brand/30 bg-brand/5' : 'border-stroke-default bg-bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-content-primary">
            {isLive ? 'Your kit is live' : 'Ready to share?'}
          </h2>
          <p className="mt-0.5 text-sm text-content-secondary">
            {isLive
              ? 'Send this link to anyone who wants to write about the artist.'
              : blocker.ok
                ? 'Turn it on and you get one link to send everywhere.'
                : blocker.reason}
          </p>
        </div>

        {!isLive ? (
          <button
            type="button"
            onClick={() => void publish()}
            disabled={Boolean(busy) || !blocker.ok}
            className="motion-focus motion-press inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Share it
          </button>
        ) : null}
      </div>

      {isLive ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-stroke-default bg-bg-base px-3 py-2.5 font-mono text-xs text-content-secondary">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="motion-focus motion-press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2.5 text-sm font-semibold text-content-inverse"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            href={`/k/${kit.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="motion-focus inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stroke-default bg-bg-elevated px-3.5 py-2.5 text-sm text-content-primary hover:bg-bg-hover"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            See it
          </a>
        </div>
      ) : null}

      {/* Named rather than counted, so one glance decides whether the change
          is worth putting live. */}
      {isLive && changed.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-default bg-bg-base px-3 py-2.5">
          <p className="text-sm text-content-secondary">
            You changed{' '}
            <span className="text-content-primary">
              {changed.map((section) => PRESS_KIT_SECTION_LABELS[section.section]).join(', ')}
            </span>
            . The link still shows the old version.
          </p>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={Boolean(busy)}
            className="motion-focus inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Update the link
          </button>
        </div>
      ) : null}

      <details className="group mt-3">
        <summary className="motion-focus inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-content-secondary hover:text-content-primary">
          More options
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-content-primary">
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
              {/* 'public' reads the same as link_only today, so it is only
                  offered to a kit already set to it. Two choices, not three. */}
              {VISIBILITY_OPTIONS.filter(
                (option) => option.value !== 'public' || kit.visibility === 'public'
              ).map((option) => (
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
            <span className="mb-1 block text-xs font-semibold text-content-primary">
              Ask writers to wait until
            </span>
            <input
              type="date"
              value={kit.embargoDate || ''}
              disabled={Boolean(busy)}
              onChange={(event) =>
                void patchKit({ embargoDate: event.target.value || null }, 'Could not save that date.')
              }
              className={selectClass}
            />
            <span className="mt-1 block text-xs text-content-tertiary">
              Adds a note. The kit still opens.
            </span>
          </label>
        </div>

        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            checked={kit.availableForInterview}
            disabled={Boolean(busy)}
            onChange={(event) =>
              void patchKit({ availableForInterview: event.target.checked }, 'Could not save that setting.')
            }
            className="mt-0.5 h-4 w-4 rounded border-stroke-default"
          />
          <span className="text-sm text-content-secondary">The artist is open to interviews</span>
        </label>

        {isLive ? (
          <button
            type="button"
            onClick={() => void unpublish()}
            disabled={Boolean(busy)}
            className="motion-focus mt-3 inline-flex items-center gap-2 text-xs font-semibold text-status-error hover:underline disabled:opacity-60"
          >
            {busy === 'unpublish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Turn off the link
          </button>
        ) : null}
      </details>

      {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}

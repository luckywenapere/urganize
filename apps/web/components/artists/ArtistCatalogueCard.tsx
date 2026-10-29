'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import {
  CATALOGUE_CHANGED_EVENT,
  fetchArtistCatalogue,
  requestCatalogueLink,
  saveReleaseCode,
  type Catalogue,
  type CatalogueRow,
} from '@/lib/artist-import/client';
import { kindLabel } from './ImportParts';
import { PoweredByAltlink } from '@/components/releases/PoweredByAltlink';

const SHOWN_AT_FIRST = 8;
const POLL_MS = 6000;
const MAX_POLLS = 20;

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';
const smallButton =
  'motion-focus motion-press inline-flex min-h-9 items-center rounded-full border border-stroke-default px-3.5 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';

/** The notices this list opens. */
export function Modal({ titleId, children, onClose }: { titleId: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-stroke-default bg-bg-elevated p-5 shadow-xl sm:p-6"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/** What the notice says before a link is made, and the count it uses. */
function LinkNotice({
  row,
  remaining,
  working,
  error,
  onConfirm,
  onClose,
}: {
  row: CatalogueRow;
  remaining: number | null;
  working: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal titleId="link-notice-title" onClose={onClose}>
      <h2 id="link-notice-title" className="font-display text-xl font-semibold text-content-primary">
        Grab a smart link for {row.title}?
      </h2>
      <p className="mt-2 text-sm leading-6 text-content-secondary">
        This makes a public smart link on Altlink that fans can open to stream or save the release. Anyone with the link can see it.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-content-secondary">
        <li>
          {remaining === null
            ? 'It uses 1 of your links for today.'
            : `It uses 1 of your links for today. ${remaining} left.`}
        </li>
        <li>Altlink makes the link, so we cannot edit or delete it from here.</li>
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onClose} disabled={working} className={secondaryButton}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={working} className={primaryButton}>
          {working ? 'Getting your smart link…' : 'Grab a smart link'}
        </button>
      </div>
    </Modal>
  );
}

function CapNotice({ limit, onClose }: { limit: number; onClose: () => void }) {
  return (
    <Modal titleId="link-cap-title" onClose={onClose}>
      <h2 id="link-cap-title" className="font-display text-xl font-semibold text-content-primary">
        That is {limit} links for today
      </h2>
      <p className="mt-2 text-sm leading-6 text-content-secondary">
        Each team can make {limit} links a day for now. Your count resets at midnight Lagos time. Everything else on the
        release still works.
      </p>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className={primaryButton}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

function AddCode({ artistId, row, onSaved }: { artistId: string; row: CatalogueRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={smallButton}>
        Add code
      </button>
    );
  }
  const save = async () => {
    setSaving(true);
    setError('');
    const problem = await saveReleaseCode(artistId, row.id, value);
    setSaving(false);
    if (problem) setError(problem);
    else onSaved();
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="UPC or ISRC"
          aria-label={`UPC or ISRC for ${row.title}`}
          autoComplete="off"
          className="w-40 rounded-lg border border-stroke-control bg-bg-elevated px-2.5 py-1.5 text-xs text-content-primary placeholder:text-content-tertiary outline-none focus:border-brand"
        />
        <button type="button" onClick={() => void save()} disabled={saving || !value.trim()} className={smallButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The artist's past releases, with their UPC and ISRC and a Grab a smart link on each
 * (2026-10-26, founder approved the mock). Since #866 these are rows in the
 * artist page's "Out now" stage; the page holds the Import button and the
 * empty line, so this draws nothing until there is a row (`onCount` says how many). A link is made only after a notice, and a team can
 * make a limited number a day (lib/artist-import/codes.ts).
 */
export function ArtistCatalogueCard({ artistId, onCount }: { artistId: string; onCount?: (count: number) => void }) {
  const [data, setData] = useState<Catalogue>({ releases: [], cap: null, codesPending: 0 });
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState<CatalogueRow | null>(null);
  const [working, setWorking] = useState(false);
  const [noticeError, setNoticeError] = useState('');
  const [capLimit, setCapLimit] = useState<number | null>(null);
  const [justCopied, setJustCopied] = useState('');
  const polls = useRef(0);

  const load = useCallback(() => {
    void fetchArtistCatalogue(artistId).then(setData);
  }, [artistId]);

  useEffect(() => {
    polls.current = 0;
    load();
    const refresh = () => {
      polls.current = 0;
      load();
    };
    window.addEventListener(CATALOGUE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CATALOGUE_CHANGED_EVENT, refresh);
  }, [load]);

  // While codes are still being looked up in the background, check again.
  useEffect(() => {
    if (data.codesPending === 0 || polls.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      load();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [data, load]);

  const confirmLink = async () => {
    if (!confirming) return;
    setWorking(true);
    setNoticeError('');
    const result = await requestCatalogueLink(artistId, confirming.id);
    setWorking(false);
    if (result.ok) {
      captureAnalyticsEvent({ name: 'catalogue_link_made', properties: { existing: false } });
      setConfirming(null);
      load();
      return;
    }
    if (result.reason === 'cap') {
      setConfirming(null);
      setCapLimit(result.cap?.limit ?? data.cap?.limit ?? 10);
      captureAnalyticsEvent({ name: 'catalogue_link_cap_hit', properties: {} });
      load();
      return;
    }
    setNoticeError(result.message);
  };

  const copy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(id);
      window.setTimeout(() => setJustCopied(''), 1800);
    } catch {
      // The link stays visible to copy by hand.
    }
  };

  const rows = data.releases;
  useEffect(() => {
    onCount?.(rows.length);
  }, [onCount, rows.length]);
  const visible = showAll ? rows : rows.slice(0, SHOWN_AT_FIRST);

  return (
    <>
      {rows.length === 0 ? null : (
        <>
          <ul className="space-y-0.5">
            {visible.map((row) => {
              const hasCode = Boolean(row.upc || row.isrc);
              const lookingUp = !hasCode && row.source === 'deezer' && !row.codes_checked_at;
              return (
                <li key={row.id} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2">
                  {row.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote cover, never stored by us
                    <img src={row.cover_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-bg-elevated object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-lg font-semibold text-content-secondary">
                      {row.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-content-primary">{row.title}</p>
                    <p className="truncate text-xs text-content-secondary">
                      {kindLabel(row.kind)}
                      {row.release_date ? `, ${row.release_date.slice(0, 4)}` : ''}
                    </p>
                    <p className="truncate font-mono text-xs text-content-tertiary">
                      {hasCode
                        ? [row.upc ? `UPC ${row.upc}` : '', row.isrc ? `ISRC ${row.isrc}` : ''].filter(Boolean).join(' · ')
                        : lookingUp
                          ? 'Looking up codes…'
                          : 'UPC and ISRC not found yet'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {row.link?.url ? (
                      <div className="flex flex-col items-end gap-1">
                        <a
                          href={row.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-44 truncate text-xs font-medium text-status-success underline-offset-2 hover:underline"
                        >
                          {row.link.url.replace(/^https?:\/\//, '')}
                        </a>
                        <button type="button" onClick={() => void copy(row.link?.url ?? '', row.id)} className={smallButton}>
                          {justCopied === row.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ) : hasCode ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNoticeError('');
                          setConfirming(row);
                        }}
                        className={smallButton}
                      >
                        Grab a smart link
                      </button>
                    ) : lookingUp ? null : (
                      <AddCode artistId={artistId} row={row} onSaved={load} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > SHOWN_AT_FIRST ? (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="motion-focus mt-2 text-xs font-medium text-content-secondary hover:text-content-primary"
            >
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          ) : null}
          {data.cap ? (
            <p className="mt-2 text-xs text-content-tertiary">
              Links made today: {data.cap.used} of {data.cap.limit}
            </p>
          ) : null}
          {/* The links are Altlink's, so their credit sits under the list (#852). */}
          {rows.some((row) => row.link?.url) ? <PoweredByAltlink className="mt-3" /> : null}
        </>
      )}

      {confirming ? (
        <LinkNotice
          row={confirming}
          remaining={data.cap ? data.cap.remaining : null}
          working={working}
          error={noticeError}
          onConfirm={() => void confirmLink()}
          onClose={() => (working ? undefined : setConfirming(null))}
        />
      ) : null}
      {capLimit !== null ? <CapNotice limit={capLimit} onClose={() => setCapLimit(null)} /> : null}
    </>
  );
}

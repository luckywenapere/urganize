'use client';

// The Promote entry "Smart link" (never "Pre-save link", Oct 29, 2026, #850):
// the Altlink link leads, the fan email page sits under it in a fold. The
// Distribute tab shows it in two parts: the link, and its numbers. Design signed off in
// BUILD-NOTES-ALTLINK.md: one hero sentence per state, one green action, empty
// blocks never render, pending text quiet. Nothing here creates a link on a tap
// except "Try again": the server makes it as soon as the rollout is ready.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { copyText, shareTextToApps } from '@/lib/share-file';
import {
  ctrPercent,
  daysUntilRelease,
  orderPlatforms,
  smartLinkPhase,
  type SmartLinkPlatform,
  type SmartLinkStats,
} from '@/lib/altlink/rules';
import { CaptureSection } from './CaptureSection';
import { PoweredByAltlink } from './PoweredByAltlink';
import { markSmartLinkReady } from './useSmartLinkReady';

type SmartLinkView = {
  enabled: boolean;
  configured: boolean;
  link: {
    url: string | null;
    slug: string | null;
    type: string | null;
    status: string;
    releaseDate: string | null;
    platforms: SmartLinkPlatform[];
    lastError: string | null;
    presaveSignups: number;
  } | null;
  stats: SmartLinkStats | null;
  statsFetchedAt: string | null;
  facts: {
    title: string | null;
    artistName: string | null;
    releaseType: string | null;
    releaseDate: string | null;
    upc: string | null;
    isrc: string | null;
    codeSource: 'details' | 'trm' | null;
  };
  notReady: string | null;
};

type Props = {
  releaseId: string;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** 'all' (the rollout menu), or one Distribute tab: the link, or its numbers. */
  part?: 'all' | 'link' | 'numbers';
  /** Numbers tab with no link yet: the way back to the link tab. */
  onOpenLink?: () => void;
};

const GREEN_BUTTON =
  'motion-focus motion-press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const QUIET_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stroke-control bg-transparent px-3.5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';
const CARD = 'rounded-2xl border border-stroke-default bg-bg-surface';
const META = 'font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary';

const PLATFORM_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  applemusic: 'Apple Music',
  apple: 'Apple Music',
  audiomack: 'Audiomack',
  boomplay: 'Boomplay',
  youtube_music: 'YouTube Music',
  youtube: 'YouTube',
  deezer: 'Deezer',
  tidal: 'Tidal',
  amazon_music: 'Amazon Music',
  soundcloud: 'SoundCloud',
};

export const platformName = (id: string): string =>
  PLATFORM_NAMES[id.toLowerCase()] ??
  id
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');

/** "FRI 6 NOV" for a YYYY-MM-DD, read as a calendar day. */
function dayLabel(ymd: string | null): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const rest = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${weekday} ${rest}`.toUpperCase();
}

function dropsLine(days: number | null): string {
  if (days === null) return 'Smart link is live.';
  if (days <= 0) return 'Drops today.';
  if (days === 1) return 'Drops tomorrow.';
  return `Drops in ${days} days.`;
}

const timeLabel = (iso: string | null): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isFinite(at.getTime())
    ? at.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })
    : null;
};

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(input, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
}

export function SmartLinkSection({ releaseId, onToast, part = 'all', onOpenLink }: Props) {
  const { openScene } = useSceneOverlay();
  const [view, setView] = useState<SmartLinkView | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const polls = useRef(0);
  // The clock the states are read against, moved on each load (not read in render).
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await authedFetch(`/api/releases/${releaseId}/altlink`);
      if (response.status === 404) {
        setView(null);
        setLoadError(false);
        return;
      }
      if (!response.ok) throw new Error('load');
      const body = (await response.json()) as { view: SmartLinkView; canWrite: boolean };
      setNow(Date.now());
      setView(body.view);
      setCanWrite(Boolean(body.canWrite));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [releaseId]);

  useEffect(() => {
    polls.current = 0;
    void load();
  }, [load]);

  const releaseDate = view?.link?.releaseDate ?? view?.facts.releaseDate ?? null;
  const phase = view ? smartLinkPhase(view.link, releaseDate, now) : 'none';
  const waitingToCreate =
    Boolean(view?.enabled && view?.configured) && !view?.link && !view?.notReady;
  const creating = phase === 'creating' || waitingToCreate;

  // A link seen here turns the menu row and panel title to "Smart link" (#852).
  const linkSeen = phase === 'presave' || phase === 'released';
  useEffect(() => {
    if (linkSeen) markSmartLinkReady(releaseId);
  }, [linkSeen, releaseId]);

  // While a link is being made, look again a few times (never on lists).
  useEffect(() => {
    if (!creating || polls.current >= 15) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      void load();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [creating, view, load]);

  const retry = async () => {
    setRetrying(true);
    try {
      const response = await authedFetch(`/api/releases/${releaseId}/altlink`, { method: 'POST' });
      if (response.ok) {
        const body = (await response.json()) as { view: SmartLinkView };
        polls.current = 0;
        setView(body.view);
      } else {
        onToast?.('Altlink still isn’t answering. Try again in a minute.', 'error');
      }
    } catch {
      onToast?.('Altlink still isn’t answering. Try again in a minute.', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const url = view?.link?.url ?? null;

  const copy = async () => {
    if (!url) return;
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else onToast?.('Couldn’t copy. Press and hold the link instead.', 'warning');
  };

  const share = async () => {
    if (!url) return;
    const title = view?.facts.title ?? 'New music';
    const text =
      phase === 'released'
        ? `${title} is out now. Listen: ${url}`
        : `Pre-save ${title}: ${url}`;
    const outcome = await shareTextToApps({ text, title });
    if (outcome === 'unsupported') {
      if (await copyText(url)) onToast?.('Link copied. Paste it anywhere.', 'success');
    }
  };

  if (!view && !loadError) {
    return (
      <div className="mt-6 space-y-3" aria-busy="true">
        <div className={`${CARD} h-40 animate-pulse`} />
        <div className={`${CARD} h-24 animate-pulse`} />
      </div>
    );
  }

  // Altlink switched off for this deployment: the fan email page alone.
  if (!view || !view.enabled) {
    if (loadError) {
      return (
        <div className={`${CARD} mt-6 flex items-center justify-between gap-3 p-4`}>
          <p role="alert" className="text-sm text-content-secondary">Couldn’t load the smart link.</p>
          <button type="button" onClick={() => void load()} className={QUIET_BUTTON}>
            Try again
          </button>
        </div>
      );
    }
    return <CaptureSection releaseId={releaseId} onToast={onToast} />;
  }

  const hasLink = phase === 'presave' || phase === 'released';
  const hidden = view.notReady === 'test' || view.notReady === 'archived' || view.notReady === 'no_release';
  // No link, not being made and not failed: the rollout has no code (or no
  // date, name or artist) yet. Altlink asked that no smart link show then
  // (#852): the fan email page alone, a line on when the link comes, and the
  // way to add the code. No Altlink label, since nothing of theirs is shown.
  const waitingForCode = !hasLink && phase !== 'failed' && !creating;

  if (part === 'numbers') {
    return (
      <div className="mt-6 space-y-4">
        {hasLink ? (
          <LinkNumbers view={view} released={phase === 'released'} />
        ) : (
          <section className={`${CARD} flex flex-wrap items-center justify-between gap-3 px-5 py-4`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content-primary">No numbers yet</p>
              <p className={`mt-1 ${META} opacity-80`}>They start once your smart link is live</p>
            </div>
            {onOpenLink ? (
              <button type="button" onClick={onOpenLink} className={QUIET_BUTTON}>
                Open smart link
              </button>
            ) : null}
          </section>
        )}
        <PoweredByAltlink />
      </div>
    );
  }

  if (waitingForCode) {
    return (
      <div className="mt-6 space-y-4">
        <section className={`${CARD} px-5 pb-5 pt-4`}>
          <h3 className="text-sm font-semibold text-content-primary">Fan email page</h3>
          <CaptureSection releaseId={releaseId} onToast={onToast} embedded beforeLink />
        </section>
        {hidden ? null : (
          <SmartLinkComing
            reason={view.notReady}
            configured={view.configured}
            canWrite={canWrite}
            onAddCode={() => openScene('metadata', releaseId, { field: 'upc' })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {hidden ? null : phase === 'presave' || phase === 'released' ? (
        <LinkCard
          view={view}
          phase={phase}
          releaseDate={releaseDate}
          copied={copied}
          onCopy={() => void copy()}
          onShare={() => void share()}
          now={now}
          showNumbers={part === 'all'}
        />
      ) : phase === 'failed' ? (
        <section className={`${CARD} p-5 sm:p-6`}>
          <span className="inline-flex items-center rounded-full bg-status-error/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-status-error">
            Not created
          </span>
          <h3 className="mt-3 font-display text-2xl text-content-primary">Altlink didn’t answer.</h3>
          <p className={`mt-1 ${META}`}>Nothing was created · your details are safe</p>
          <Facts facts={view.facts} />
          {canWrite ? (
            <button type="button" onClick={() => void retry()} disabled={retrying} className={`mt-5 ${GREEN_BUTTON}`}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Try again
            </button>
          ) : null}
        </section>
      ) : creating ? (
        <section className={`${CARD} p-5 sm:p-6`} aria-live="polite">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-content-tertiary" />
            <p className="text-sm text-content-secondary">Making your smart link…</p>
          </div>
          <Facts facts={view.facts} />
        </section>
      ) : null}

      <details className={`${CARD} group`} open={!hasLink}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-content-primary">
          Fan email page
          <span className={META}>{hasLink ? 'Your emails' : 'Collect emails now'}</span>
        </summary>
        <div className="border-t border-stroke-default px-5 pb-5">
          <CaptureSection releaseId={releaseId} onToast={onToast} embedded quiet={hasLink} />
        </div>
      </details>

      <PoweredByAltlink />
    </div>
  );
}

/** Under the fan email page while there is no link: when it comes, and the way to add the code. */
function SmartLinkComing({
  reason,
  configured,
  canWrite,
  onAddCode,
}: {
  reason: string | null;
  configured: boolean;
  canWrite: boolean;
  onAddCode: () => void;
}) {
  if (!configured) return null;
  const line =
    reason === 'no_date'
      ? 'Your smart link shows up here once the rollout has a release date and the song has a UPC or ISRC.'
      : reason === 'no_title'
        ? 'Your smart link shows up here once the rollout has a name.'
        : reason === 'no_artist'
          ? 'Your smart link shows up here once the rollout has an artist.'
          : 'Your smart link shows up here once the song has a UPC or ISRC.';
  const needsCode = reason === 'no_code' || reason === 'missing_identifier';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="min-w-0 flex-1 text-sm text-content-secondary">{line}</p>
      {needsCode && canWrite ? (
        <button type="button" onClick={onAddCode} className={QUIET_BUTTON}>
          Add UPC or ISRC
        </button>
      ) : null}
    </div>
  );
}

function Facts({ facts }: { facts: SmartLinkView['facts'] }) {
  const rows: [string, string | null][] = [
    ['Title', facts.title],
    ['Artist', facts.artistName],
    ['Release day', dayLabel(facts.releaseDate)],
    [facts.upc ? 'UPC' : 'ISRC', facts.upc ?? facts.isrc],
  ];
  const shown = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (shown.length === 0) return null;
  return (
    <dl className="mt-5 divide-y divide-stroke-default rounded-xl border border-stroke-default">
      {shown.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className={META}>{label}</dt>
          <dd className="min-w-0 truncate text-sm text-content-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinkCard({
  view,
  phase,
  releaseDate,
  copied,
  onCopy,
  onShare,
  now,
  showNumbers,
}: {
  view: SmartLinkView;
  phase: 'presave' | 'released';
  releaseDate: string | null;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  now: number;
  showNumbers: boolean;
}) {
  const link = view.link!;
  const url = link.url!;
  const shortUrl = url.replace(/^https?:\/\//, '');
  const day = dayLabel(releaseDate);
  const released = phase === 'released';
  const platforms = orderPlatforms(link.platforms);

  return (
    <>
      <section className={`${CARD} p-5 sm:p-6`}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          {released ? 'Out now' : 'Live'}
        </span>
        <h3 className="mt-3 font-display text-3xl leading-tight text-content-primary">
          {released ? 'Out now. Same link.' : dropsLine(daysUntilRelease(releaseDate, now))}
        </h3>
        {released ? (
          <p className={`mt-1.5 ${META}`}>Pre-savers were sent the music at midnight</p>
        ) : day ? (
          <p className={`mt-1.5 ${META}`}>{day} · Midnight Lagos · Then streaming</p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stroke-control bg-bg-base px-3 py-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-sm text-content-primary hover:underline"
            >
              {shortUrl}
            </a>
            <button type="button" onClick={onCopy} className="motion-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" onClick={onShare} className={`${GREEN_BUTTON} w-full lg:w-auto`}>
            Share link
          </button>
        </div>
      </section>

      <div className={released ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>
        {released && platforms.length > 0 ? (
          <section className={`${CARD} p-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <h4 className={META}>Stores</h4>
              <span className={`${META} opacity-80`}>
                {platforms.filter((p) => p.isActive && p.url).length} of {platforms.length} found
              </span>
            </div>
            <ul className="mt-3 divide-y divide-stroke-default">
              {platforms.map((p) => {
                const found = p.isActive && Boolean(p.url);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className={`text-sm ${found ? 'text-content-primary' : 'text-content-tertiary'}`}>
                      {p.name || platformName(p.id)}
                    </span>
                    {found ? (
                      <a href={p.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand" aria-label={`Open on ${p.name}`}>
                        <Check className="h-4 w-4" />
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className={`${META} opacity-80`}>Looking</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {showNumbers ? <LinkNumbers view={view} released={released} /> : null}
      </div>
    </>
  );
}

/** "So far", "Where fans click" and "Where fans are": the rollout menu's view, and Distribute's Numbers tab. */
function LinkNumbers({ view, released }: { view: SmartLinkView; released: boolean }) {
  const stats = view.stats;
  const presaves = Math.max(stats?.presaves ?? 0, view.link?.presaveSignups ?? 0);
  const ctr = ctrPercent(stats?.ctr ?? null);
  const updated = timeLabel(view.statsFetchedAt);
  const rows: { label: string; value: string; meta?: string }[] = released
    ? [
        { label: 'Visits', value: (stats?.views ?? 0).toLocaleString('en') },
        { label: 'Clicks', value: (stats?.clicks ?? 0).toLocaleString('en'), meta: ctr !== null ? `${ctr}% of visits` : undefined },
      ]
    : [
        { label: 'Visits', value: (stats?.views ?? 0).toLocaleString('en') },
        { label: 'Clicks', value: (stats?.clicks ?? 0).toLocaleString('en') },
        { label: 'Pre-saves', value: presaves.toLocaleString('en') },
      ];

  return (
    <>
        <section className={`${CARD} p-5`}>
          <div className="flex items-baseline justify-between gap-3">
            <h4 className={META}>So far</h4>
            {updated ? <span className={`${META} opacity-80`}>Updated {updated}</span> : null}
          </div>
          <dl className="mt-3 divide-y divide-stroke-default">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="text-sm text-content-secondary">{row.label}</dt>
                <dd className="text-right">
                  <span className="font-mono text-base text-content-primary">{row.value}</span>
                  {row.meta ? <span className={`ml-2 ${META}`}>{row.meta}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {stats && stats.topPlatforms.length > 0 ? (
          <ShareList
            title="Where fans click"
            wide={stats.topCountries.length === 0}
            rows={stats.topPlatforms.map((p) => ({ key: p.platform, label: platformName(p.platform), clicks: p.clicks, percentage: p.percentage }))}
          />
        ) : null}
        {stats && stats.topCountries.length > 0 ? (
          <ShareList
            title="Where fans are"
            wide={stats.topPlatforms.length === 0}
            rows={stats.topCountries.map((c) => ({ key: c.country, label: c.country, clicks: c.clicks, percentage: c.percentage }))}
          />
        ) : null}
    </>
  );
}

/** A card of names with a count, a share and a bar. Takes the full row when it is alone. */
function ShareList({
  title,
  wide,
  rows,
}: {
  title: string;
  wide: boolean;
  rows: { key: string; label: string; clicks: number; percentage: number }[];
}) {
  return (
    <section className={`${CARD} p-5 ${wide ? 'lg:col-span-2' : ''}`}>
      <h4 className={META}>{title}</h4>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-content-primary">{row.label}</span>
              <span className="font-mono text-content-secondary">
                {row.clicks.toLocaleString('en')} · {Math.round(row.percentage)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-stroke-strong">
              <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, row.percentage))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}


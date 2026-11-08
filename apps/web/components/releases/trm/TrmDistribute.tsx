'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from '@/components/icons';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { releaseDayHasPassed } from '@/lib/release-out';
import { fixDestinationFor, type FixAvailability } from '@/lib/distribution-fix';
import type { DistributionFieldPath } from '@/lib/distribution-rules';
import {
  DEFAULT_TRM_SETTINGS,
  IN_FLIGHT,
  SOUNDEXCHANGE_POLICIES,
  TRM_POLICIES,
  TRM_SIGNUP_URL,
  chipFor,
  formatShortDay,
  heroForInFlight,
  progressFor,
  receivedByTrm,
  TRM_ARTIST_NOT_FOUND_TEXT,
  type TrmSettings,
} from '@/lib/trm/release';
import type { TrmRowView } from '@/lib/trm/server';
import {
  Chip,
  Face,
  Hero,
  List,
  MONO,
  OUTLINE,
  PRIMARY,
  Partners,
  QUIET_LINK,
  ROW_BUTTON,
  ROW_PRIMARY,
  Ring,
  Row,
  SectionLabel,
  Tick,
  Todo,
} from './TrmParts';
import { TrmSendSheet, TrmShell } from './TrmSendSheet';
import { AddSongRow, SongSheet, SongsSection } from './TrmSongs';
import { useTrm, type TrmPost } from './useTrm';
import { DistributionPlanCard } from './DistributionPlanCard';
import { DistributionLimitBlock } from './DistributionLimit';
import { isBlocked, isExtraReleaseReference } from '@/lib/distribution-limits';
import { useDistributionPlan } from './useDistributionPlan';
import { checkoutPath } from '@/lib/self-serve';

/**
 * The Distribute step with Send to TRM (URG-392), built to the approved mocks
 * (Oct 19, 2026). One serif sentence says where the rollout stands, at most
 * one green action, everything TRM needs as quiet rows below. TRM is named on
 * the send action and the status only; the step's entry stays "Distribute".
 *
 * Songs (#1115): an EP or album lists its songs above everything else; a
 * single offers "Add a song". An EP or album the team's plan does not cover
 * shows the way on (Move to Pro, Pay yearly) instead of Send.
 *
 * States: plan does not cover it (EP/album), N things before it can go, needs a TRM
 * account, ready (Send to TRM; "opens soon" for teams outside the test
 * allowlist), in flight (Sent / Checking / Accepted / Delivering, live chip),
 * sent back (fix rows, Resend), delivered (UPC/ISRC).
 */

const SCENE_FLAGS = {
  metadata: process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true',
  coverArt: process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true',
};

const isSongRow = (row: { key: string }) => row.key.startsWith('song:') || row.key === 'songs';

const ACTION_LABEL = { move: 'Move', upload: 'Upload', ask: 'Ask', fix: 'Fix' } as const;
const POLL_MS = 120_000;

const formatStamp = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatShortDay(iso);
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${day} · ${time}`;
};

type Props = {
  releaseId: string;
  onOpenDetails?: () => void;
  onChangeArtist?: () => void;
};

export function TrmDistribute({ releaseId, onOpenDetails, onChangeArtist }: Props) {
  const { data, loadError, reload, post } = useTrm(releaseId);
  const { plan } = useDistributionPlan();
  const { openScene } = useSceneOverlay();
  const router = useRouter();
  const [sheet, setSheet] = useState<'send' | 'resend' | 'settings' | 'email' | null>(null);
  const [busy, setBusy] = useState(false);
  // Solo and Manager may always send with the artist's own TRM account instead
  // of paying us (#1112). Remembered for this visit only.
  const [ownPlan, setOwnPlan] = useState(false);
  const sheetPost: TrmPost = (action, body) =>
    post(action, action === 'submit' && ownPlan ? { ...(body ?? {}), ownPlan: true } : body);
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [songSheet, setSongSheet] = useState<string | null>(null);
  const [songBusy, setSongBusy] = useState(false);

  // Back from Paystack for one extra release: settle it, then open the send
  // sheet so the release goes on. The webhook settles it too; a slow Paystack
  // answers 'pending' and is asked again.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref') || '';
    const cancelled = params.get('payment') === 'cancelled';
    if (!isExtraReleaseReference(reference) && !cancelled) return;
    const clean = new URL(window.location.href);
    for (const key of ['reference', 'trxref', 'payment']) clean.searchParams.delete(key);
    window.history.replaceState(null, '', clean.toString());
    if (cancelled || !isExtraReleaseReference(reference)) return;
    let stopped = false;
    const settle = async (tries: number) => {
      const result = await post('extra_verify', { reference });
      if (stopped) return;
      const state = String(result.data.state || '');
      if (result.ok && state === 'paid') {
        await reload();
        setNote('Paid. Now send it.');
        setSheet('send');
      } else if (result.ok && state === 'pending' && tries > 0) {
        window.setTimeout(() => void settle(tries - 1), 3_000);
      } else if (state === 'not_paid') {
        setNote('The payment did not go through. Nothing was charged.');
      } else {
        setNote(String(result.data.error || 'We are checking your payment. Refresh in a minute.'));
      }
    };
    void settle(5);
    return () => {
      stopped = true;
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payForExtra = async () => {
    setPayError('');
    setPaying(true);
    const result = await post('extra_checkout');
    const url = typeof result.data.authorizationUrl === 'string' ? result.data.authorizationUrl : '';
    if (result.ok && url) {
      window.location.assign(url);
      return;
    }
    setPaying(false);
    setPayError(String(result.data.error || 'Could not open the payment page. Try again.'));
    void reload();
  };

  const status = data?.submission?.status ?? null;
  const inFlight = status !== null && IN_FLIGHT.includes(status);
  // "Submitted" (the API took it) vs "Received by TRM" (delivered into TRM).
  const received = receivedByTrm(status, data?.submission?.history ?? []);

  // Fallback poll while TRM has it, in case a webhook is late.
  useEffect(() => {
    if (!inFlight) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const result = await post('refresh');
      if (!stopped && result.ok && (result.data.status !== status || Boolean(result.data.received) !== received)) void reload();
    };
    const first = window.setTimeout(() => void tick(), 4_000);
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [inFlight, post, reload, status, received]);

  const availability: FixAvailability = {
    ...SCENE_FLAGS,
    canEditDetails: Boolean(onOpenDetails),
    canChangeArtist: Boolean(onChangeArtist),
  };
  const fixRun = (fieldPath: DistributionFieldPath | string | null): (() => void) | null => {
    if (!fieldPath) return null;
    const destination = fixDestinationFor(fieldPath as DistributionFieldPath, availability);
    if (destination?.kind === 'scene') return () => openScene(destination.scene, releaseId, { field: destination.field });
    if (destination?.kind === 'details') return () => onOpenDetails?.();
    if (destination?.kind === 'artist') return () => onChangeArtist?.();
    // On the standalone Distribute page there is no details sheet: open the rollout.
    if (fieldPath === 'release_date' || fieldPath === 'title' || fieldPath === 'artist') {
      return () => router.push(`/dashboard?release=${releaseId}`);
    }
    return null;
  };

  if (loadError && !data) {
    return (
      <div className="mx-auto mt-8 max-w-[880px] border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary" role="alert">
          We could not load this step.
        </p>
        <button type="button" onClick={() => void reload()} className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto mt-8 max-w-[880px] space-y-6" aria-busy="true">
        <div className="h-4 w-24 animate-pulse bg-bg-surface" />
        <div className="h-10 w-3/4 animate-pulse bg-bg-surface" />
        <div className="h-64 animate-pulse border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  const KIND_LABEL = { single: 'Single', ep: 'EP', album: 'Album' } as const;
  const songCount = data.checklist.songs.length;
  const kindLine = `${KIND_LABEL[data.kind]}${songCount > 1 ? ` · ${songCount} songs` : ''}`;
  const meta = [kindLine, data.releaseDate ? `Out ${formatShortDay(data.releaseDate)}` : null, 'All stores'].filter(Boolean).join(' · ');
  const chip = chipFor(status, received);
  const chipNode = chip ? <Chip label={chip.label} tone={chip.tone} /> : null;

  // ---- Songs (#1115) ------------------------------------------------------------
  const showSongs = songCount > 1 || data.kind !== 'single';
  const songsLocked = inFlight || status === 'published' || status === 'takedown_requested' || status === 'taken_down';
  const addSong = async () => {
    setNote('');
    setSongBusy(true);
    const result = await post('track_add');
    setSongBusy(false);
    if (!result.ok) return setNote(String(result.data.error || 'Could not add the song.'));
    await reload();
    if (typeof result.data.trackId === 'string') setSongSheet(result.data.trackId);
  };
  const reorderSongs = async (trackIds: string[]) => {
    setSongBusy(true);
    const result = await post('track_order', { trackIds });
    setSongBusy(false);
    if (!result.ok) setNote(String(result.data.error || 'Could not reorder.'));
    await reload();
  };
  const moveSong = (trackId: string, direction: -1 | 1) => {
    const ids = data.tracks.map((t) => t.id);
    const at = ids.indexOf(trackId);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    void reorderSongs(ids);
  };
  const rolloutCredits =
    [...data.checklist.ready, ...data.checklist.blocking].find((r) => r.key === 'credits')?.detail ?? 'The rollout’s credits';
  const songsSection = showSongs ? (
    <SongsSection
      songs={data.checklist.songs}
      locked={songsLocked}
      busy={songBusy}
      onOpen={(id) => id && setSongSheet(id)}
      onAdd={() => void addSong()}
      onReorder={(ids) => void reorderSongs(ids)}
    />
  ) : null;
  const addSongRow = !showSongs && !songsLocked ? <AddSongRow busy={songBusy} onAdd={() => void addSong()} /> : null;
  const openTrack = songSheet ? data.tracks.find((t) => t.id === songSheet) ?? null : null;
  const openTrackIndex = openTrack ? data.tracks.indexOf(openTrack) : -1;

  const pressSend = async () => {
    setNote('');
    if (!data.canSend) {
      setBusy(true);
      const result = await post('interest');
      setBusy(false);
      if (result.ok) await reload();
      else setNote(String(result.data.error || 'Try again.'));
      return;
    }
    setSheet('send');
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied.`);
    } catch {
      setNote(text);
    }
  };

  const blockingRow = (row: TrmRowView) => {
    const run = row.trackId
      ? () => setSongSheet(row.trackId as string)
      : row.key === 'songs'
        ? () => void addSong()
        : fixRun(row.fix);
    const isFirst = data.checklist.blocking[0]?.key === row.key;
    return (
      <Row
        key={row.key}
        mark={<Todo />}
        title={row.title}
        detail={row.detail}
        right={
          <>
            {row.owner ? <Face owner={row.owner} /> : null}
            {run && row.action ? (
              <button type="button" onClick={run} className={isFirst && row.key === 'release_date' ? ROW_PRIMARY : ROW_BUTTON}>
                {ACTION_LABEL[row.action]}
              </button>
            ) : null}
          </>
        }
      />
    );
  };

  const readyRow = (row: TrmRowView) => {
    // The details form lives only here (not in the rollout menu), so a filled
    // Details row still opens it.
    const editDetails = row.key === 'details' ? fixRun(row.fix) : null;
    return (
      <Row
        key={row.key}
        mark={<Tick />}
        title={row.title}
        detail={row.detail}
        right={
          row.key === 'rights' ? (
            <button type="button" onClick={() => setSheet('settings')} className={QUIET_LINK}>
              Edit
            </button>
          ) : editDetails ? (
            <button type="button" onClick={editDetails} className={QUIET_LINK}>
              Edit
            </button>
          ) : null
        }
      />
    );
  };

  const sheets = (
    <>
      {sheet === 'send' || sheet === 'resend' ? (
        <TrmSendSheet
          title={data.title}
          artist={data.primaryArtist}
          releaseDate={data.releaseDate}
          initialEmail={data.artistEmail}
          kind={data.kind}
          songs={data.checklist.songs.map((song, i) => ({
            sequence: song.sequence,
            title: song.title,
            hasMaster: Boolean(data.masters[i]),
          }))}
          planIncluded={
            plan?.state === 'included' ||
            (!ownPlan && !!data.limit && ['ok', 'already_counted', 'paid_extra'].includes(data.limit.verdict))
          }
          resend={sheet === 'resend'}
          post={sheetPost}
          onClose={() => {
            setSheet(null);
            void reload();
          }}
          onDone={() => {
            setSheet(null);
            void reload();
          }}
        />
      ) : null}
      {openTrack ? (
        <SongSheet
          key={openTrack.id}
          track={openTrack}
          sequence={openTrackIndex + 1}
          count={data.tracks.length}
          rolloutCredits={rolloutCredits}
          post={post}
          onClose={() => setSongSheet(null)}
          onSaved={() => void reload()}
          onMove={(direction) => moveSong(openTrack.id, direction)}
        />
      ) : null}
      {sheet === 'settings' ? <SettingsSheet settings={data.settings} post={post} onClose={() => setSheet(null)} onSaved={() => void reload()} /> : null}
      {sheet === 'email' ? (
        <EmailSheet email={data.artistEmail} post={post} onClose={() => setSheet(null)} onSaved={() => void reload()} />
      ) : null}
    </>
  );

  const noteLine = note ? (
    <p role="status" className="mt-3 text-sm text-content-secondary">
      {note}
    </p>
  ) : null;

  const wrap = (children: React.ReactNode) => (
    <div className="mx-auto mt-8 max-w-[880px] space-y-9">
      {children}
      <DistributionPlanCard plan={plan} limit={data.limit} ownPlan={ownPlan} />
      {sheets}
    </div>
  );

  // ---- Delivered ----------------------------------------------------------
  if (status === 'published') {
    const delivered = [...(data.submission?.history ?? [])].reverse().find((h) => h.status === 'published');
    return wrap(
      <>
        <Hero title="Delivered to stores." meta={`Live ${formatShortDay(data.releaseDate)} · All stores · With TRM Distro`} chip={chipNode} />
        <section>
          <SectionLabel>Done</SectionLabel>
          <List>
            <Row mark={<Tick />} title="Delivered" detail={formatStamp(delivered?.at)} />
            {data.submission?.upc ? (
              <Row
                mark={<Tick />}
                title="UPC"
                detail={`from TRM · ${data.submission.upc}`}
                right={<button type="button" className={QUIET_LINK} onClick={() => void copy(data.submission?.upc ?? '', 'UPC')}><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy</button>}
              />
            ) : null}
            {data.submission?.isrc ? (
              <Row
                mark={<Tick />}
                title="ISRC"
                detail={`from TRM · ${data.submission.isrc}`}
                right={<button type="button" className={QUIET_LINK} onClick={() => void copy(data.submission?.isrc ?? '', 'ISRC')}><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy</button>}
              />
            ) : null}
          </List>
          {noteLine}
        </section>
        <Partners trm={false} />
      </>
    );
  }

  // ---- In flight ------------------------------------------------------------
  if (inFlight && status) {
    const steps = progressFor(status, data.submission?.history ?? [], data.releaseDate);
    return wrap(
      <>
        <Hero
          title={heroForInFlight(status, received)}
          meta={received ? 'We’ll tell you the moment it moves · Nothing to do' : 'Waiting for TRM to receive it · Nothing to do'}
          chip={chipNode}
        />
        <section>
          <SectionLabel>Progress</SectionLabel>
          <ol className="flex flex-col gap-0 sm:flex-row sm:gap-1.5">
            {steps.map((step) => (
              <li
                key={step.label}
                className={`flex items-baseline justify-between gap-3 border-l-2 py-2 pl-3 sm:block sm:flex-1 sm:border-l-0 sm:border-t-2 sm:py-0 sm:pl-0 sm:pt-3 ${step.done ? 'border-brand' : 'border-stroke-default'}`}
              >
                <p className={`text-[13px] ${step.done ? 'font-semibold text-content-primary' : 'font-medium text-content-tertiary'}`}>{step.label}</p>
                <p className="font-mono text-[10.5px] tracking-[0.04em] text-content-tertiary sm:mt-1">{formatStamp(step.at)}</p>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <SectionLabel>What went</SectionLabel>
          <List>
            <Row
              mark={<Tick />}
              title={songCount > 1 ? `${songCount} songs` : '5 items'}
              detail={songCount > 1 ? 'Masters · Cover art · Details · Credits · Rights' : 'Master · Cover art · Details · Credits · Rights'}
            />
          </List>
        </section>
        <Partners sending fan={false} />
      </>
    );
  }

  // ---- Sent back --------------------------------------------------------------
  if (status === 'rejected') {
    const fixes = data.fixes;
    const left = fixes.filter((f) => !f.doneAt).length + data.checklist.blocking.length;
    const rejectedAt = [...(data.submission?.history ?? [])].reverse().find((h) => h.status === 'rejected')?.at;
    return wrap(
      <>
        <div>
          <Hero
            title={`Sent back. ${fixes.length || 1} ${fixes.length === 1 ? 'fix' : 'fixes'}.`}
            meta={`${formatStamp(rejectedAt)} · Fixes are on the plan`}
            chip={chipNode}
          />
          <div className="mt-6">
            <button type="button" disabled={left > 0} onClick={() => setSheet('resend')} className={left > 0 ? OUTLINE : PRIMARY}>
              {left > 0 ? `Resend to TRM · ${left} ${left === 1 ? 'fix' : 'fixes'} left` : 'Resend to TRM'}
            </button>
          </div>
        </div>
        <section>
          <SectionLabel>Fixes</SectionLabel>
          <List>
            {fixes.map((fix) => {
              const run = fixRun(fix.fix);
              return (
                <Row
                  key={fix.id}
                  mark={fix.doneAt ? <Tick /> : <Todo />}
                  title={fix.title}
                  right={
                    fix.doneAt ? (
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-brand">Fixed</span>
                    ) : run ? (
                      <button type="button" onClick={run} className={ROW_PRIMARY}>
                        Fix
                      </button>
                    ) : null
                  }
                >
                  <p className="mt-1 font-mono text-[11.5px] leading-relaxed text-content-secondary">TRM: “{fix.reason}”</p>
                  {fix.owner ? (
                    <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-content-secondary">
                      <Face owner={fix.owner} />
                      {fix.owner.name} · {fix.doneAt ? `done ${formatStamp(fix.doneAt).split(' · ').pop()}` : `due ${formatShortDay(fix.due)}`}
                    </p>
                  ) : null}
                </Row>
              );
            })}
            {data.checklist.blocking.map(blockingRow)}
          </List>
        </section>
        <Partners fan={false} />
      </>
    );
  }

  // ---- Taken down -------------------------------------------------------------
  if (status === 'takedown_requested' || status === 'taken_down') {
    return wrap(
      <>
        <Hero title={status === 'taken_down' ? 'Taken down.' : 'Takedown requested.'} meta="With TRM Distro" chip={chipNode} />
        <Partners fan={false} />
      </>
    );
  }

  // ---- The plan does not cover it (EP / album) ------------------------------------
  if (data.kind !== 'single' && data.storeAccess !== 'allowed') {
    // TRM's rules (2026-11-07): an EP needs a monthly TRM plan, an album a
    // yearly one. The songs can still be filled in; only Send is swapped for
    // the way on. A Pro or Label team paying monthly is one step away (pay
    // yearly); Solo and Manager buy the Distribution add-on for the artist
    // (#1112), or use the artist's own TRM account.
    const album = data.kind === 'album';
    if (data.limit && data.limit.mode !== 'plan') {
      return wrap(
        <>
          <div>
            <Hero
              title={`${album ? 'Albums' : 'EPs'} need distribution for ${data.primaryArtist || 'this artist'}.`}
              meta={album ? '₦25,500 a year. No monthly limit, albums too.' : '₦7,100 a month (7 releases) or ₦25,500 a year.'}
            />
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <Link href="/dashboard?settings=billing" className={PRIMARY}>
                Add distribution
              </Link>
            </div>
            <p className={`mt-3 ${MONO}`}>Or send it from {data.primaryArtist ? `${data.primaryArtist}’s` : 'the artist’s'} own TRM account.</p>
          </div>
          {songsSection}
          <Partners />
        </>
      );
    }
    const payYearly = album && data.teamDistributionPlan === 'monthly';
    const tier = data.teamTier === 'label' ? 'label' : 'pro';
    return wrap(
      <>
        <div>
          <Hero
            title={payYearly ? 'Albums need a yearly plan.' : album ? 'Albums need a yearly distribution plan.' : 'EPs need a distribution plan.'}
            meta={
              payYearly
                ? 'You pay monthly, which covers singles and EPs. Pay yearly and albums are included too.'
                : album
                  ? 'Pro and Label include it when you pay yearly.'
                  : 'Pro and Label include it, monthly or yearly.'
            }
          />
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <a href={checkoutPath({ plan: payYearly ? tier : 'pro', period: album ? 'annual' : 'monthly' })} className={PRIMARY}>
              {payYearly ? 'Pay yearly' : album ? 'Move to Pro, yearly' : 'Move to Pro'}
            </a>
          </div>
          <p className={`mt-3 ${MONO}`}>Or send it from {data.primaryArtist ? `${data.primaryArtist}’s` : 'the artist’s'} own TRM account.</p>
        </div>
        {songsSection}
        <Partners />
      </>
    );
  }

  // ---- Needs a TRM account -------------------------------------------------------
  if (status === 'needs_account') {
    // TRM checks the artist account while delivering, after the submit went
    // through (TRM, Oct 19, 2026). Fix the account or the email, then resubmit.
    const blocked = data.checklist.blocking.length > 0;
    return wrap(
      <>
        <div>
          <Hero
            title={`${data.primaryArtist || 'The artist'} needs a TRM account.`}
            meta={TRM_ARTIST_NOT_FOUND_TEXT}
            chip={chipNode}
          />
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <button type="button" onClick={() => void copy(TRM_SIGNUP_URL, 'Sign-up link')} className={PRIMARY}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy sign-up link
            </button>
            <button type="button" disabled={blocked} onClick={() => setSheet('resend')} className={OUTLINE}>
              Resubmit to TRM
            </button>
          </div>
          {noteLine}
        </div>
        <section>
          <SectionLabel>Before it can go</SectionLabel>
          <List>
            <Row
              mark={<Todo />}
              title="TRM account"
              detail={`No TRM artist for ${data.artistEmail ?? 'that email'}`}
              right={
                <button type="button" onClick={() => setSheet('email')} className={QUIET_LINK}>
                  Change email
                </button>
              }
            />
            {data.checklist.blocking.length === 0 ? (
              <Row mark={<Tick />} title="Everything else" detail="Cover art · Details · Credits · Rights" />
            ) : (
              data.checklist.blocking.map(blockingRow)
            )}
          </List>
        </section>
        <Partners trm={false} />
      </>
    );
  }

  // ---- Missing fields ------------------------------------------------------------
  const blocking = data.checklist.blocking;
  if (blocking.length > 0 && releaseDayHasPassed(data.releaseDate)) {
    // Release day has come, so this is history: no "N things before it can
    // go", no Move on a day that is behind us. The rows that were never done
    // stay as a record, without actions.
    const missed = blocking.filter((r) => r.key !== 'release_date');
    return wrap(
      <>
        <Hero title={`Out on ${formatShortDay(data.releaseDate)}.`} meta="Single · All stores" />
        {missed.length > 0 ? (
          <section>
            <SectionLabel>Never finished</SectionLabel>
            <List>
              {missed.map((row) => (
                <Row key={row.key} mark={<Todo />} title={row.title} detail={row.detail} />
              ))}
            </List>
          </section>
        ) : null}
        <Partners sending />
      </>
    );
  }
  if (blocking.length > 0) {
    return wrap(
      <>
        <Hero title={`${blocking.length} ${blocking.length === 1 ? 'thing' : 'things'} before it can go.`} meta={meta} />
        {songsSection}
        {blocking.some((r) => !(showSongs && isSongRow(r))) ? (
        <section>
          <SectionLabel>Blocking</SectionLabel>
          <List>{blocking.filter((r) => !(showSongs && isSongRow(r))).map(blockingRow)}</List>
          {blocking.some((r) => r.key === 'release_date') ? (
            <p className={`mt-3 ${MONO}`}>TRM takes {formatShortDay(data.checklist.earliestDate)} or later</p>
          ) : null}
        </section>
        ) : null}
        <section>
          <SectionLabel>Ready</SectionLabel>
          <List>
            {data.checklist.ready.filter((r) => r.key === 'details' || r.key === 'rights' || r.key === 'cover_art' || r.key === 'credits').map(readyRow)}
            {addSongRow}
          </List>
        </section>
        <Partners sending />
      </>
    );
  }

  // ---- Ready ----------------------------------------------------------------------
  const waitlisted = status === 'waitlisted' && !data.canSend;
  return wrap(
    <>
      <div>
        <Hero title="Ready for stores." meta={meta} />
        <div className="mt-6">
          {waitlisted ? (
            <p className="border border-stroke-default px-4 py-3 text-sm text-content-secondary">
              Sending to TRM opens soon. We’ll tell you the moment it does.
            </p>
          ) : data.canSend && data.limit && !ownPlan && isBlocked(data.limit.verdict) ? (
            <DistributionLimitBlock
              limit={data.limit}
              paying={paying}
              error={payError}
              onPay={() => void payForExtra()}
              onOwnPlan={data.limit.mode === 'plan' ? undefined : () => setOwnPlan(true)}
            />
          ) : (
            <button type="button" disabled={busy} onClick={() => void pressSend()} className={PRIMARY}>
              {data.submission?.hasDraft && status === 'draft' ? 'Finish sending to TRM' : 'Send to TRM'}
            </button>
          )}
          {noteLine}
          {data.submission?.error && data.canSend ? (
            <p className="mt-3 font-mono text-[11.5px] text-status-error">{data.submission.error}</p>
          ) : null}
        </div>
      </div>
      {songsSection}
      <section>
        <SectionLabel>What goes</SectionLabel>
        <List>
          {data.checklist.ready.map(readyRow)}
          {addSongRow}
          <Row
            mark={<Ring />}
            title={songCount > 1 ? 'Masters' : 'Master'}
            dim={false}
            detail={
              <span className="text-content-tertiary">
                {songCount > 1 ? 'Added at send · one WAV per song · up to 150 MB each' : 'Added at send · WAV ≤ 150 MB'}
              </span>
            }
          />
        </List>
      </section>
      <Partners />
    </>
  );
}

// ---------------------------------------------------------------------------

const FIELD = 'h-[46px] w-full border border-stroke-control bg-transparent px-3.5 text-[15px] text-content-primary focus:border-content-secondary focus:outline-none';

function SettingsSheet({ settings, post, onClose, onSaved }: { settings: TrmSettings; post: TrmPost; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<TrmSettings>(settings);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TrmSettings>(key: K, value: TrmSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async () => {
    setSaving(true);
    const result = await post('settings', { settings: draft });
    setSaving(false);
    if (!result.ok) return setError(String(result.data.error || 'Could not save.'));
    onSaved();
    onClose();
  };
  const select = (label: string, value: string, options: readonly string[], onChange: (v: string) => void) => (
    <label className="block">
      <span className={`mb-1.5 block ${MONO}`}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD} bg-bg-elevated`}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <TrmShell label="Rights & policies" onClose={onClose} locked={false}>
      <h3 className="pr-8 font-display text-[26px] leading-tight tracking-[-0.02em] text-content-primary">Rights & policies</h3>
      <p className={`mt-2 ${MONO}`}>You own the recording · Worldwide</p>
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className={`mb-1.5 block ${MONO}`}>Label</span>
          <input value={draft.label ?? ''} placeholder="Independent" onChange={(e) => set('label', e.target.value.trim() ? e.target.value : null)} className={FIELD} />
        </label>
        <label className="block">
          <span className={`mb-1.5 block ${MONO}`}>Country of recording</span>
          <input value={draft.countryOfRecording} onChange={(e) => set('countryOfRecording', e.target.value)} className={FIELD} />
        </label>
        {select('YouTube', draft.youtubePolicy, TRM_POLICIES, (v) => set('youtubePolicy', v as TrmSettings['youtubePolicy']))}
        {select('Facebook & Instagram', draft.facebookPolicy, TRM_POLICIES, (v) => set('facebookPolicy', v as TrmSettings['facebookPolicy']))}
        {select('SoundExchange', draft.soundexchangePolicy, SOUNDEXCHANGE_POLICIES, (v) => set('soundexchangePolicy', v))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={saving || !draft.countryOfRecording.trim()} onClick={() => void save()} className={PRIMARY}>
          Save
        </button>
        <button type="button" onClick={() => setDraft({ ...DEFAULT_TRM_SETTINGS })} className={OUTLINE}>
          Use defaults
        </button>
      </div>
    </TrmShell>
  );
}

function EmailSheet({ email, post, onClose, onSaved }: { email: string | null; post: TrmPost; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(email ?? '');
  const [error, setError] = useState('');
  const save = async () => {
    const result = await post('settings', { artistEmail: value.trim() });
    if (!result.ok) return setError(String(result.data.error || 'Could not save.'));
    onSaved();
    onClose();
  };
  return (
    <TrmShell label="Artist’s TRM email" onClose={onClose} locked={false}>
      <h3 className="pr-8 font-display text-[26px] leading-tight tracking-[-0.02em] text-content-primary">Artist’s TRM email</h3>
      <p className={`mt-2 ${MONO}`}>The email on their TRM account</p>
      <input type="email" value={value} onChange={(e) => setValue(e.target.value)} className={`mt-5 ${FIELD}`} placeholder="name@email.com" />
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={() => void save()} className={`mt-5 ${PRIMARY}`}>
        Save
      </button>
    </TrmShell>
  );
}

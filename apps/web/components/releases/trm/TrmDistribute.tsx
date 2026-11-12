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
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { CoverArtSection } from '@/components/releases/CoverArtSection';
import { MetadataSection } from '@/components/releases/MetadataSection';
import { useSceneData } from '@/components/releases/useSceneData';
import type { MetadataFixField } from '@/lib/distribution-fix';
import { distributeChecklist, leftHeading, leftReason, readyLine, type DistributeRow } from '@/lib/trm/distribute-checklist';
import {
  DESK_ROW_BUTTON,
  DESK_ROW_LINK,
  DESK_SEND_BUTTON,
  DESK_SEND_OUTLINE,
  DeskCard,
  DeskColumns,
  DeskEditor,
  DeskHeading,
  DeskIssue,
  DeskItem,
  DeskPartner,
  DeskProgress,
  DeskSendCard,
  DistributeDeskSkeleton,
} from './TrmDesk';

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

/** The rows that open an editor inside the desktop checklist (#1210). */
export type DistributeEditorRow = 'cover_art' | 'details' | 'credits';
export type DistributeOpenRow = { row: DistributeEditorRow; field: MetadataFixField | null };

type Props = {
  releaseId: string;
  onOpenDetails?: () => void;
  onChangeArtist?: () => void;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** Desktop: open this row's editor on arrival (an old Cover art or Release
   *  details link lands here, #1210). */
  initialOpen?: DistributeOpenRow | null;
  /** Desktop: called when that editor closes, so the URL can say Distribute. */
  onEditorClosed?: () => void;
};

export function TrmDistribute({ releaseId, onOpenDetails, onChangeArtist, onToast, initialOpen = null, onEditorClosed }: Props) {
  const { data, loadError, reload, post } = useTrm(releaseId);
  // One layout mounts, never both: the desktop page opens editors inline, and
  // those fetch (see useIsDesktopViewport).
  const desktop = useIsDesktopViewport();
  const [editor, setEditor] = useState<DistributeOpenRow | null>(initialOpen);
  const coverScene = useSceneData(releaseId, 'coverart', { enabled: desktop && SCENE_FLAGS.coverArt });
  const coverUrl = coverScene.data?.coverArt?.downloadUrl ?? null;
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
  if (!data && desktop) return <DistributeDeskSkeleton />;
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

  // ---- Desktop (#1210): one page, checklist left, send card right ------------
  if (desktop) {
    const toast = (message: string, tone: 'success' | 'error' | 'warning') => {
      if (onToast) onToast(message, tone);
      else setNote(message);
      // An editor saved or uploaded something: re-read the checklist.
      void reload();
    };
    const closeEditor = () => {
      setEditor(null);
      void reload();
      onEditorClosed?.();
    };
    const toggleEditor = (next: DistributeOpenRow) => (editor?.row === next.row ? closeEditor() : setEditor(next));
    const canOpen: Record<DistributeEditorRow, boolean> = {
      cover_art: SCENE_FLAGS.coverArt,
      details: SCENE_FLAGS.metadata,
      credits: SCENE_FLAGS.metadata,
    };
    // A Fix that lands in the Cover art or Metadata scene on a phone opens the
    // same editor inside its row here.
    const deskFix = (fieldPath: DistributionFieldPath | string | null): (() => void) | null => {
      if (!fieldPath) return null;
      const destination = fixDestinationFor(fieldPath as DistributionFieldPath, availability);
      if (destination?.kind === 'scene' && destination.scene === 'coverart') return () => setEditor({ row: 'cover_art', field: null });
      if (destination?.kind === 'scene' && destination.scene === 'metadata') {
        const field = destination.field;
        return () => setEditor({ row: field === 'credits' || field === 'splits' ? 'credits' : 'details', field });
      }
      return fixRun(fieldPath);
    };
    /** The details-form field a Details issue opens on, if any. */
    const fieldOf = (issue: TrmRowView): MetadataFixField | null => {
      if (!issue.fix || issue.trackId) return null;
      const destination = fixDestinationFor(issue.fix as DistributionFieldPath, availability);
      return destination?.kind === 'scene' && destination.scene === 'metadata' ? destination.field : null;
    };
    const detailsField = (issues: TrmRowView[]): MetadataFixField | null =>
      issues.map(fieldOf).find((field): field is MetadataFixField => Boolean(field)) ?? null;
    const otherIssues = (issues: TrmRowView[]) => issues.filter((issue) => !fieldOf(issue));
    const issueButton = (issue: TrmRowView | undefined) => {
      if (!issue) return null;
      const run = issue.trackId
        ? () => setSongSheet(issue.trackId as string)
        : issue.key === 'songs'
          ? () => void addSong()
          : deskFix(issue.fix);
      return run && issue.action ? (
        <button type="button" onClick={run} className={DESK_ROW_BUTTON}>
          {ACTION_LABEL[issue.action]}
        </button>
      ) : null;
    };
    const editorBody = (key: DistributeEditorRow) => {
      if (editor?.row !== key) return null;
      return (
        <DeskEditor label={key === 'cover_art' ? 'Cover art' : key === 'credits' ? 'Credits' : 'Details'} onDone={closeEditor}>
          {key === 'cover_art' ? (
            <CoverArtSection releaseId={releaseId} onToast={toast} />
          ) : (
            <MetadataSection
              key={`${key}:${editor.field ?? ''}`}
              releaseId={releaseId}
              releaseTitle={data.title}
              focusField={editor.field ?? (key === 'credits' ? 'credits' : null)}
              onToast={toast}
            />
          )}
        </DeskEditor>
      );
    };
    const isEditorRow = (key: string): key is DistributeEditorRow => key === 'cover_art' || key === 'details' || key === 'credits';
    const openButton = (key: DistributeEditorRow, label: string, primary = false) =>
      canOpen[key] ? (
        <button
          type="button"
          aria-expanded={editor?.row === key}
          onClick={() => toggleEditor({ row: key, field: key === 'credits' ? 'credits' : null })}
          className={primary ? DESK_ROW_BUTTON : DESK_ROW_LINK}
        >
          {editor?.row === key ? 'Close' : label}
        </button>
      ) : null;
    const thumbFor = (key: string) =>
      key === 'cover_art' && coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : null;

    const checklist = distributeChecklist({
      blocking: data.checklist.blocking,
      ready: data.checklist.ready,
      masters: data.masters,
      songsListedApart: showSongs,
      explicitPerSong: data.tracks.length > 0,
    });

    /** One checklist row before sending, with its one action. */
    const checkRow = (row: DistributeRow<TrmRowView>) => {
      const owner = row.issues.find((issue) => issue.owner)?.owner ?? null;
      let action: React.ReactNode = null;
      if (row.key === 'cover_art') {
        const label = row.state === 'todo' && row.detail === 'Not added' ? 'Upload' : 'Replace';
        action = openButton('cover_art', label, row.state === 'todo');
      } else if (row.key === 'details') {
        // Genre, language and explicit are fixed in the details form, so the
        // row's one Fix opens it on the first of them. The release day, the
        // title, the artist and a song have fixes of their own (a sheet, a
        // dialog), so they keep a line each under the row.
        const field = detailsField(row.issues);
        if (row.state === 'todo' && field && canOpen.details) {
          action = (
            <button
              type="button"
              aria-expanded={editor?.row === 'details'}
              onClick={() => (editor?.row === 'details' ? closeEditor() : setEditor({ row: 'details', field }))}
              className={DESK_ROW_BUTTON}
            >
              {editor?.row === 'details' ? 'Close' : 'Fix'}
            </button>
          );
        } else if (row.state === 'todo' && otherIssues(row.issues).length === 1 && row.issues.length === 1) {
          action = issueButton(row.issues[0]);
        } else {
          action = openButton('details', 'Open');
        }
      } else if (row.key === 'credits') {
        action = row.state === 'todo' ? issueButton(row.issues[0]) ?? openButton('credits', 'Fix', true) : openButton('credits', 'Open');
      } else if (row.key === 'rights') {
        action = (
          <button type="button" onClick={() => setSheet('settings')} className={DESK_ROW_LINK}>
            Open
          </button>
        );
      }
      const others = row.key === 'details' && row.state === 'todo' ? otherIssues(row.issues) : [];
      const lines =
        others.length > 0 && !(others.length === 1 && row.issues.length === 1)
          ? others.map((issue) => <DeskIssue key={issue.key} title={issue.title} detail={issue.detail} action={issueButton(issue)} />)
          : null;
      return (
        <DeskItem
          key={row.key}
          row={row}
          thumb={thumbFor(row.key)}
          action={
            owner || action ? (
              <>
                {owner ? <Face owner={owner} /> : null}
                {action}
              </>
            ) : null
          }
        >
          {lines}
          {isEditorRow(row.key) ? editorBody(row.key) : null}
        </DeskItem>
      );
    };

    const checklistCard = (
      <DeskCard label="What goes to the stores">
        {checklist.rows.map(checkRow)}
        {addSongRow ? (
          <li className="flex items-center gap-3.5 border-t border-stroke-default py-3.5">
            <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-stroke-strong text-sm text-content-tertiary">
              +
            </span>
            <p className="min-w-0 flex-1 text-sm text-content-secondary">One song. Add more to make it an EP.</p>
            <button type="button" disabled={songBusy} onClick={() => void addSong()} className={DESK_ROW_LINK}>
              Add a song
            </button>
          </li>
        ) : null}
      </DeskCard>
    );
    const dateNote = data.checklist.blocking.some((r) => r.key === 'release_date') ? (
      <p className="text-sm text-content-secondary">TRM takes {formatShortDay(data.checklist.earliestDate)} or later.</p>
    ) : null;

    /** After sending: the five items, each with View. */
    const whatWent = (
      <DeskCard title="What went" count={songCount > 1 ? `${songCount} songs` : `${checklist.rows.length} items`}>
        {checklist.rows.map((row) => {
          const detail =
            row.key === 'master'
              ? data.submission?.masterFileName ?? (songCount > 1 ? `${songCount} songs` : '')
              : row.key === 'cover_art'
                ? row.detail.replace(/ · Ready for stores$/, '')
                : row.detail;
          return (
            <DeskItem
              key={row.key}
              row={{ title: row.title, state: 'ready', detail }}
              thumb={thumbFor(row.key)}
              action={isEditorRow(row.key) ? openButton(row.key, 'View') : null}
            >
              {isEditorRow(row.key) ? editorBody(row.key) : null}
            </DeskItem>
          );
        })}
      </DeskCard>
    );

    // The states with no checklist (taken down, release day passed) still hold
    // an editor an old link asked for, such as Home's "Type the code yourself".
    const openEditorCard = editor ? (
      <DeskCard title={editor.row === 'cover_art' ? 'Cover art' : editor.row === 'credits' ? 'Credits' : 'Details'}>
        <li className="pt-1 [&>div]:ml-0">{editorBody(editor.row)}</li>
      </DeskCard>
    ) : null;
    const planCard = <DistributionPlanCard plan={plan} limit={data.limit} ownPlan={ownPlan} />;
    const page = (left: React.ReactNode, right: React.ReactNode) => (
      <div className="mt-6">
        <DeskColumns left={left} right={right} />
        {sheets}
      </div>
    );
    const progressSteps = (current: NonNullable<typeof status>) =>
      progressFor(current, data.submission?.history ?? [], data.releaseDate).map((step) => ({
        label: step.label,
        done: step.done,
        at: formatStamp(step.at),
      }));
    const inverseNote = note ? (
      <p role="status" className="mt-3 text-sm text-content-inverse/75">
        {note}
      </p>
    ) : null;

    if (status === 'published') {
      const codes = [
        { label: 'UPC', code: data.submission?.upc ?? null },
        { label: 'ISRC', code: data.submission?.isrc ?? null },
      ].filter((entry): entry is { label: string; code: string } => Boolean(entry.code));
      return page(
        <>
          <div>
            <DeskHeading title="Delivered to stores." sub={`Live ${formatShortDay(data.releaseDate)}. All stores, with TRM Distro.`} chip={chipNode} />
            <DeskProgress steps={progressSteps(status)} />
          </div>
          {codes.length > 0 ? (
            <DeskCard title="From TRM">
              {codes.map(({ label, code }) => (
                <DeskItem
                  key={label}
                  row={{ title: label, state: 'ready', detail: code }}
                  action={
                    <button type="button" className={DESK_ROW_LINK} onClick={() => void copy(code, label)}>
                      <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Copy
                    </button>
                  }
                />
              ))}
            </DeskCard>
          ) : null}
          {noteLine}
          {whatWent}
        </>,
        <>
          <DeskPartner sending={false} />
          {planCard}
        </>
      );
    }

    if (inFlight && status) {
      return page(
        <>
          <div>
            <DeskHeading
              title={heroForInFlight(status, received)}
              sub={received ? 'We’ll tell you the moment it moves. Nothing to do.' : 'Waiting for TRM to receive it. Nothing to do.'}
              chip={chipNode}
            />
            <DeskProgress steps={progressSteps(status)} />
          </div>
          {whatWent}
        </>,
        <>
          <DeskPartner sending />
          {planCard}
        </>
      );
    }

    if (status === 'rejected') {
      const fixes = data.fixes;
      const left = fixes.filter((f) => !f.doneAt).length + checklist.left;
      const rejectedAt = [...(data.submission?.history ?? [])].reverse().find((h) => h.status === 'rejected')?.at;
      return page(
        <>
          <DeskHeading
            title={`Sent back. ${fixes.length || 1} ${fixes.length === 1 ? 'fix' : 'fixes'}.`}
            sub={[formatStamp(rejectedAt), 'The fixes are on the plan.'].filter(Boolean).join(' · ')}
            chip={chipNode}
          />
          {fixes.length > 0 ? (
            <DeskCard title="What TRM asked for">
              {fixes.map((fix) => {
                const run = deskFix(fix.fix);
                return (
                  <DeskItem
                    key={fix.id}
                    row={{ title: fix.title, state: fix.doneAt ? 'ready' : 'todo', detail: `TRM: “${fix.reason}”` }}
                    action={
                      <>
                        {fix.owner ? <Face owner={fix.owner} /> : null}
                        {fix.doneAt ? (
                          <span className="text-[13px] font-semibold text-brand">Fixed</span>
                        ) : run ? (
                          <button type="button" onClick={run} className={DESK_ROW_BUTTON}>
                            Fix
                          </button>
                        ) : null}
                      </>
                    }
                  />
                );
              })}
            </DeskCard>
          ) : null}
          {songsSection}
          {checklistCard}
        </>,
        <>
          <DeskSendCard
            title={left > 0 ? `${left} ${left === 1 ? 'fix' : 'fixes'} left` : 'Ready to resend'}
            reason={left > 0 ? 'Finish the fixes and you can send it back to TRM.' : 'Everything TRM asked for is done.'}
          >
            <button type="button" disabled={left > 0} onClick={() => setSheet('resend')} className={DESK_SEND_BUTTON}>
              Resend to TRM
            </button>
          </DeskSendCard>
          <DeskPartner sending={false} />
          {planCard}
        </>
      );
    }

    if (status === 'takedown_requested' || status === 'taken_down') {
      return page(
        <>
          <DeskHeading title={status === 'taken_down' ? 'Taken down.' : 'Takedown requested.'} sub="With TRM Distro." chip={chipNode} />
          {openEditorCard}
        </>,
        <>
          <DeskPartner sending={false} />
          {planCard}
        </>
      );
    }

    const ownAccountLine = (
      <p className="mt-3 text-sm text-content-inverse/75">
        Or send it from {data.primaryArtist ? `${data.primaryArtist}’s` : 'the artist’s'} own TRM account.
      </p>
    );
    const readyHeading = <DeskHeading title="Get it ready for stores" sub={readyLine(checklist)} />;

    if (data.kind !== 'single' && data.storeAccess !== 'allowed') {
      // TRM's rules (2026-11-07), as on the phone: an EP needs a monthly TRM
      // plan, an album a yearly one. Send is swapped for the way on.
      const album = data.kind === 'album';
      let card: React.ReactNode;
      if (data.limit && data.limit.mode !== 'plan') {
        card = (
          <DeskSendCard
            title={`${album ? 'Albums' : 'EPs'} need distribution for ${data.primaryArtist || 'this artist'}`}
            reason={album ? '₦25,500 a year. No monthly limit, albums too.' : '₦7,100 a month (7 releases) or ₦25,500 a year.'}
          >
            <Link href="/dashboard?settings=billing" className={DESK_SEND_BUTTON}>
              Add distribution
            </Link>
            {ownAccountLine}
          </DeskSendCard>
        );
      } else {
        const payYearly = album && data.teamDistributionPlan === 'monthly';
        const tier = data.teamTier === 'label' ? 'label' : 'pro';
        card = (
          <DeskSendCard
            title={payYearly ? 'Albums need a yearly plan' : album ? 'Albums need a yearly distribution plan' : 'EPs need a distribution plan'}
            reason={
              payYearly
                ? 'You pay monthly, which covers singles and EPs. Pay yearly and albums are included too.'
                : album
                  ? 'Solo Plus, Pro Plus and Label include it when you pay yearly.'
                  : 'Solo Plus, Pro Plus and Label include it, monthly or yearly.'
            }
          >
            <a href={checkoutPath({ plan: payYearly ? tier : 'pro', period: album ? 'annual' : 'monthly' })} className={DESK_SEND_BUTTON}>
              {payYearly ? 'Pay yearly' : album ? 'Move to Pro Plus, yearly' : 'Move to Pro Plus'}
            </a>
            {ownAccountLine}
          </DeskSendCard>
        );
      }
      return page(
        <>
          {readyHeading}
          {songsSection}
          {checklistCard}
          {dateNote}
        </>,
        <>
          {card}
          {planCard}
          <Partners />
        </>
      );
    }

    if (status === 'needs_account') {
      // TRM checks the artist account while delivering, after the submit went
      // through (TRM, Oct 19, 2026). Fix the account or the email, then resubmit.
      return page(
        <>
          <DeskHeading title={`${data.primaryArtist || 'The artist'} needs a TRM account.`} sub={TRM_ARTIST_NOT_FOUND_TEXT} chip={chipNode} />
          <DeskCard label="Before it can go">
            <DeskItem
              row={{ title: 'TRM account', state: 'todo', detail: `No TRM artist for ${data.artistEmail ?? 'that email'}` }}
              action={
                <button type="button" onClick={() => setSheet('email')} className={DESK_ROW_LINK}>
                  Change email
                </button>
              }
            />
            {checklist.rows.map(checkRow)}
          </DeskCard>
        </>,
        <>
          <DeskSendCard title="Then send it again" reason="Once the artist has a TRM account with this email, resubmit.">
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => void copy(TRM_SIGNUP_URL, 'Sign-up link')} className={DESK_SEND_BUTTON}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy sign-up link
              </button>
              <button type="button" disabled={checklist.left > 0} onClick={() => setSheet('resend')} className={DESK_SEND_OUTLINE}>
                Resubmit to TRM
              </button>
            </div>
            {inverseNote}
          </DeskSendCard>
          <DeskPartner sending={false} />
          {planCard}
        </>
      );
    }

    if (data.checklist.blocking.length > 0 && releaseDayHasPassed(data.releaseDate)) {
      // Release day has come, so this is history: the rows never done stay as
      // a record, without actions.
      const missed = data.checklist.blocking.filter((r) => r.key !== 'release_date');
      return page(
        <>
          <DeskHeading title={`Out on ${formatShortDay(data.releaseDate)}.`} sub="Release day has passed, so this is the record of it." />
          {missed.length > 0 ? (
            <DeskCard title="Never finished">
              {missed.map((row) => (
                <DeskItem key={row.key} row={{ title: row.title, state: 'todo', detail: row.detail }} />
              ))}
            </DeskCard>
          ) : null}
          {openEditorCard}
        </>,
        <>
          <Partners sending />
          {planCard}
        </>
      );
    }

    // Before sending: what is still to do, or ready.
    const waitlisted = status === 'waitlisted' && !data.canSend;
    const limitBlocked = checklist.left === 0 && data.canSend && !!data.limit && !ownPlan && isBlocked(data.limit.verdict);
    const sendLabel = data.submission?.hasDraft && status === 'draft' ? 'Finish sending to stores' : 'Send to stores';
    return page(
      <>
        {readyHeading}
        {songsSection}
        {checklistCard}
        {dateNote}
      </>,
      <>
        <DeskSendCard
          title={leftHeading(checklist.left)}
          reason={waitlisted ? 'Sending to the stores opens soon. We’ll tell you the moment it does.' : leftReason(checklist, data.title)}
        >
          {waitlisted || limitBlocked ? null : (
            <button type="button" disabled={busy || checklist.left > 0} onClick={() => void pressSend()} className={DESK_SEND_BUTTON}>
              {sendLabel}
            </button>
          )}
          {inverseNote}
          {data.submission?.error && data.canSend ? <p className="mt-3 text-sm text-content-inverse">{data.submission.error}</p> : null}
        </DeskSendCard>
        {limitBlocked && data.limit ? (
          <DistributionLimitBlock
            limit={data.limit}
            paying={paying}
            error={payError}
            onPay={() => void payForExtra()}
            onOwnPlan={data.limit.mode === 'plan' ? undefined : () => setOwnPlan(true)}
          />
        ) : null}
        {planCard}
        <Partners sending />
      </>
    );
  }

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
                  ? 'Solo Plus, Pro Plus and Label include it when you pay yearly.'
                  : 'Solo Plus, Pro Plus and Label include it, monthly or yearly.'
            }
          />
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <a href={checkoutPath({ plan: payYearly ? tier : 'pro', period: album ? 'annual' : 'monthly' })} className={PRIMARY}>
              {payYearly ? 'Pay yearly' : album ? 'Move to Pro Plus, yearly' : 'Move to Pro Plus'}
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

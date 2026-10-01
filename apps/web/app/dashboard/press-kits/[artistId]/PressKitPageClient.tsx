'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  History,
  Loader2,
  Newspaper,
  RotateCcw,
  Sparkles,
} from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { usePressKitsStore } from '@/stores/usePressKitsStore';
import {
  readCachedKitDetail,
  writeCachedKitDetail,
} from '@/lib/press-kit-detail-cache';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import { usePressKitSection } from '@/components/press-kits/usePressKitSection';
import { SectionEditor } from '@/components/press-kits/SectionEditor';
import { PRESS_KIT_SECTION_LABELS, deriveSectionStatus } from '@/lib/press-kits';
import { countInterviewGaps } from '@/lib/press-kit-interview';
import type { AutofillSummary as AutofillCounts } from '@/lib/press-kit-autofill';
import { AutofillSummary } from '@/components/press-kits/AutofillSummary';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { SectionDraftCard } from '@/components/press-kits/SectionDraftCard';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { applyRunAction, discardRunAction } from '@/lib/urgans-actions/client';
import { isDraftableSection } from '@/lib/press-kit-draft';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedEstimateLine } from '@/lib/credits/copy';
import { supabase } from '@/lib/supabase/client';
import { PressKitInterviewModal } from '@/components/press-kits/PressKitInterviewModal';
import { PhotoGrid } from '@/components/press-kits/PhotoGrid';
import { PublishPanel } from '@/components/press-kits/PublishPanel';
import { RolloutBanner } from '@/components/press-kits/RolloutBanner';
import type {
  PressKit,
  PressKitAsset,
  PressKitSection,
  PressKitSectionContent,
  PressKitSectionKey,
  PressKitSectionStatus,
  PressKitSectionVersion,
} from '@/types/press-kits';

const PRESS_KITS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';

const STATUS_COPY: Record<PressKitSectionStatus, string> = {
  empty: 'Empty',
  draft: 'Draft',
  ready: 'Ready',
};

const statusChipClass = (status: PressKitSectionStatus): string => {
  if (status === 'ready') return 'bg-brand/10 text-brand';
  if (status === 'draft') return 'bg-bg-elevated text-content-secondary';
  return 'bg-transparent text-content-tertiary';
};

const relative = (iso: string): string => {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

export default function PressKitPageClient() {
  const params = useParams<{ artistId: string }>();
  const artistId = String(params?.artistId || '');
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);

  // Seeded from the shared roster so the heading is right on the first frame,
  // then confirmed by the two loads below. The roster is cache-first, so
  // arriving from the tab this is already known.
  const rosterName = usePressKitsStore(
    (state) => state.entries.find((entry) => entry.artistId === artistId)?.artistName || ''
  );
  // The kit's id, known at first render whenever the roster is already in the
  // store — which is every arrival from the tab. That is what lets the cache
  // read below happen before the first paint. A selector returning a primitive
  // rather than the entry object, so it does not re-render on every store
  // change.
  const rosterKitId = usePressKitsStore(
    (state) => state.entries.find((entry) => entry.artistId === artistId)?.kit?.id || ''
  );
  const loadRoster = usePressKitsStore((state) => state.load);
  const syncKit = usePressKitsStore((state) => state.syncKit);

  const [artistName, setArtistName] = useState('');
  const [kit, setKit] = useState<PressKit | null>(null);
  const [sections, setSections] = useState<PressKitSection[]>([]);
  const [assets, setAssets] = useState<PressKitAsset[]>([]);
  const [activeKey, setActiveKey] = useState<PressKitSection['section']>('header');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only known in the response that created the kit. Absent on every later
  // visit, which the card handles.
  const [autofillCounts, setAutofillCounts] = useState<AutofillCounts | null>(null);
  const [autofillFilled, setAutofillFilled] = useState<PressKitSectionKey[]>([]);
  const [interviewOpen, setInterviewOpen] = useState(false);

  // Whether to OFFER the drafting button. The server answers it, because the
  // client cannot see whether a model is configured, and a button that always
  // refuses is worse than no button.
  const [aiAvailable, setAiAvailable] = useState(false);
  const [draft, setDraft] = useState<{
    actionId: string;
    section: PressKitSectionKey;
    content: PressKitSectionContent;
  } | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [lockedMessage, setLockedMessage] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PressKitSectionVersion[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  // Portalled surfaces mount after hydration; AppShell's lazy-fade transform
  // makes it a containing block for fixed descendants, which is why the sheet
  // cannot simply be a fixed div inside this tree (the DeleteReleaseDialog
  // rule).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Paint the last known kit BEFORE the browser does, so reopening one you were
   * just looking at shows the kit rather than a full page skeleton (founder
   * request, 2026-09-05).
   *
   * PRE-PAINT, and it has to be. The cache is memory only and therefore always
   * empty on the server, so reading it during render would be a hydration
   * mismatch, and reading it in a plain useEffect would paint the skeleton for
   * one frame first — the flash the /onboarding saved-draft restore moved to
   * this same hook to avoid.
   *
   * The fetch in `load` below still runs every time. This is a first paint, not
   * a substitute for server truth: when the two disagree the sections state is
   * replaced, and usePressKitSection's adopt branch moves the open draft with
   * it if nothing is unsaved.
   */
  useIsomorphicLayoutEffect(() => {
    if (!PRESS_KITS_ENABLED || !rosterKitId) return;
    const cached = readCachedKitDetail(rosterKitId);
    if (!cached) return;
    setKit(cached.kit);
    setArtistName(cached.artistName);
    setSections(cached.sections);
    setAssets(cached.assets);
    setAiAvailable(cached.aiAvailable);
    setIsLoading(false);
  }, [rosterKitId]);

  /**
   * Photos are their own table, so the Assets row's stored status was decided
   * when the kit was created and never moves. Recomputing it here from the
   * count keeps the rail's chip honest the moment a photo lands, through the
   * SAME definition the server writes with rather than a second one.
   */
  const statusFor = useCallback(
    (section: PressKitSection): PressKitSectionStatus =>
      section.section === 'assets'
        ? deriveSectionStatus('assets', section.content, { photoCount: assets.length })
        : section.status,
    [assets.length]
  );

  const active = useMemo(
    () => sections.find((section) => section.section === activeKey) || null,
    [sections, activeKey]
  );

  const loadDetail = useCallback(async (kitId: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch(`/api/press-kits/${kitId}`, { headers, cache: 'no-store' });
    if (!response.ok) {
      setError(await readError(response, 'Could not load this press kit.'));
      return;
    }
    const body = await response.json();
    setKit(body.kit || null);
    setArtistName(String(body.kit?.artistName || ''));
    setSections(Array.isArray(body.sections) ? body.sections : []);
    setAssets(Array.isArray(body.assets) ? body.assets : []);
    setAiAvailable(body.aiAvailable === true);
    // Keep the tab in step without a second round trip: a kit created or
    // published here shows its new state the moment you go back.
    if (body.kit) syncKit(body.kit);
  }, [syncKit]);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The roster comes from the shared store, which is cache-first and
      // recency-guarded. This used to fetch the WHOLE roster over the network
      // before it could even learn which kit to open — two round trips in a
      // waterfall on every visit, for a mapping the tab you just came from
      // already had.
      await loadRoster();

      // Read the store fresh rather than the subscribed value above: that one
      // is from this callback's render closure and is stale the instant the
      // load resolves.
      const entry = usePressKitsStore
        .getState()
        .entries.find((candidate) => candidate.artistId === artistId);

      if (!entry) {
        setError('That artist is not on your roster.');
        return;
      }
      setArtistName(entry.artistName || '');
      if (entry.kit) {
        await loadDetail(entry.kit.id);
      }
    } catch {
      setError('Could not load this press kit. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [artistId, loadDetail, loadRoster]);

  useEffect(() => {
    if (!PRESS_KITS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void load();
  }, [load, router]);

  /**
   * Keep the memory cache in step with what is on screen.
   *
   * Writing it HERE rather than inside loadDetail is what covers the three
   * mutations that update `sections` locally and never re-fetch — the section
   * autosave, a keyed save, and restoring a version. Cached at the fetch
   * instead, reopening the kit would paint the pre-edit body and then visibly
   * correct itself a moment later.
   *
   * `sections` is safe to cache because every one of those paths stores the
   * SERVER's own returned row, not a local guess — the rail's chips depend on
   * that already. The in-progress draft lives in usePressKitSection and is
   * deliberately not part of this.
   */
  useEffect(() => {
    if (isLoading || !kit) return;
    writeCachedKitDetail(kit.id, { kit, artistName, sections, assets, aiAvailable });
  }, [isLoading, kit, artistName, sections, assets, aiAvailable]);

  const createKit = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/press-kits', {
        method: 'POST',
        headers,
        body: JSON.stringify({ artistId }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not start this press kit.'));
        return;
      }
      const body = await response.json();
      if (body.autofill) {
        setAutofillCounts(body.autofill.summary || null);
        setAutofillFilled(
          Array.isArray(body.autofill.filled) ? body.autofill.filled : []
        );
      }
      if (body.kit?.id) await loadDetail(body.kit.id);
    } catch {
      setError('Could not start this press kit. Check your connection and try again.');
    } finally {
      setIsCreating(false);
    }
  }, [artistId, loadDetail]);

  const saveSection = useCallback(
    async (sectionId: string, content: PressKitSectionContent) => {
      if (!kit) throw new Error('no kit');
      const target = sections.find((section) => section.id === sectionId);
      if (!target) throw new Error('no section');
      const headers = await authHeaders();
      if (!headers) throw new Error('no session');

      const response = await fetch(
        `/api/press-kits/${kit.id}/sections/${target.section}`,
        { method: 'PATCH', headers, body: JSON.stringify({ content }) }
      );
      if (!response.ok) throw new Error(await readError(response, 'Could not save.'));

      const body = await response.json();
      if (body.section) {
        // The server recomputes status, so take its row rather than guessing
        // here: the rail's chips have to agree with what was actually stored.
        setSections((current) =>
          current.map((section) => (section.id === body.section.id ? body.section : section))
        );
      }
    },
    [kit, sections]
  );

  const saveSectionByKey = useCallback(
    async (key: PressKitSection['section'], content: PressKitSectionContent) => {
      if (!kit) throw new Error('no kit');
      const headers = await authHeaders();
      if (!headers) throw new Error('no session');

      const response = await fetch(`/api/press-kits/${kit.id}/sections/${key}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not save.'));

      const body = await response.json();
      if (body.section) {
        setSections((current) =>
          current.map((section) => (section.id === body.section.id ? body.section : section))
        );
      }
    },
    [kit]
  );

  const accessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  }, []);

  const runDraft = useCallback(
    async (sectionKey: PressKitSectionKey, notes: string) => {
      if (!kit) return;
      const headers = await authHeaders();
      if (!headers) return;
      setDraftBusy(true);
      setDraftError('');
      try {
        const response = await fetch('/api/urgans/actions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            actionType: 'presskit.draft_section',
            objectId: kit.id,
            input: { section: sectionKey, notes },
          }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          // A team below the plan this needs gets the sheet, carrying the
          // server's own sentence: it names the action and the real minimum
          // plan, so it cannot go stale against a re-cut tier.
          if (body?.reason === 'plan_required') {
            setLockedMessage(String(body.error || ''));
            return;
          }
          setDraftError(String(body?.error || 'UrgAns could not write that just now.'));
          return;
        }

        setDraft({
          actionId: String(body.actionId || ''),
          section: sectionKey,
          content: (body.output?.content || {}) as PressKitSectionContent,
        });
      } catch {
        setDraftError('Could not reach UrgAns. Check your connection and try again.');
      } finally {
        setDraftBusy(false);
      }
    },
    [kit]
  );

  const acceptDraft = useCallback(async () => {
    if (!draft || !kit) return;
    setDraftBusy(true);
    setDraftError('');
    const result = await applyRunAction(draft.actionId, await accessToken());
    setDraftBusy(false);
    if (!result.ok) {
      setDraftError(result.error);
      return;
    }
    setDraft(null);
    await loadDetail(kit.id);
  }, [draft, kit, accessToken, loadDetail]);

  const discardDraft = useCallback(async () => {
    if (!draft) return;
    const current = draft;
    setDraft(null);
    setDraftError('');
    // Fire and forget: the row is bookkeeping and nothing was written, so a
    // failed discard costs a stale log line rather than the person's time.
    void discardRunAction(current.actionId, await accessToken());
  }, [draft, accessToken]);

  const retryDraft = useCallback(
    async (notes: string) => {
      if (!draft) return;
      const sectionKey = draft.section;
      await discardDraft();
      await runDraft(sectionKey, notes);
    },
    [draft, discardDraft, runDraft]
  );

  const autosave = usePressKitSection({
    sectionId: active?.id || null,
    persistedContent: active?.content || {},
    onSave: saveSection,
  });

  const openHistory = useCallback(async () => {
    if (!kit || !active) return;
    setHistoryOpen(true);
    setHistoryBusy(true);
    setVersions([]);
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(
        `/api/press-kits/${kit.id}/sections/${active.section}/versions`,
        { headers, cache: 'no-store' }
      );
      if (response.ok) {
        const body = await response.json();
        setVersions(Array.isArray(body.versions) ? body.versions : []);
      }
    } catch {
      /* the panel shows an empty history rather than an error over an error */
    } finally {
      setHistoryBusy(false);
    }
  }, [kit, active]);

  const restore = useCallback(
    async (versionId: string) => {
      if (!kit || !active) return;
      const headers = await authHeaders();
      if (!headers) return;
      setHistoryBusy(true);
      try {
        const response = await fetch(
          `/api/press-kits/${kit.id}/sections/${active.section}/versions`,
          { method: 'POST', headers, body: JSON.stringify({ versionId }) }
        );
        if (response.ok) {
          const body = await response.json();
          if (body.section) {
            setSections((current) =>
              current.map((section) =>
                section.id === body.section.id ? body.section : section
              )
            );
          }
          setHistoryOpen(false);
        }
      } finally {
        setHistoryBusy(false);
      }
    },
    [kit, active]
  );

  if (!PRESS_KITS_ENABLED) return null;

  const loading = authLoading || isLoading;

  const savedLabel =
    autosave.saveState === 'dirty' || autosave.saveState === 'saving' ? (
      <>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Saving…
      </>
    ) : autosave.saveState === 'saved' ? (
      <>
        <Check className="h-3 w-3 text-brand" aria-hidden />
        Saved
      </>
    ) : autosave.saveState === 'error' ? (
      <span role="alert" className="text-status-error">Could not save</span>
    ) : active ? (
      <>Edited {relative(active.updatedAt)}</>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/dashboard/press-kits"
        className="motion-focus mb-4 inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All press kits
      </Link>

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
      ) : !kit ? (
        <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
          <Newspaper className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">
            {artistName || rosterName
              ? `${artistName || rosterName} has no press kit yet`
              : 'No press kit yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-content-secondary">
            One kit, one link, kept current. Start it now and fill it in as you go.
          </p>
          <button
            type="button"
            onClick={() => void createKit()}
            disabled={isCreating}
            className="motion-focus mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Start the press kit
          </button>
        </div>
      ) : (
        <>
          <header className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              Press kit
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">
              {artistName || rosterName}
            </h1>
          </header>

          <RolloutBanner kitId={kit.id} onAccepted={() => loadDetail(kit.id)} />

          <PublishPanel kit={kit} sections={sections} onKitChange={setKit} />

          <AutofillSummary
            counts={autofillCounts}
            filled={autofillFilled}
            gapCount={countInterviewGaps(sections)}
            onStart={() => setInterviewOpen(true)}
          />

          <div className="lg:flex lg:gap-8">
            {/* The rail: every section, and how far along each one is. */}
            <nav className="hidden w-52 shrink-0 lg:block" aria-label="Press kit sections">
              <ul className="space-y-0.5">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveKey(section.section);
                        void discardDraft();
                      }}
                      aria-current={section.section === activeKey ? 'true' : undefined}
                      className={`motion-focus flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        section.section === activeKey
                          ? 'bg-brand/10 text-brand'
                          : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                      }`}
                    >
                      <span className="truncate">
                        {PRESS_KIT_SECTION_LABELS[section.section]}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${statusChipClass(
                          statusFor(section)
                        )}`}
                      >
                        {STATUS_COPY[statusFor(section)]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-0 flex-1">
              {/* Below lg the rail folds into a sheet, so one section fills the
                  screen at a time. */}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="motion-focus mb-4 flex w-full items-center justify-between gap-2 rounded-lg border border-stroke-default bg-bg-surface px-3 py-2.5 text-left lg:hidden"
              >
                <span className="text-sm font-semibold text-content-primary">
                  {active ? PRESS_KIT_SECTION_LABELS[active.section] : 'Sections'}
                </span>
                <span className="flex items-center gap-2">
                  {active ? (
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${statusChipClass(
                        statusFor(active)
                      )}`}
                    >
                      {STATUS_COPY[statusFor(active)]}
                    </span>
                  ) : null}
                  <ChevronDown className="h-4 w-4 text-content-tertiary" aria-hidden />
                </span>
              </button>

              {active ? (
                <section className="rounded-xl border border-stroke-default bg-bg-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-content-primary">
                      {PRESS_KIT_SECTION_LABELS[active.section]}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-content-tertiary">
                        {savedLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openHistory()}
                        aria-label="Change history"
                        title="Change history"
                        className="motion-focus grid h-8 w-8 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
                      >
                        <History className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {draft && draft.section === active.section ? (
                    <SectionDraftCard
                      section={draft.section}
                      content={draft.content}
                      isBusy={draftBusy}
                      error={draftError}
                      onAccept={() => void acceptDraft()}
                      onRetry={(notes) => void retryDraft(notes)}
                      onDiscard={() => void discardDraft()}
                    />
                  ) : aiAvailable && isDraftableSection(active.section) ? (
                    <div className="mb-5">
                      <button
                        type="button"
                        onClick={() => void runDraft(active.section, '')}
                        disabled={draftBusy}
                        className="motion-focus inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand disabled:opacity-60"
                      >
                        {draftBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Sparkles className="h-4 w-4" aria-hidden />
                        )}
                        {draftBusy ? 'UrgAns is writing' : 'Ask UrgAns to write this'}
                      </button>
                      {isCreditsEnabled() ? (
                        <p className="mt-2 text-xs text-content-tertiary">{embeddedEstimateLine('presskit.draft_section')}</p>
                      ) : null}
                      {draftError ? (
                        <p role="alert" className="mt-2 text-sm text-status-error">{draftError}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <SectionEditor
                    section={active.section}
                    draft={autosave.draft}
                    readOnly={false}
                    setField={autosave.setField}
                    onBlur={autosave.flush}
                    photos={
                      kit ? (
                        <PhotoGrid
                          kitId={kit.id}
                          assets={assets}
                          onAssetsChange={setAssets}
                        />
                      ) : null
                    }
                  />
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}

      <UrgansLockedSheet
        open={Boolean(lockedMessage)}
        message={lockedMessage}
        actionType="presskit.draft_section"
        onClose={() => setLockedMessage('')}
      />

      {interviewOpen ? (
        <PressKitInterviewModal
          sections={sections}
          onSave={saveSectionByKey}
          onClose={() => setInterviewOpen(false)}
        />
      ) : null}

      {mounted && sheetOpen
        ? createPortal(
            <div className="fixed inset-0 z-[170] lg:hidden">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSheetOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <DialogPanel
                label="Press kit sections"
                onClose={() => setSheetOpen(false)}
                className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-stroke-default bg-bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              >
                <ul className="space-y-0.5">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveKey(section.section);
                          setSheetOpen(false);
                        }}
                        className="motion-focus flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm text-content-primary hover:bg-bg-hover"
                      >
                        <span>{PRESS_KIT_SECTION_LABELS[section.section]}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${statusChipClass(
                            statusFor(section)
                          )}`}
                        >
                          {STATUS_COPY[statusFor(section)]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </DialogPanel>
            </div>,
            document.body
          )
        : null}

      {mounted && historyOpen
        ? createPortal(
            <div className="fixed inset-0 z-[170] grid place-items-center p-4">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setHistoryOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <DialogPanel
                label="What this said before"
                onClose={() => setHistoryOpen(false)}
                className="relative w-full max-w-md rounded-xl border border-stroke-default bg-bg-surface p-4"
              >
                <h3 className="font-display text-base font-semibold text-content-primary">
                  What this said before
                </h3>
                <p className="mt-1 text-sm text-content-secondary">
                  The last thirty days. Putting one back can itself be undone.
                </p>

                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                  {historyBusy ? (
                    <p className="text-sm text-content-tertiary">Loading…</p>
                  ) : versions.length === 0 ? (
                    <p className="text-sm text-content-tertiary">
                      Nothing yet. Versions appear here once you have edited this section.
                    </p>
                  ) : (
                    versions.map((version) => (
                      <div
                        key={version.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-stroke-default bg-bg-base px-3 py-2"
                      >
                        <span className="font-mono text-xs text-content-secondary">
                          {relative(version.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void restore(version.id)}
                          disabled={historyBusy}
                          className="motion-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          Put this back
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="motion-focus mt-4 w-full rounded-lg border border-stroke-default px-3 py-2 text-sm text-content-secondary hover:text-content-primary"
                >
                  Close
                </button>
              </DialogPanel>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

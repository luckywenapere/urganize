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
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import { usePressKitSection } from '@/components/press-kits/usePressKitSection';
import { SectionEditor } from '@/components/press-kits/SectionEditor';
import { PRESS_KIT_SECTION_LABELS } from '@/lib/press-kits';
import type {
  PressKit,
  PressKitSection,
  PressKitSectionContent,
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

  const [artistName, setArtistName] = useState('');
  const [kit, setKit] = useState<PressKit | null>(null);
  const [sections, setSections] = useState<PressKitSection[]>([]);
  const [activeKey, setActiveKey] = useState<PressKitSection['section']>('header');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    setError(null);
    try {
      const response = await fetch('/api/press-kits', { headers, cache: 'no-store' });
      if (!response.ok) {
        setError(await readError(response, 'Could not load this press kit.'));
        return;
      }
      const body = await response.json();
      const entry = (body.entries || []).find(
        (candidate: { artistId: string }) => candidate.artistId === artistId
      );
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
  }, [artistId, loadDetail]);

  useEffect(() => {
    if (!PRESS_KITS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void load();
  }, [load, router]);

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
      <span className="text-status-error">Could not save</span>
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
        <div className="mb-4 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
      ) : !kit ? (
        <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
          <Newspaper className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">
            {artistName ? `${artistName} has no press kit yet` : 'No press kit yet'}
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
              {artistName}
            </h1>
            <p className="mt-1 font-mono text-xs text-content-secondary">
              urganize.app/k/{kit.slug}
            </p>
          </header>

          <div className="lg:flex lg:gap-8">
            {/* The rail: every section, and how far along each one is. */}
            <nav className="hidden w-52 shrink-0 lg:block" aria-label="Press kit sections">
              <ul className="space-y-0.5">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => setActiveKey(section.section)}
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
                          section.status
                        )}`}
                      >
                        {STATUS_COPY[section.status]}
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
                        active.status
                      )}`}
                    >
                      {STATUS_COPY[active.status]}
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

                  <SectionEditor
                    section={active.section}
                    draft={autosave.draft}
                    readOnly={false}
                    setField={autosave.setField}
                    onBlur={autosave.flush}
                  />
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}

      {mounted && sheetOpen
        ? createPortal(
            <div className="fixed inset-0 z-[170] lg:hidden">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSheetOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-stroke-default bg-bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
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
                            section.status
                          )}`}
                        >
                          {STATUS_COPY[section.status]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
              <div className="relative w-full max-w-md rounded-xl border border-stroke-default bg-bg-surface p-4">
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
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Fraunces, Space_Mono } from 'next/font/google';
import { AlertCircle, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { formatArtistName } from '@/lib/release-execution';
import { supabase } from '@/lib/supabase/client';
import { getClientTodayIso, getPlatformLabel, resolveMonth } from '@/lib/content-calendar';
import {
  SOCIAL_PLATFORM_OPTIONS,
  type ContentCalendar,
  type ContentPost,
  type ContentPostStatus,
  type SocialPlatform,
} from '@/types/content-calendar';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { Toast } from '@/components/shared/Toast';
import { CalendarPageSkeleton } from '@/components/content-calendar/CalendarPageSkeleton';
import { CalendarTabs } from '@/components/content-calendar/CalendarTabs';
import { CalendarOverflowMenu } from '@/components/content-calendar/CalendarOverflowMenu';
import { MonthGrid } from '@/components/content-calendar/MonthGrid';
import { AgendaList } from '@/components/content-calendar/AgendaList';
import { PostModal } from '@/components/content-calendar/PostModal';

// Same NEXT_PUBLIC_ inlining convention as every other flag in the app; the
// API routes 404 on the same flag server-side.
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

// Route-scoped fonts, loaded ONCE here (not duplicated into
// CalendarPageSkeleton) so the font files aren't fetched twice. Fraunces for
// the release title (a large display moment); Space Mono for metadata (day
// numbers, month label, status stamps), both per the Urganize Brand Bible
// (URG 001). next/font/google calls must stay at module scope.
const fraunces = Fraunces({ subsets: ['latin'], weight: '500', variable: '--font-cc-display' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cc-mono' });

// The brand island's colors live in globals.css as the `cc-island` class
// (dark = Bible screen mode, light = Bible paper mode, keyed off the app's
// data-theme; founder decision 2026-07-20 reversing the earlier dark-locked
// call). Components consume the --cc-* vars via Tailwind arbitrary values,
// so the future app-wide Bible restyle stays a variable remap.

type ToastState = { message: string; tone: 'success' | 'error' | 'warning' };

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function formatMonthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(parsed).toUpperCase();
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const shifted = new Date(year, monthIndex - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function CalendarPageClient() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error: releaseError, loadCommandCenter } = useReleaseStore();

  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback((message: string, tone: ToastState['tone']) => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toast.tone === 'warning' ? 6000 : 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Flag-off bounce back to the release page, and the auth guard, combined
  // into one effect (the ChappiPageClient precedent).
  useEffect(() => {
    if (!CONTENT_CALENDAR_ENABLED) {
      router.replace(`/dashboard/releases/${releaseId}`);
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, releaseId, router, user]);

  const release = releases.find((r) => r.id === releaseId);

  useEffect(() => {
    document.title = release?.title ? `${release.title} | Content calendar | Urganize` : 'Content calendar | Urganize';
  }, [release?.title]);

  // --- Calendars list: self-contained fetch, the AssetSection precedent ---
  const [calendars, setCalendars] = useState<ContentCalendar[]>([]);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(true);
  const [calendarsError, setCalendarsError] = useState('');

  const loadCalendars = useCallback(async () => {
    setIsLoadingCalendars(true);
    setCalendarsError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setCalendarsError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/content-calendars`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as { calendars?: ContentCalendar[]; error?: string };
      if (!res.ok) {
        setCalendarsError(data.error || 'Could not load calendars.');
        return;
      }
      setCalendars(Array.isArray(data.calendars) ? data.calendars : []);
    } catch (err) {
      setCalendarsError(err instanceof Error ? err.message : 'Could not load calendars.');
    } finally {
      setIsLoadingCalendars(false);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!CONTENT_CALENDAR_ENABLED || authLoading || !user) return;
    void loadCalendars();
  }, [authLoading, loadCalendars, user]);

  // --- Active calendar resolution ---
  const calendarParam = searchParams.get('calendar');

  const activeCalendarId = useMemo(() => {
    if (calendarParam && calendars.some((c) => c.id === calendarParam)) {
      return calendarParam;
    }
    return calendars[0]?.id ?? null;
  }, [calendarParam, calendars]);

  const activeCalendar = calendars.find((c) => c.id === activeCalendarId) ?? null;

  // Quiet, once-per-stale-value toast when the URL named a calendar that no
  // longer exists (and there's at least one other calendar to fall back to;
  // zero calendars renders the empty state instead, no toast needed).
  const staleToastShownForRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoadingCalendars || calendarsError) return;
    if (!calendarParam || calendars.length === 0) return;
    if (calendars.some((c) => c.id === calendarParam)) return;
    if (staleToastShownForRef.current === calendarParam) return;
    staleToastShownForRef.current = calendarParam;
    showToast('That calendar no longer exists.', 'warning');
  }, [calendarParam, calendars, calendarsError, isLoadingCalendars, showToast]);

  const setCalendarParam = useCallback(
    (calendarId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('calendar', calendarId);
      router.replace(`/dashboard/releases/${releaseId}/calendar?${params.toString()}`, { scroll: false });
    },
    [releaseId, router, searchParams]
  );

  const handleCalendarCreated = useCallback(
    (calendar: ContentCalendar) => {
      setCalendars((current) => [...current, calendar]);
      // Journey continuity: land straight on the new calendar's empty state
      // instead of leaving the user on whatever they were viewing before.
      router.push(`/dashboard/releases/${releaseId}/calendar?calendar=${calendar.id}`);
    },
    [releaseId, router]
  );

  const handleCalendarRenamed = useCallback((calendar: ContentCalendar) => {
    // The rename response's postCount always comes back 0 (the PATCH route
    // doesn't recompute it), so keep the locally-known count instead of
    // trusting the response for that one field.
    setCalendars((current) =>
      current.map((c) => (c.id === calendar.id ? { ...calendar, postCount: c.postCount } : c))
    );
  }, []);

  const handleCalendarDeleted = useCallback(
    (calendarId: string) => {
      const remaining = calendars.filter((c) => c.id !== calendarId);
      setCalendars(remaining);
      if (activeCalendarId !== calendarId) return;

      const params = new URLSearchParams(searchParams.toString());
      if (remaining.length > 0) {
        params.set('calendar', remaining[0].id);
      } else {
        params.delete('calendar');
      }
      const query = params.toString();
      router.replace(`/dashboard/releases/${releaseId}/calendar${query ? `?${query}` : ''}`, { scroll: false });
    },
    [activeCalendarId, calendars, releaseId, router, searchParams]
  );

  // --- Month resolution + URL sync ---
  const monthParam = searchParams.get('month');
  const month = resolveMonth(monthParam, release?.releaseDate ?? null, getClientTodayIso());

  const setMonthParam = useCallback(
    (nextMonth: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('month', nextMonth);
      router.replace(`/dashboard/releases/${releaseId}/calendar?${params.toString()}`, { scroll: false });
    },
    [releaseId, router, searchParams]
  );

  // Keeps the resolved month addressable in the URL even when the visitor
  // arrived with no ?month= (or an invalid one): deep-linkable by humans
  // and Chappi alike, per the spec. No-ops once the param already matches.
  useEffect(() => {
    if (isInitialLoading || !release) return;
    if (monthParam === month) return;
    setMonthParam(month);
  }, [isInitialLoading, release, month, monthParam, setMonthParam]);

  // --- Posts: self-contained fetch, scoped to the active calendar + month ---
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState('');

  const loadPosts = useCallback(async () => {
    if (!activeCalendarId) {
      setPosts([]);
      setIsLoadingPosts(false);
      return;
    }
    setIsLoadingPosts(true);
    setPostsError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setPostsError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(
        `/api/releases/${releaseId}/content-posts?calendarId=${encodeURIComponent(activeCalendarId)}&month=${encodeURIComponent(month)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as { posts?: ContentPost[]; error?: string };
      if (!res.ok) {
        setPostsError(data.error || 'Could not load posts.');
        return;
      }
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : 'Could not load posts.');
    } finally {
      setIsLoadingPosts(false);
    }
  }, [activeCalendarId, month, releaseId]);

  useEffect(() => {
    if (!CONTENT_CALENDAR_ENABLED || authLoading || !user) return;
    void loadPosts();
  }, [authLoading, loadPosts, user]);

  // --- Release-date-moved notice ---
  // Keyed by the ACTIVE CALENDAR's id (per the spec), so it's a per-calendar
  // "welcome back" rather than a per-release one.
  const [releaseDateNotice, setReleaseDateNotice] = useState(false);
  useEffect(() => {
    if (!activeCalendarId || !release?.releaseDate) {
      setReleaseDateNotice(false);
      return;
    }
    const key = `urganize.content-calendar.seen-release-date.${activeCalendarId}`;
    const seen = readPersistedState<string>(key, 1, isIsoDateString);
    setReleaseDateNotice(Boolean(seen && seen !== release.releaseDate));
    writePersistedState(key, 1, release.releaseDate);
  }, [activeCalendarId, release?.releaseDate]);

  // --- Post modal ---
  const [postModalState, setPostModalState] = useState<{
    open: boolean;
    post: ContentPost | null;
    initialDate: string | null;
  }>({ open: false, post: null, initialDate: null });

  const openCreatePost = useCallback((date: string) => {
    setPostModalState({ open: true, post: null, initialDate: date });
  }, []);
  const openEditPost = useCallback((post: ContentPost) => {
    setPostModalState({ open: true, post, initialDate: null });
  }, []);
  const closePostModal = useCallback(() => {
    setPostModalState((current) => ({ ...current, open: false }));
  }, []);

  const handlePostSaved = useCallback(
    (post: ContentPost, mode: 'created' | 'updated') => {
      setPosts((current) => {
        if (mode === 'created') return [...current, post];
        return current.map((p) => (p.id === post.id ? post : p));
      });
      if (mode === 'created' && activeCalendarId) {
        setCalendars((current) =>
          current.map((c) => (c.id === activeCalendarId ? { ...c, postCount: c.postCount + 1 } : c))
        );
      }
      setPostModalState({ open: false, post: null, initialDate: null });
      showToast('Post saved', 'success');
    },
    [activeCalendarId, showToast]
  );

  const handlePostDeleted = useCallback(
    (postId: string) => {
      setPosts((current) => current.filter((p) => p.id !== postId));
      if (activeCalendarId) {
        setCalendars((current) =>
          current.map((c) => (c.id === activeCalendarId ? { ...c, postCount: Math.max(0, c.postCount - 1) } : c))
        );
      }
      setPostModalState({ open: false, post: null, initialDate: null });
      showToast('Post deleted', 'success');
    },
    [activeCalendarId, showToast]
  );

  const handleToggleStatus = useCallback(
    async (post: ContentPost) => {
      const nextStatus: ContentPostStatus = post.status === 'posted' ? 'draft' : 'posted';
      setPosts((current) => current.map((p) => (p.id === post.id ? { ...p, status: nextStatus } : p)));
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Session expired. Please sign in again.');
        const res = await fetch(`/api/releases/${releaseId}/content-posts/${post.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        const data = (await res.json().catch(() => ({}))) as { post?: ContentPost; error?: string };
        if (!res.ok || !data.post) throw new Error(data.error || 'Could not update post.');
        setPosts((current) => current.map((p) => (p.id === post.id ? data.post! : p)));
      } catch (err) {
        setPosts((current) => current.map((p) => (p.id === post.id ? post : p)));
        showToast(err instanceof Error ? err.message : 'Could not update post.', 'error');
      }
    },
    [releaseId, showToast]
  );

  // --- Zero-calendars empty-state create form ---
  const [emptyCreateOpen, setEmptyCreateOpen] = useState(false);
  const [emptyPlatform, setEmptyPlatform] = useState<SocialPlatform>(SOCIAL_PLATFORM_OPTIONS[0]);
  const [emptyName, setEmptyName] = useState('');
  const [isCreatingEmpty, setIsCreatingEmpty] = useState(false);
  const [emptyCreateError, setEmptyCreateError] = useState('');

  const handleEmptyCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingEmpty) return;
    setIsCreatingEmpty(true);
    setEmptyCreateError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setEmptyCreateError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/content-calendars`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: emptyPlatform, name: emptyName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { calendar?: ContentCalendar; error?: string };
      if (!res.ok || !data.calendar) {
        setEmptyCreateError(data.error || 'Could not create calendar.');
        return;
      }
      router.push(`/dashboard/releases/${releaseId}/calendar?calendar=${data.calendar.id}`);
    } catch (err) {
      setEmptyCreateError(err instanceof Error ? err.message : 'Could not create calendar.');
    } finally {
      setIsCreatingEmpty(false);
    }
  };

  if (!CONTENT_CALENDAR_ENABLED) return null;

  // ONE skeleton, rendered here (no route-segment Suspense fallback for this
  // part), same rationale as ReleaseDetailSkeleton: SSR serializes it,
  // hydration reconciles the same JSX, no remount.
  if (authLoading || isInitialLoading) {
    return <CalendarPageSkeleton className={`${fraunces.variable} ${spaceMono.variable}`} />;
  }

  if (!release) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
          <div className="flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Release not found.</p>
              <p className="mt-1 text-status-error/80">{releaseError || 'This release may have been deleted.'}</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const today = getClientTodayIso();
  const showReleaseMonthButton = Boolean(release.releaseDate) && release.releaseDate!.slice(0, 7) !== month;

  return (
    <main
      className={`cc-island min-h-screen bg-[var(--cc-ground)] text-[var(--cc-text)] ${fraunces.variable} ${spaceMono.variable}`}
    >
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6">
        {toast ? (
          <div className="mb-4">
            <Toast message={toast.message} tone={toast.tone} />
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {/* Back goes to the WORKSPACE scoped to this release, not the
                release detail page: the workspace is the surface users live
                in and the calendar's primary entry point (founder feedback,
                2026-07-20). The detail page keeps its own header link here. */}
            <Link
              href={`/dashboard?release=${releaseId}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to release
            </Link>
            <p className="mt-2 font-[family-name:var(--font-cc-mono)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cc-accent)]">
              {formatArtistName(release.artistName)} / SINGLE
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-cc-display)] text-3xl font-medium tracking-tight text-[var(--cc-text)]">
              {release.title}
            </h1>
          </div>

          {activeCalendar ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMonthParam(shiftMonth(month, -1))}
                aria-label="Previous month"
                className="flex h-9 w-9 items-center justify-center border border-[var(--cc-border)] text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[7ch] text-center font-[family-name:var(--font-cc-mono)] text-sm font-bold tracking-wide text-[var(--cc-text)]">
                {formatMonthLabel(month)}
              </span>
              <button
                type="button"
                onClick={() => setMonthParam(shiftMonth(month, 1))}
                aria-label="Next month"
                className="flex h-9 w-9 items-center justify-center border border-[var(--cc-border)] text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {showReleaseMonthButton ? (
                <button
                  type="button"
                  onClick={() => setMonthParam(release.releaseDate!.slice(0, 7))}
                  className="whitespace-nowrap text-xs font-medium text-[var(--cc-text-muted)] underline-offset-2 hover:text-[var(--cc-text)] hover:underline"
                >
                  Release month
                </button>
              ) : null}
              <CalendarOverflowMenu
                releaseId={releaseId}
                calendar={activeCalendar}
                onRenamed={handleCalendarRenamed}
                onDeleted={handleCalendarDeleted}
                onToast={showToast}
              />
            </div>
          ) : null}
        </div>

        {releaseDateNotice ? (
          <div className="mt-4 flex items-center justify-between gap-3 border border-[var(--cc-border)] bg-[var(--cc-text)]/5 px-3 py-2 text-sm text-[var(--cc-text-muted)]">
            <span>Release date moved; your posts kept their dates.</span>
            <button
              type="button"
              onClick={() => setReleaseDateNotice(false)}
              aria-label="Dismiss"
              className="shrink-0 text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="mt-6">
          {isLoadingCalendars ? (
            <div className="flex gap-2 border-b border-[var(--cc-border)] pb-3">
              <div className="skeleton-shimmer h-8 w-24" />
              <div className="skeleton-shimmer h-8 w-24" />
            </div>
          ) : calendarsError && calendars.length === 0 ? (
            <div className="flex flex-col items-start gap-3 border border-[var(--cc-border)] bg-[var(--cc-text)]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--cc-text)]">Couldn&rsquo;t load calendars.</p>
              <button
                type="button"
                onClick={() => void loadCalendars()}
                className="inline-flex h-9 shrink-0 items-center border border-[var(--cc-border)] px-4 text-sm font-semibold text-[var(--cc-text)] hover:bg-[var(--cc-text)]/5"
              >
                Retry
              </button>
            </div>
          ) : calendars.length === 0 ? (
            <div className="border border-[var(--cc-border)] bg-[var(--cc-text)]/[0.03] p-8 text-center">
              <p className="text-sm text-[var(--cc-text-muted)]">Plan this release&rsquo;s social content.</p>
              {!emptyCreateOpen ? (
                <button
                  type="button"
                  onClick={() => setEmptyCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 bg-[var(--cc-accent)] px-4 py-2 text-sm font-semibold text-[var(--cc-ground)] hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" /> New calendar
                </button>
              ) : (
                <form
                  onSubmit={(event) => void handleEmptyCreate(event)}
                  className="mx-auto mt-4 flex max-w-md flex-col gap-3 text-left"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block sm:w-40">
                      <span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--cc-text-muted)]">
                        Platform
                      </span>
                      <select
                        value={emptyPlatform}
                        onChange={(event) => setEmptyPlatform(event.target.value as SocialPlatform)}
                        disabled={isCreatingEmpty}
                        className="h-10 w-full border border-[var(--cc-border)] bg-[var(--cc-ground)] px-2 text-sm text-[var(--cc-text)]"
                      >
                        {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {getPlatformLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block sm:flex-1">
                      <span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--cc-text-muted)]">
                        Account name
                      </span>
                      <input
                        value={emptyName}
                        onChange={(event) => setEmptyName(event.target.value)}
                        maxLength={80}
                        disabled={isCreatingEmpty}
                        placeholder="Main account (optional)"
                        className="h-10 w-full border border-[var(--cc-border)] bg-transparent px-3 text-sm text-[var(--cc-text)] placeholder:text-[var(--cc-text-faint)]"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isCreatingEmpty}
                        className="h-10 bg-[var(--cc-accent)] px-4 text-sm font-semibold text-[var(--cc-ground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCreatingEmpty ? 'Creating…' : 'Create'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmptyCreateOpen(false)}
                        disabled={isCreatingEmpty}
                        className="h-10 border border-[var(--cc-border)] px-4 text-sm text-[var(--cc-text)] hover:bg-[var(--cc-text)]/5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {emptyCreateError ? <p className="text-xs text-[var(--cc-text)]">{emptyCreateError}</p> : null}
                </form>
              )}
            </div>
          ) : (
            <>
              <CalendarTabs
                releaseId={releaseId}
                calendars={calendars}
                activeCalendarId={activeCalendarId}
                onSelect={setCalendarParam}
                onCreated={handleCalendarCreated}
              />

              {isLoadingPosts && posts.length === 0 && !postsError ? (
                <p className="mt-4 text-center text-sm text-[var(--cc-text-muted)]">Loading posts…</p>
              ) : postsError && posts.length === 0 ? (
                <div className="mt-4 flex flex-col items-start gap-3 border border-[var(--cc-border)] bg-[var(--cc-text)]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[var(--cc-text)]">Couldn&rsquo;t load posts.</p>
                  <button
                    type="button"
                    onClick={() => void loadPosts()}
                    className="inline-flex h-9 shrink-0 items-center border border-[var(--cc-border)] px-4 text-sm font-semibold text-[var(--cc-text)] hover:bg-[var(--cc-text)]/5"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <MonthGrid
                    month={month}
                    releaseDate={release.releaseDate}
                    posts={posts}
                    today={today}
                    onCreatePost={openCreatePost}
                    onOpenPost={openEditPost}
                    onToggleStatus={(post) => void handleToggleStatus(post)}
                  />
                  <AgendaList
                    month={month}
                    releaseDate={release.releaseDate}
                    posts={posts}
                    today={today}
                    onCreatePost={openCreatePost}
                    onOpenPost={openEditPost}
                    onToggleStatus={(post) => void handleToggleStatus(post)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeCalendarId ? (
        <PostModal
          open={postModalState.open}
          releaseId={releaseId}
          calendarId={activeCalendarId}
          initialDate={postModalState.initialDate}
          post={postModalState.post}
          onClose={closePostModal}
          onSaved={handlePostSaved}
          onDeleted={handlePostDeleted}
        />
      ) : null}
    </main>
  );
}

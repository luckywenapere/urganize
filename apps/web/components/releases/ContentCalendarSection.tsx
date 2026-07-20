'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Globe, Loader2, Plus } from 'lucide-react';
import type { IconType } from 'react-icons';
import {
  SiFacebook,
  SiInstagram,
  SiSnapchat,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from 'react-icons/si';
import {
  SOCIAL_PLATFORM_OPTIONS,
  type ContentCalendar,
  type SocialPlatform,
} from '@/types/content-calendar';
import { getPlatformLabel } from '@/lib/content-calendar';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

// Release-page entry point for the content calendar (URG-157, Phase A). The
// AssetSection pattern: self-contained, takes releaseId, fetches its own data,
// renders its own loading/empty/error states. Discovery and creation live on
// the release detail page (the release-spine principle); the calendar itself
// lives at /dashboard/releases/[releaseId]/calendar.
//
// NEXT_PUBLIC_ prefix so the value is inlined at build time for this client
// component. The API routes guard the same flag server-side (404 when off).
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

// Platform icons render monochrome via currentColor (react-icons' default
// fill), never platform brand colors: the row's text token carries the color.
// 'other' has no brand mark, so it uses lucide's Globe.
const PLATFORM_ICONS: Record<Exclude<SocialPlatform, 'other'>, IconType> = {
  tiktok: SiTiktok,
  instagram: SiInstagram,
  youtube: SiYoutube,
  x: SiX,
  facebook: SiFacebook,
  snapchat: SiSnapchat,
  whatsapp: SiWhatsapp,
  threads: SiThreads,
};

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  if (platform === 'other') {
    return <Globe className={className} aria-hidden="true" />;
  }
  const Icon = PLATFORM_ICONS[platform];
  return <Icon className={className} aria-hidden="true" />;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type ContentCalendarSectionProps = {
  releaseId: string;
};

export function ContentCalendarSection({ releaseId }: ContentCalendarSectionProps) {
  const router = useRouter();
  const [calendars, setCalendars] = useState<ContentCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Distinguishes "the release has no calendars" from "the load failed", the
  // same split AssetSection draws so a fetch failure never masquerades as the
  // warm empty invitation.
  const [loadError, setLoadError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [platform, setPlatform] = useState<SocialPlatform>(SOCIAL_PLATFORM_OPTIONS[0]);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadCalendars = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/content-calendars`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        calendars?: ContentCalendar[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error || 'Could not load calendars.');
        return;
      }
      setCalendars(Array.isArray(data.calendars) ? data.calendars : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load calendars.');
    } finally {
      setIsLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!CONTENT_CALENDAR_ENABLED) return;
    void loadCalendars();
  }, [loadCalendars]);

  const openCreate = () => {
    setCreateError('');
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    setIsCreateOpen(false);
    setCreateError('');
    setName('');
    setPlatform(SOCIAL_PLATFORM_OPTIONS[0]);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;
    setIsCreating(true);
    setCreateError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setCreateError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/content-calendars`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        calendar?: ContentCalendar;
        error?: string;
      };
      if (!res.ok || !data.calendar?.id) {
        setCreateError(data.error || 'Could not create calendar.');
        return;
      }
      // Journey continuity: land the user straight on the new calendar, whose
      // empty state invites the first post. Momentum never dies at the moment
      // of highest intent.
      router.push(`/dashboard/releases/${releaseId}/calendar?calendar=${data.calendar.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create calendar.');
    } finally {
      setIsCreating(false);
    }
  };

  if (!CONTENT_CALENDAR_ENABLED) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            Content calendars
          </h2>
          <p className="mt-1 text-sm text-content-secondary">
            Per-platform posting plans for this release&rsquo;s rollout.
          </p>
        </div>
        {calendars.length > 0 && !isCreateOpen ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 items-center gap-2 border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            New calendar
          </button>
        ) : null}
      </div>

      {isCreateOpen ? (
        <form onSubmit={handleCreate} className="mt-4 border border-stroke-default bg-bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block sm:w-48">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Platform
              </span>
              {/* Same native-select dark-popup treatment as AssetUploadControl:
                  solid dark tokens + [color-scheme:dark] + styled options. */}
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
                disabled={isCreating}
                className="motion-focus h-10 w-full border border-stroke-default bg-bg-elevated px-3 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-strong focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-bg-elevated text-content-primary">
                    {getPlatformLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:flex-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Account name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                disabled={isCreating}
                placeholder="Main account (optional)"
                className="motion-focus h-10 w-full border border-stroke-default bg-bg-elevated px-3 text-sm text-content-primary transition-colors placeholder:text-content-tertiary hover:border-stroke-strong focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create calendar'
                )}
              </button>
              <button
                type="button"
                onClick={closeCreate}
                disabled={isCreating}
                className="inline-flex h-10 items-center border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
          {createError ? <p className="mt-3 text-xs text-status-error">{createError}</p> : null}
        </form>
      ) : null}

      {isLoading && calendars.length === 0 ? (
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      ) : loadError && calendars.length === 0 ? (
        <div className="mt-4 flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-status-error">Couldn&rsquo;t load calendars.</p>
          <button
            type="button"
            onClick={() => void loadCalendars()}
            className="inline-flex h-9 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
          >
            Retry
          </button>
        </div>
      ) : calendars.length === 0 ? (
        isCreateOpen ? null : (
          <div className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center">
            <p className="text-sm text-content-secondary">
              Plan this release&rsquo;s social content.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 inline-flex items-center gap-2 border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              New calendar
            </button>
          </div>
        )
      ) : (
        <div className="mt-4 space-y-1">
          {calendars.map((calendar) => {
            const displayName = calendar.name || getPlatformLabel(calendar.platform);
            return (
              <Link
                key={calendar.id}
                href={`/dashboard/releases/${releaseId}/calendar?calendar=${calendar.id}`}
                className="motion-focus flex items-center gap-3 border border-stroke-default bg-bg-surface px-4 py-3 text-sm transition-colors hover:bg-bg-hover"
              >
                <PlatformIcon
                  platform={calendar.platform}
                  className="h-4 w-4 shrink-0 text-content-secondary"
                />
                {/* The icon is the only platform signal for sighted users, so
                    name-bearing rows get an sr-only platform label. Skipped
                    when the display name IS the platform label already. */}
                {calendar.name ? (
                  <span className="sr-only">{getPlatformLabel(calendar.platform)}</span>
                ) : null}
                <span
                  className="max-w-[18ch] truncate font-medium text-content-primary"
                  title={displayName}
                >
                  {displayName}
                </span>
                <span className="min-w-0 flex-1" aria-hidden="true" />
                <span className="shrink-0 text-xs text-content-tertiary">
                  {calendar.postCount} {calendar.postCount === 1 ? 'post' : 'posts'}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

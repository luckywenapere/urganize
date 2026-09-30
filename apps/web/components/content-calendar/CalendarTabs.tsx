'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Globe, Loader2, Plus } from '@/components/icons';
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
import { getAccessToken } from './get-access-token';
import { getPlatformLabel } from '@/lib/content-calendar';
import { SOCIAL_PLATFORM_OPTIONS, type ContentCalendar, type SocialPlatform } from '@/types/content-calendar';

/**
 * role="tablist" calendar switcher for the content-calendar page (URG-157,
 * Phase A). One real <button role="tab"> per calendar (platform icon +
 * truncated account label), arrow-key roving focus, active tab auto-scrolled
 * into view. A trailing "New calendar" button sits OUTSIDE the tablist
 * (visually the last item in the same scrolling row) rather than as a
 * role="tab" itself: a tablist should only contain tabs that control a
 * panel, and this one triggers an action instead.
 */

// Monochrome platform glyphs via currentColor, never brand colors. (This map
// used to mirror one in ContentCalendarSection; that component was deleted
// with the release detail page, 2026-08-04, so this is the only copy now.)
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

type CalendarTabsProps = {
  releaseId: string;
  calendars: ContentCalendar[];
  activeCalendarId: string | null;
  onSelect: (calendarId: string) => void;
  onCreated: (calendar: ContentCalendar) => void;
};

export function CalendarTabs({ releaseId, calendars, activeCalendarId, onSelect, onCreated }: CalendarTabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [platform, setPlatform] = useState<SocialPlatform>(SOCIAL_PLATFORM_OPTIONS[0]);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Keep the active tab visible in the strip's own horizontal scroller — but
  // NOT on the first render: scrollIntoView with block:'nearest' can scroll
  // the DOCUMENT too, and on mobile the tab strip sits well below the
  // workspace chrome, so running it on mount yanked the page down every time
  // the calendar scene opened (2026-08-10 fix).
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (!activeCalendarId) return;
    tabRefs.current.get(activeCalendarId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeCalendarId]);

  const handleArrowKey = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (calendars.length === 0) return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (index + delta + calendars.length) % calendars.length;
      const next = calendars[nextIndex];
      if (!next) return;
      tabRefs.current.get(next.id)?.focus();
      onSelect(next.id);
    },
    [calendars, onSelect]
  );

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
      const data = (await res.json().catch(() => ({}))) as { calendar?: ContentCalendar; error?: string };
      if (!res.ok || !data.calendar) {
        setCreateError(data.error || 'Could not create calendar.');
        return;
      }
      closeCreate();
      onCreated(data.calendar);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create calendar.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-stretch gap-1 overflow-x-auto border-b border-[var(--cc-border)]">
        <div role="tablist" aria-label="Content calendars" className="flex min-w-0 gap-1">
          {calendars.map((calendar, index) => {
            const isActive = calendar.id === activeCalendarId;
            const displayName = calendar.name || getPlatformLabel(calendar.platform);
            return (
              <button
                key={calendar.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(calendar.id, el);
                  else tabRefs.current.delete(calendar.id);
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${getPlatformLabel(calendar.platform)}, ${displayName}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelect(calendar.id)}
                onKeyDown={(event) => handleArrowKey(event, index)}
                title={displayName}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-[var(--cc-accent)] text-[var(--cc-text)]'
                    : 'border-transparent text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]'
                }`}
              >
                <PlatformIcon
                  platform={calendar.platform}
                  className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-[var(--cc-accent)]' : 'text-[var(--cc-text-muted)]'}`}
                />
                <span className="max-w-[18ch] truncate">{displayName}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
          aria-label="New calendar"
          aria-expanded={isCreateOpen}
          className="flex shrink-0 items-center justify-center px-3 py-2.5 text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {isCreateOpen ? (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="mt-3 flex flex-col gap-3 border border-[var(--cc-border)] bg-[var(--cc-text)]/[0.03] p-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block sm:w-40">
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--cc-text-muted)]">
                Platform
              </span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
                disabled={isCreating}
                className="h-9 w-full border border-[var(--cc-field-border)] bg-[var(--cc-ground)] px-2 text-sm text-[var(--cc-text)]"
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
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                disabled={isCreating}
                placeholder="Main account (optional)"
                className="h-9 w-full border border-[var(--cc-field-border)] bg-transparent px-3 text-sm text-[var(--cc-text)] placeholder:text-[var(--cc-text-faint)]"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex h-9 items-center gap-2 bg-[var(--cc-accent)] px-3 text-sm font-semibold text-[var(--cc-ground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {isCreating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={closeCreate}
                disabled={isCreating}
                className="h-9 border border-[var(--cc-border)] px-3 text-sm text-[var(--cc-text)] hover:bg-[var(--cc-text)]/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
          {createError ? <p className="text-xs text-[var(--cc-text)]">{createError}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

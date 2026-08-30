'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, MapPin, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { EVENT_STATUS_COPY, formatShowDateTime, shortTimezoneLabel } from '@/lib/events';
import { SetlistBuilder } from '@/components/events/SetlistBuilder';
import type { RunOfShowItem, Setlist, ShowEvent } from '@/types/events';

const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* non-JSON */
  }
  return fallback;
}

export default function ShowPageClient() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = typeof params?.eventId === 'string' ? params.eventId : '';

  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [runOfShow, setRunOfShow] = useState<RunOfShowItem[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadShow = useCallback(async () => {
    if (!eventId) return;
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }

    try {
      const [showResponse, setlistResponse] = await Promise.all([
        fetch(`/api/events/${eventId}`, { headers }),
        fetch(`/api/events/${eventId}/setlists`, { headers }),
      ]);

      if (!showResponse.ok) {
        setError(await readError(showResponse, 'Could not load this show.'));
        setIsLoading(false);
        return;
      }

      const showBody = await showResponse.json();
      setEvent(showBody.event);
      setRunOfShow(Array.isArray(showBody.runOfShow) ? showBody.runOfShow : []);

      if (setlistResponse.ok) {
        const setlistBody = await setlistResponse.json();
        const loaded: Setlist[] = Array.isArray(setlistBody.setlists) ? setlistBody.setlists : [];
        setSetlists(loaded);
        // Resolve inside the setter so a slow second load cannot clobber a
        // selection the manager already made.
        setActiveSetlistId((current) => current ?? loaded[0]?.id ?? null);
      }
      setError('');
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!EVENTS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadShow();
  }, [loadShow, router]);

  const createSetlist = async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch(`/api/events/${eventId}/setlists`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: setlists.length === 0 ? 'Main set' : `Set ${setlists.length + 1}` }),
    });
    if (!response.ok) {
      setError(await readError(response, 'Could not start a set.'));
      return;
    }
    const body = await response.json();
    setSetlists((current) => [...current, body.setlist]);
    setActiveSetlistId(body.setlist.id);
  };

  if (!EVENTS_ENABLED) return null;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="h-6 w-24 animate-pulse rounded bg-bg-surface" />
        <div className="h-28 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/dashboard/shows"
          className="motion-focus inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Shows
        </Link>
        <p className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
          {error || 'Show not found.'}
        </p>
      </div>
    );
  }

  const place = [event.venueName, event.city, event.country].filter(Boolean).join(', ');
  const activeSetlist = setlists.find((setlist) => setlist.id === activeSetlistId) || null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/dashboard/shows"
        className="motion-focus inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Shows
      </Link>

      <header className="mt-4">
        {event.artistName ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {event.artistName}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-content-primary">{event.title}</h1>
          <span className="rounded-full border border-stroke-default px-2 py-0.5 text-[11px] font-semibold text-content-tertiary">
            {EVENT_STATUS_COPY[event.status]}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-secondary">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {formatShowDateTime(event.setStartAt, event.timezone)}
            {event.setStartAt ? (
              <span className="text-content-tertiary">{shortTimezoneLabel(event.timezone)} time</span>
            ) : null}
          </span>
          {place ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden />
              {place}
            </span>
          ) : null}
        </div>
      </header>

      {runOfShow.length > 0 ? (
        <section className="mt-6 rounded-xl border border-stroke-default bg-bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            Run of show
          </h2>
          <ul className="mt-3 space-y-1.5">
            {runOfShow.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-content-primary">{item.label}</span>
                <span className="font-mono text-xs text-content-tertiary">
                  {item.at
                    ? formatShowDateTime(item.at, event.timezone, { includeDate: false })
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-content-primary">The set</h2>
          <button
            type="button"
            onClick={() => void createSetlist()}
            className="motion-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-stroke-default px-3 text-sm font-semibold text-content-secondary hover:border-brand hover:text-content-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {setlists.length === 0 ? 'Start the set' : 'Another set'}
          </button>
        </div>

        {/* More than one set is normal — you build a 25 and a 40 in case the
            slot moves — so the picker only appears once there is a choice. */}
        {setlists.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {setlists.map((setlist) => (
              <button
                key={setlist.id}
                type="button"
                onClick={() => setActiveSetlistId(setlist.id)}
                aria-pressed={setlist.id === activeSetlistId}
                className={`motion-focus rounded-full border px-3 py-1 text-xs font-semibold ${
                  setlist.id === activeSetlistId
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stroke-default text-content-secondary hover:text-content-primary'
                }`}
              >
                {setlist.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          {activeSetlist ? (
            <SetlistBuilder
              key={activeSetlist.id}
              setlistId={activeSetlist.id}
              artistId={event.artistId}
              setLengthMinutes={event.setLengthMinutes}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-stroke-default p-6 text-center text-sm text-content-secondary">
              No set built yet. Start one and the running total will tell you whether it fits the{' '}
              {event.setLengthMinutes} minutes you were given.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

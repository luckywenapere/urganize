'use client';

/**
 * The music side's one source of truth for what is in the list and what is
 * playing. It lives in app/music/layout.tsx, which Next keeps mounted while a
 * listener moves between Songs, Search and Settings, so a song keeps playing
 * through every tab change and the list is fetched once, not once per tab.
 *
 * The <audio> element is owned here and nowhere else. Screens ask for things
 * ("play this song in this order") and read state; none of them touch audio.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase/client';
import { PLAY_COUNT_AFTER_SECONDS } from '@/lib/music/rules';
import type { PublicTrack } from '@/lib/music/server';

type FeedStatus = 'loading' | 'ready' | 'error';

type MusicContextValue = {
  feed: {
    tracks: PublicTrack[];
    status: FeedStatus;
    loadingMore: boolean;
    hasMore: boolean;
    total: number;
  };
  reloadFeed: () => void;
  loadMore: () => void;

  current: PublicTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  playError: string | null;
  playTrack: (track: PublicTrack, queue: PublicTrack[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;

  fullPlayerOpen: boolean;
  setFullPlayerOpen: (open: boolean) => void;
};

const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusic(): MusicContextValue {
  const value = useContext(MusicContext);
  if (!value) throw new Error('useMusic must be used inside MusicProvider');
  return value;
}

const ANON_KEY = 'urganize.music.anon';

/** A random id this browser keeps, so a signed-out listener counts as one
 *  listener and not one per page load. Never sent anywhere but our own play
 *  route, and stored there only as a hash. */
function readAnonId(): string | null {
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

async function postPlay(trackId: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    } catch {
      // Signed out is the normal case here.
    }
    await fetch(`/api/music/tracks/${trackId}/play`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ anonId: readAnonId() }),
      keepalive: true,
    });
  } catch {
    // A play that is not counted is not worth telling the listener about.
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<PublicTrack[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  const [current, setCurrent] = useState<PublicTrack | null>(null);
  const [queue, setQueue] = useState<PublicTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const countedRef = useRef<string | null>(null);
  const feedRequestRef = useRef(0);

  const loadFeed = useCallback(async () => {
    const request = ++feedRequestRef.current;
    setStatus('loading');
    try {
      const response = await fetch('/api/music/tracks');
      const data = (await response.json().catch(() => ({}))) as {
        tracks?: PublicTrack[];
        total?: number;
        nextOffset?: number | null;
      };
      if (request !== feedRequestRef.current) return;
      if (!response.ok || !Array.isArray(data.tracks)) {
        setStatus('error');
        return;
      }
      setTracks(data.tracks);
      setTotal(data.total ?? data.tracks.length);
      setNextOffset(data.nextOffset ?? null);
      setStatus('ready');
    } catch {
      if (request === feedRequestRef.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/music/tracks?offset=${nextOffset}`);
      const data = (await response.json().catch(() => ({}))) as {
        tracks?: PublicTrack[];
        nextOffset?: number | null;
      };
      if (response.ok && Array.isArray(data.tracks)) {
        const more = data.tracks;
        setTracks((existing) => {
          const seen = new Set(existing.map((track) => track.id));
          return [...existing, ...more.filter((track) => !seen.has(track.id))];
        });
        setNextOffset(data.nextOffset ?? null);
      }
    } catch {
      // The button stays; tapping it again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextOffset]);

  const startTrack = useCallback((track: PublicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    listenedRef.current = 0;
    lastTimeRef.current = 0;
    countedRef.current = null;
    setPlayError(null);
    setPosition(0);
    setDuration(track.durationSeconds ?? 0);
    setCurrent(track);
    audio.src = track.streamUrl;
    const started = audio.play();
    if (started && typeof started.catch === 'function') {
      started.catch(() => {
        // Autoplay was refused or the file failed; the error event says which.
        setIsPlaying(false);
      });
    }
  }, []);

  const playTrack = useCallback(
    (track: PublicTrack, list: PublicTrack[]) => {
      const from = list.findIndex((item) => item.id === track.id);
      setQueue(from >= 0 ? list.slice(from) : [track]);
      startTrack(track);
    },
    [startTrack]
  );

  const next = useCallback(() => {
    if (!current) return;
    const index = queue.findIndex((item) => item.id === current.id);
    const following = index >= 0 ? queue[index + 1] : undefined;
    if (following) startTrack(following);
    else {
      audioRef.current?.pause();
      setIsPlaying(false);
      setPosition(0);
    }
  }, [current, queue, startTrack]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    // The usual player habit: past a few seconds, the button restarts the song.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const index = queue.findIndex((item) => item.id === current.id);
    const before = index > 0 ? queue[index - 1] : undefined;
    if (before) startTrack(before);
    else audio.currentTime = 0;
  }, [current, queue, startTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      const resumed = audio.play();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [current]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, seconds);
    lastTimeRef.current = audio.currentTime;
    setPosition(audio.currentTime);
  }, []);

  // Keep the lock screen and headphone buttons in step with the player.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !current) return;
    const session = navigator.mediaSession;
    try {
      session.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artistName,
        artwork: current.coverUrl ? [{ src: current.coverUrl }] : [],
      });
      session.setActionHandler('play', toggle);
      session.setActionHandler('pause', toggle);
      session.setActionHandler('nexttrack', next);
      session.setActionHandler('previoustrack', previous);
    } catch {
      // A browser that cannot do this still plays.
    }
  }, [current, next, previous, toggle]);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    const time = audio.currentTime;
    const delta = time - lastTimeRef.current;
    // Only real listening counts: a jump from seeking is not a second heard.
    if (delta > 0 && delta < 1.5) listenedRef.current += delta;
    lastTimeRef.current = time;
    setPosition(time);
    if (
      listenedRef.current >= PLAY_COUNT_AFTER_SECONDS &&
      countedRef.current !== current.id
    ) {
      countedRef.current = current.id;
      void postPlay(current.id);
    }
  };

  const value = useMemo<MusicContextValue>(
    () => ({
      feed: {
        tracks,
        status,
        loadingMore,
        hasMore: nextOffset !== null,
        total,
      },
      reloadFeed: () => void loadFeed(),
      loadMore: () => void loadMore(),
      current,
      isPlaying,
      position,
      duration,
      playError,
      playTrack,
      toggle,
      next,
      previous,
      seek,
      fullPlayerOpen,
      setFullPlayerOpen,
    }),
    [
      tracks,
      status,
      loadingMore,
      nextOffset,
      total,
      loadFeed,
      loadMore,
      current,
      isPlaying,
      position,
      duration,
      playError,
      playTrack,
      toggle,
      next,
      previous,
      seek,
      fullPlayerOpen,
    ]
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={next}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
        }}
        onError={() => {
          setIsPlaying(false);
          setPlayError('We could not play that song. Try another.');
        }}
      />
    </MusicContext.Provider>
  );
}

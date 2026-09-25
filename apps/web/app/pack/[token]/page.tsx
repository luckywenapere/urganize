import type { Metadata } from 'next';
import { loadPublicPack, logPackAccess, type PackTrack } from '@/lib/dj-pack-server';
import { formatDuration, SONG_VERSION_LABEL_COPY } from '@/lib/setlist';

// Resolves a live row that can be turned off or expire, so there was never a
// static version of this page to protect (the /credits/[token] reasoning).
export const dynamic = 'force-dynamic';

// A pack link is handed to one person. It must never be indexed.
export const metadata: Metadata = {
  title: 'Your tracks',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PackPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const downloadFailed = query.download === 'failed';
  const pack = await loadPublicPack(token);

  if (pack.state === 'unavailable') {
    return (
      <PackShell>
        <h1 className="text-xl font-semibold">This link isn&rsquo;t available</h1>
        <p className="mt-2 text-sm opacity-70">
          It may have been turned off, or replaced with a newer one. Ask whoever sent it for a new
          link.
        </p>
      </PackShell>
    );
  }

  if (pack.state === 'expired') {
    return (
      <PackShell>
        <h1 className="text-xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-sm opacity-70">
          The tracks for {pack.showTitle} aren&rsquo;t here any more. Ask whoever sent it to open
          the link again.
        </p>
      </PackShell>
    );
  }

  if (pack.state === 'cancelled') {
    return (
      <PackShell>
        <h1 className="text-xl font-semibold">{pack.showTitle} is cancelled</h1>
        <p className="mt-2 text-sm opacity-70">
          The tracks aren&rsquo;t available because the show is off. If that&rsquo;s not right, ask
          whoever sent this link.
        </p>
      </PackShell>
    );
  }

  // Logged during the server render rather than from a client effect, so a
  // receipt is recorded even for someone with JavaScript blocked or a browser
  // that never runs the effect. Best-effort by contract — a failed log must
  // never stop a DJ reading their set.
  await logPackAccess({
    packId: pack.packId,
    recipientId: pack.recipientId,
    recipientName: pack.recipientName,
    action: 'viewed',
  });

  const firstName = pack.recipientName.trim().split(/\s+/)[0] || 'there';
  const songCount = pack.tracks.filter((track) => track.kind === 'song').length;
  // Numbered like the files, so row 7 on screen is the file that starts "07".
  const numberWidth = Math.max(2, String(songCount).length);

  return (
    <PackShell>
      {pack.artistName ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
          {pack.artistName}
        </p>
      ) : null}
      <h1 className="mt-2 text-2xl font-semibold">{pack.showTitle}</h1>

      <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <Detail label="When">
          {pack.setTime}
          {pack.setTimeKnown && pack.timezoneLabel ? (
            <span className="opacity-60"> ({pack.timezoneLabel} time)</span>
          ) : null}
        </Detail>
        {pack.venue ? <Detail label="Where">{pack.venue}</Detail> : null}
        {pack.stage ? <Detail label="Stage">{pack.stage}</Detail> : null}
        <Detail label="Set">{pack.setLengthMinutes} minutes</Detail>
      </dl>

      <p className="mt-6 text-sm opacity-80">
        Hi {firstName}. Here&rsquo;s the set in order. Each file name starts with its number, so the
        folder stays in running order when you drag it in.
      </p>

      {downloadFailed ? (
        <Notice tone="error">
          That file didn&rsquo;t download. Try again, or ask whoever sent this link.
        </Notice>
      ) : null}

      {pack.missingFiles > 0 ? (
        <Notice tone="warning">
          {pack.missingFiles === songCount
            ? 'None of the songs have a file yet. Check back soon, or ask whoever sent this link.'
            : `${pack.missingFiles} ${pack.missingFiles === 1 ? 'song doesn’t' : 'songs don’t'} have a file yet. ${
                pack.missingFiles === 1 ? 'It’s' : 'They’re'
              } marked below.`}
        </Notice>
      ) : null}

      <ol className="mt-5 space-y-2">
        {pack.tracks.length === 0 ? (
          <li className="rounded-lg border border-white/10 p-5 text-sm opacity-70">
            There are no songs in this set yet.
          </li>
        ) : (
          pack.tracks.map((track, index) =>
            track.kind === 'cue' ? (
              <CueRow key={`cue-${index}`} track={track} />
            ) : (
              <SongRow
                key={`song-${track.position}`}
                track={track}
                token={token}
                number={String(track.position).padStart(numberWidth, '0')}
              />
            )
          )
        )}
      </ol>

      <p className="mt-8 border-t border-white/10 pt-4 text-xs opacity-50">Sent with Urganize</p>
    </PackShell>
  );
}

function SongRow({ track, token, number }: { track: PackTrack; token: string; number: string }) {
  const meta = [
    formatDuration(track.durationSeconds),
    track.bpm ? `${track.bpm} BPM` : '',
    track.musicalKey || '',
  ].filter(Boolean);

  return (
    <li className="rounded-lg border border-white/10 p-3">
      <div className="flex items-start gap-3">
        <span className="min-w-6 shrink-0 pt-0.5 text-center font-mono text-xs opacity-50">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {track.title}
            {track.versionLabel ? (
              <span className="ml-1.5 font-normal opacity-60">
                ({SONG_VERSION_LABEL_COPY[track.versionLabel]})
              </span>
            ) : null}
          </p>
          {meta.length > 0 ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs opacity-60">
              {meta.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </p>
          ) : null}
          {track.cueNote ? <p className="mt-1 text-xs opacity-80">{track.cueNote}</p> : null}
          {track.isUnreleased ? (
            <p className="mt-1 text-xs font-semibold text-amber-300">
              Unreleased. Please don&rsquo;t share it.
            </p>
          ) : null}
        </div>
        {track.versionId ? (
          // A plain link, on purpose: it works with no JavaScript, and the
          // route answers with a redirect straight to the file. Deliberately NO
          // `download` attribute — if something fails, the route sends the DJ
          // back to this page, and that attribute would save the page as a
          // file instead of showing it.
          <a
            href={`/api/pack/${encodeURIComponent(token)}/download?versionId=${encodeURIComponent(
              track.versionId
            )}&mode=redirect`}
            rel="nofollow"
            title={track.downloadName}
            aria-label={`Download ${track.title}`}
            className="shrink-0 self-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            Download
          </a>
        ) : (
          <span className="shrink-0 self-center text-xs text-amber-300/80">No file yet</span>
        )}
      </div>
    </li>
  );
}

/** Talk, an interlude or a break: part of the running order, not a file. */
function CueRow({ track }: { track: PackTrack }) {
  const length = formatDuration(track.durationSeconds);
  return (
    <li className="flex items-baseline gap-3 px-3 py-1.5 text-xs opacity-60">
      <span className="min-w-6 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{track.title}</span>
        {length ? <span> · {length}</span> : null}
        {track.cueNote ? <span className="block opacity-90">{track.cueNote}</span> : null}
      </span>
    </li>
  );
}

function Notice({ tone, children }: { tone: 'warning' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`mt-4 rounded-lg border p-3 text-sm ${
        tone === 'error'
          ? 'border-red-400/30 bg-red-400/10 text-red-200'
          : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
      }`}
    >
      {children}
    </p>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 opacity-50">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Dark-locked, like the press kit and the credits form: this is a page a
 * stranger opens once, often in a dark booth, and it should look the same for
 * every recipient rather than inheriting whoever's theme.
 */
function PackShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#0d120e] px-5 py-10 text-[#e8efe9]">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </main>
  );
}

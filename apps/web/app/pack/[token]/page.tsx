import type { Metadata } from 'next';
import { loadPublicPack, logPackAccess } from '@/lib/dj-pack-server';
import { formatDuration, SONG_VERSION_LABEL_COPY } from '@/lib/setlist';
import { PackDownloads } from './PackDownloads';

// Resolves a live row that can be revoked or expire, so there was never a
// static version of this page to protect (the /credits/[token] reasoning).
export const dynamic = 'force-dynamic';

// A pack link is handed to one person. It must never be indexed.
export const metadata: Metadata = {
  title: 'Your tracks',
  robots: { index: false, follow: false },
};

export default async function PackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pack = await loadPublicPack(token);

  if (pack.state === 'unavailable') {
    return (
      <PackShell>
        <h1 className="text-xl font-semibold">This link is not available</h1>
        <p className="mt-2 text-sm opacity-70">
          It may have been revoked, or replaced with a newer one. Ask whoever sent it for a fresh
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
          The tracks for {pack.showTitle} are no longer available here. Ask for a new link.
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

  return (
    <PackShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
        {pack.artistName || 'Tracks'}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">{pack.showTitle}</h1>

      <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Detail label="Set time">
          {pack.setTime}
          {pack.timezoneLabel ? (
            <span className="opacity-60"> {pack.timezoneLabel} time</span>
          ) : null}
        </Detail>
        {pack.venue ? <Detail label="Venue">{pack.venue}</Detail> : null}
        {pack.stage ? <Detail label="Stage">{pack.stage}</Detail> : null}
        <Detail label="Set length">{pack.setLengthMinutes} minutes</Detail>
      </dl>

      <p className="mt-5 text-sm opacity-70">
        Hi {firstName} — here is the set in order. The file names are numbered, so the folder lands
        in running order when you drag it in.
      </p>

      <ol className="mt-5 space-y-2">
        {pack.tracks.length === 0 ? (
          <li className="rounded-lg border border-white/10 p-5 text-sm opacity-70">
            No songs in this set yet.
          </li>
        ) : (
          pack.tracks.map((track) => (
            <li
              key={`${track.position}-${track.versionId ?? 'none'}`}
              className="rounded-lg border border-white/10 p-3"
            >
              <div className="flex items-start gap-3">
                <span className="w-6 shrink-0 pt-0.5 text-center font-mono text-xs opacity-50">
                  {String(track.position).padStart(2, '0')}
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
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs opacity-60">
                    <span>{formatDuration(track.durationSeconds)}</span>
                    {track.bpm ? <span>{track.bpm} BPM</span> : null}
                    {track.musicalKey ? <span>{track.musicalKey}</span> : null}
                  </p>
                  {track.cueNote ? (
                    <p className="mt-1 text-xs opacity-70">{track.cueNote}</p>
                  ) : null}
                  {track.isUnreleased ? (
                    <p className="mt-1 text-xs font-semibold text-amber-300">
                      Unreleased. Please don&rsquo;t share this.
                    </p>
                  ) : null}
                </div>
                <PackDownloads
                  token={token}
                  versionId={track.versionId}
                  downloadName={track.downloadName}
                />
              </div>
            </li>
          ))
        )}
      </ol>

      <p className="mt-8 border-t border-white/10 pt-4 text-xs opacity-50">Sent with Urganize</p>
    </PackShell>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="opacity-50">{label}</dt>
      <dd>{children}</dd>
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

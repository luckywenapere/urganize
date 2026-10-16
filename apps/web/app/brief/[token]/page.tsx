/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { loadPublicBrief } from '@/lib/release-brief-server';
import { formatBriefDay, lagosDay, referenceColor, referenceDisplayTitle } from '@/lib/release-brief';

// A view link can be switched off at any moment, so there is no static version
// of this page to keep (the /pack/[token] reasoning).
export const dynamic = 'force-dynamic';

// Handed to a few people outside the team. Never indexed.
export const metadata: Metadata = {
  title: 'Brief',
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

/**
 * The brief's read-only view link (URG-281). No account, no editing: the
 * artist and title, the release day, the Idea, the References and the Dates.
 * Decisions, who's on what and notes are the team's and never show here.
 * Dark-locked like the DJ pack and the press kit, so every reader sees the same
 * page whatever their own theme.
 */
export default async function BriefViewPage({ params }: PageProps) {
  const { token } = await params;
  const brief = await loadPublicBrief(token);

  if (!brief) {
    return (
      <BriefShell>
        <h1 className="font-display text-2xl">This link isn&rsquo;t available</h1>
        <p className="mt-2 text-sm text-[#929291]">
          It may have been turned off. Ask whoever sent it for a new link.
        </p>
      </BriefShell>
    );
  }

  const images = brief.references.filter((reference) => reference.kind === 'image');
  const links = brief.references.filter((reference) => reference.kind === 'link');
  const releaseDay = formatBriefDay(lagosDay(brief.releaseDate));

  return (
    <BriefShell footer>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#929291]">
        {brief.artistName ? `${brief.artistName} · ` : ''}Brief
      </p>
      <h1 className="mt-1.5 font-display text-[30px] leading-tight">{brief.title}</h1>
      <p className="mt-2 font-mono text-[11px] text-[rgba(242,242,240,0.45)]">
        {releaseDay ? `${releaseDay} · ` : ''}View only
      </p>

      {brief.idea.trim() ? (
        <section>
          <Label>Idea</Label>
          <p className="whitespace-pre-line text-[16px] leading-[1.55]">{brief.idea}</p>
        </section>
      ) : null}

      {brief.references.length > 0 ? (
        <section>
          <Label>References</Label>
          {images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {images.map((reference) => (
                <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer noopener nofollow" className="shrink-0">
                  <img
                    src={reference.url}
                    alt={reference.title || 'Reference image'}
                    loading="lazy"
                    className="h-24 w-24 rounded-xl border border-[rgba(242,242,240,0.08)] object-cover"
                  />
                </a>
              ))}
            </div>
          ) : null}
          {links.length > 0 ? (
            <ul className={`${LIST} ${images.length > 0 ? 'mt-2' : ''}`}>
              {links.map((reference) => (
                <li key={reference.id} className={`flex min-h-12 items-center gap-3 px-3.5 text-sm ${DIVIDER}`}>
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 rounded-md"
                    style={{ background: referenceColor(reference.url) }}
                  />
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer noopener nofollow"
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {referenceDisplayTitle(reference)}
                  </a>
                  <span className="shrink-0 font-mono text-[11px] text-[rgba(242,242,240,0.45)]">
                    {reference.source}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {brief.dates.length > 0 ? (
        <section>
          <Label>Dates</Label>
          <ul className={LIST}>
            {brief.dates.map((row) => (
              <li key={row.id} className={`flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm ${DIVIDER}`}>
                <span className={`min-w-0 truncate ${row.done ? 'line-through opacity-55' : ''}`}>{row.title}</span>
                <span className={`shrink-0 font-mono text-[12px] ${row.isRelease ? 'text-[#7fd99a]' : 'text-[#929291]'}`}>
                  {formatBriefDay(row.date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </BriefShell>
  );
}

const LIST = 'overflow-hidden rounded-2xl border border-[rgba(242,242,240,0.08)] bg-[#171719]';
const DIVIDER = 'border-t border-[rgba(242,242,240,0.06)] first:border-t-0';

function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2.5 mt-[26px] text-[12px] font-semibold text-[#929291]">{children}</h2>;
}

function BriefShell({ children, footer = false }: { children: React.ReactNode; footer?: boolean }) {
  return (
    <main className="min-h-dvh bg-[#0c0c0d] text-[#f2f2f0]">
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-10">{children}</div>
      {footer ? (
        <footer className="fixed inset-x-0 bottom-0 border-t border-[rgba(242,242,240,0.06)] bg-[#0c0c0d] py-3.5 text-center text-[12px] text-[rgba(242,242,240,0.45)]">
          Made with{' '}
          <a href="https://urganize.app" className="font-display text-[#7fd99a]">
            Urganize
          </a>
        </footer>
      ) : null}
    </main>
  );
}

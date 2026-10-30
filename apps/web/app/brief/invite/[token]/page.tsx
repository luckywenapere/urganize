/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { loadBriefGuestInvitePage } from '@/lib/release-brief-server';
import { formatBriefDay } from '@/lib/release-brief';

// An invite can be used or removed at any moment, so nothing here is static.
export const dynamic = 'force-dynamic';

// Sent to one person. Never indexed.
export const metadata: Metadata = {
  title: 'Brief',
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

/**
 * What a brief guest opens from WhatsApp or email (#897 phase 6; approved
 * mock docs/mocks/visual-brief "Shared link", and brief-share-person). The
 * brief and their part, readable before they join; Join takes them through
 * the normal invite and lands them on the rollout's brief. Unlike the view
 * link, this page follows the phone's light or dark setting.
 */
export default async function BriefGuestInvitePage({ params }: PageProps) {
  const { token } = await params;
  const page = await loadBriefGuestInvitePage(token);

  if (!page) {
    return (
      <Shell>
        <h1 className="bg-title">This link isn&rsquo;t available</h1>
        <p className="bg-muted mt-2">
          It may have been used already, or it has expired. If you joined, open Urganize. Otherwise ask whoever sent it
          for a new link.
        </p>
        <Link href="/auth" className="bg-button mt-6">
          Open Urganize
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="bg-muted text-[14px]">
        {page.sharedBy} shared the brief for {page.title} with you.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="bg-cover" style={{ background: page.palette[1] ?? page.palette[0] ?? undefined }}>
          {page.coverUrl ? <img src={page.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <p className="bg-eyebrow">{page.artistName || 'Rollout'}</p>
          <h1 className="bg-title truncate">{page.title}</h1>
          {page.releaseDate ? <p className="bg-eyebrow">Out {formatBriefDay(page.releaseDate)}</p> : null}
        </div>
      </div>

      {page.part.length ? (
        <section className="mt-6">
          <p className="bg-label">Your part</p>
          <ul className="bg-card mt-2">
            {page.part.map((piece) => (
              <li key={piece.id} className="bg-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{piece.title}</span>
                  {piece.spec ? <span className="bg-muted block truncate text-[13px]">{piece.spec}</span> : null}
                </span>
                {piece.due ? (
                  <span className="bg-due">
                    {piece.daysLeft !== null && piece.daysLeft >= 0 ? `${piece.daysLeft} days` : 'Due'}
                    <br />
                    {piece.due}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.headline || page.idea ? (
        <section className="mt-6">
          <p className="bg-label">The idea</p>
          {page.headline ? <h2 className="bg-headline mt-1.5">{page.headline}</h2> : null}
          {page.idea ? <p className="bg-muted mt-2 whitespace-pre-line text-[14.5px] leading-relaxed">{page.idea}</p> : null}
        </section>
      ) : null}

      {page.palette.length ? (
        <section className="mt-6">
          <p className="bg-label">Colour</p>
          <div className="mt-2 flex gap-1.5">
            {page.palette.map((hex) => (
              <span key={hex} className="h-9 flex-1 rounded-lg" style={{ background: hex }} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="bg-join">
        <Link href={page.joinPath} className="bg-button">
          Join to mark your part done
        </Link>
        <p className="bg-muted mt-2 text-center text-[12.5px]">Free for guests. You only see this rollout.</p>
      </div>
    </Shell>
  );
}

// The page's own colours, light by default and dark when the phone is: it is
// opened outside the app, where the app's theme setting is not known.
const STYLES = `
.bg-page { --bg:#f5f0e6; --card:#faf5ec; --line:rgba(26,22,17,.1); --text:#1a1611; --muted:#5a564f; --brand:#14643a; --on-brand:#f5f0e6; background:var(--bg); color:var(--text); }
@media (prefers-color-scheme: dark) {
  .bg-page { --bg:#0c0c0d; --card:rgba(255,255,255,.04); --line:rgba(255,255,255,.12); --text:#f2f2f0; --muted:rgba(242,242,240,.62); --brand:#7fd99a; --on-brand:#0c0c0d; }
}
.bg-muted { color:var(--muted); }
.bg-title { font-family:var(--font-display, Georgia, serif); font-size:26px; line-height:1.1; }
.bg-headline { font-family:var(--font-display, Georgia, serif); font-size:23px; line-height:1.15; }
.bg-eyebrow { font-family:ui-monospace, monospace; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
.bg-label { font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); }
.bg-cover { width:64px; height:64px; border-radius:10px; overflow:hidden; flex:none; background:var(--line); }
.bg-card { border:1px solid var(--line); background:var(--card); border-radius:14px; padding:2px 14px; }
.bg-row { display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid var(--line); }
.bg-row:last-child { border-bottom:0; }
.bg-due { text-align:right; font-family:ui-monospace, monospace; font-size:12px; color:var(--muted); flex:none; }
.bg-button { display:flex; align-items:center; justify-content:center; min-height:50px; border-radius:14px; background:var(--brand); color:var(--on-brand); font-weight:600; font-size:15px; }
.bg-join { position:sticky; bottom:0; margin-top:28px; padding:14px 0 22px; background:linear-gradient(to top, var(--bg) 78%, transparent); }
`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-page min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="mx-auto max-w-[480px] px-5 pt-8">{children}</div>
    </main>
  );
}

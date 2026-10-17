import type { Metadata } from 'next';
import { SHORT_LINE } from '@/lib/positioning';
import { notFound, redirect } from 'next/navigation';
import { isEpkFeatureEnabled, loadPublicEpk, resolveEpkSuccessorPath } from '@/lib/epk-server';

// The public press kit (URG-196). Server component, no auth: the unguessable
// share token is the access control, resolved by loadPublicEpk with the
// service-role client. force-dynamic because the kit is assembled live from
// release data on every request (that's the "stays in sync" guarantee) and
// the asset signed URLs must be minted fresh.
export const dynamic = 'force-dynamic';

// Brand palette (URG 001) via the dark-locked .epk-island vars in
// globals.css — the single place this feature's colors are defined. An EPK
// is a branded artifact sent to press, so every recipient sees the identical
// Bible screen-mode kit (ink ground, cream text, spring accent) regardless
// of any viewer theme state.
const INK = 'var(--epk-ground)';
const SURFACE = 'var(--epk-surface)';
const STROKE = 'var(--epk-border)';
const CREAM = 'var(--epk-text)';
const MUTED = 'var(--epk-text-muted)';
const FAINT = 'var(--epk-text-faint)';
const BRAND = 'var(--epk-accent)';

const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
};

function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const epk = await loadPublicEpk(token);
  if (!epk) {
    return { title: 'Press kit', robots: { index: false, follow: false } };
  }
  const heading = [epk.artistName, epk.title].filter(Boolean).join(' — ');
  return {
    title: `${heading} | Press kit`,
    description:
      epk.description ||
      `Press kit for ${heading}${epk.releaseDate ? `, out ${formatReleaseDate(epk.releaseDate)}` : ''}.`,
    // Kits are shared by link, never discovered by crawl — the token is the
    // only gate, so keep these URLs out of search indexes.
    robots: { index: false, follow: false },
  };
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b py-3" style={{ borderColor: STROKE }}>
      <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
        {label}
      </dt>
      <dd className="text-right text-sm" style={{ color: CREAM }}>
        {value}
      </dd>
    </div>
  );
}

export default async function PublicEpkPage({ params }: PageProps) {
  const { token } = await params;

  // The EPK is retired in favour of the standing per-artist press kit, but this
  // is the one page in the product a stranger may already hold a link to, so
  // nothing here breaks a link. Once that artist's kit is PUBLISHED the same
  // old link hands over to it; until then this keeps rendering exactly what it
  // rendered yesterday.
  //
  // A TEMPORARY redirect, deliberately, and NOT permanentRedirect's 308. A kit
  // can be taken back down, and a browser holding a cached 308 would keep
  // sending a journalist to a page that has gone back to a 404 with nothing we
  // could do about it. Same reasoning the release detail stub records for its
  // own 307.
  // Hidden 2026-10-17 (founder call): with NEXT_PUBLIC_FEATURE_EPK off (forced
  // in lib/cut-features.json) every EPK link is a 404 before any database read.
  // Only internal accounts ever made one, and none of their artists' kits is
  // published, so no outside reader loses a page. Rows are kept.
  if (!isEpkFeatureEnabled()) notFound();

  const successor = await resolveEpkSuccessorPath(token);
  if (successor) redirect(successor);

  const epk = await loadPublicEpk(token);
  if (!epk) notFound();

  const typeLabel = RELEASE_TYPE_LABELS[epk.releaseType] || epk.releaseType;
  const dateLabel = formatReleaseDate(epk.releaseDate);

  const metaRows: Array<{ label: string; value: string }> = [];
  if (dateLabel) metaRows.push({ label: 'Release date', value: dateLabel });
  metaRows.push({ label: 'Format', value: typeLabel });
  if (epk.genre) {
    metaRows.push({ label: 'Genre', value: epk.subgenre ? `${epk.genre} / ${epk.subgenre}` : epk.genre });
  }
  if (epk.labelName) metaRows.push({ label: 'Label', value: epk.labelName });
  if (epk.language) metaRows.push({ label: 'Language', value: epk.language });
  if (epk.explicit !== null) metaRows.push({ label: 'Explicit', value: epk.explicit ? 'Yes' : 'No' });

  return (
    <main className="epk-island min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <div className="mx-auto max-w-[720px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        {/* Kit eyebrow */}
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: FAINT }}>
          Press kit
        </p>

        {/* Cover art */}
        {epk.coverArtUrl ? (
          // Signed URL from a private bucket, minted per request — next/image
          // optimization would cache/proxy a URL that expires, so the plain
          // tag is deliberate here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={epk.coverArtUrl}
            alt={`${epk.title} cover art`}
            className="mt-8 aspect-square w-full max-w-[420px] object-cover"
            style={{ border: `1px solid ${STROKE}` }}
          />
        ) : null}

        {/* Artist + title */}
        <header className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em]" style={{ color: MUTED }}>
            {epk.artistName}
          </p>
          <h1 className="font-display mt-2 text-4xl font-medium leading-tight sm:text-5xl">
            {epk.title}
          </h1>
          {dateLabel ? (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em]" style={{ color: BRAND }}>
              {typeLabel} · Out {dateLabel}
            </p>
          ) : (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em]" style={{ color: BRAND }}>
              {typeLabel}
            </p>
          )}
        </header>

        {/* About */}
        {epk.description ? (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              About the release
            </h2>
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed" style={{ color: MUTED }}>
              {epk.description}
            </p>
          </section>
        ) : null}

        {/* Release details */}
        <section className="mt-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
            Release details
          </h2>
          <dl className="mt-3 border-t" style={{ borderColor: STROKE }}>
            {metaRows.map((row) => (
              <MetaRow key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </section>

        {/* Press photos */}
        {epk.promoImageUrls.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              Press photos
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {epk.promoImageUrls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  style={{ backgroundColor: SURFACE }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${epk.artistName} press photo ${index + 1}`}
                    className="aspect-square w-full object-cover"
                    style={{ border: `1px solid ${STROKE}` }}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: FAINT }}>
              Click a photo to open full size
            </p>
          </section>
        ) : null}

        {/* Urganize branding — the distribution loop. Every kit lands in
            front of music-industry people; the footer is the product's
            signature on the artifact. UTM params (2026-07-31) so the
            marketing site's analytics can show this loop actually driving
            traffic — no change to the destination, just attribution. */}
        <footer className="mt-14 border-t pt-6" style={{ borderColor: STROKE }}>
          <a
            href="https://urganize.app?utm_source=epk&utm_medium=press-kit"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: FAINT }}
          >
            Made with <span style={{ color: BRAND }}>Urganize</span>. {SHORT_LINE}
          </a>
        </footer>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  embargoNotice,
  isKitIndexable,
  kitDescription,
  kitTagline,
} from '@/lib/press-kit-public';
import { loadPublicPressKit } from '@/lib/press-kit-public-server';
import { usageRightLabel } from '@/lib/press-photo';
import { PRESS_KIT_SECTION_LABELS } from '@/lib/press-kits';
import type { PressKitSectionContent, PressKitSectionKey } from '@/types/press-kits';
import { KitViewBeacon } from './KitViewBeacon';

/**
 * The public press kit at /k/{slug}.
 *
 * Server component, no auth. A published slug is the whole of the access
 * control, and every failure resolves to the same 404 so the page cannot tell
 * a reader whether a kit exists but is unpublished.
 *
 * force-dynamic because the photo signed URLs have to be minted fresh, and
 * because publishing has to take effect at once rather than when a cache
 * decides.
 *
 * The palette comes from the dark-locked .kit-island vars in globals.css,
 * which is also where the print rules redefine them for paper. Nothing here
 * carries a print specific colour.
 */
export const dynamic = 'force-dynamic';

const GROUND = 'var(--kit-ground)';
const SURFACE = 'var(--kit-surface)';
const STROKE = 'var(--kit-border)';
const CREAM = 'var(--kit-text)';
const MUTED = 'var(--kit-text-muted)';
const FAINT = 'var(--kit-text-faint)';
const ACCENT = 'var(--kit-accent)';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const kit = await loadPublicPressKit(slug);
  if (!kit) {
    return { title: 'Press kit', robots: { index: false, follow: false } };
  }

  const title = `${kit.artistName}: press kit`;
  const description = kitDescription(kit.artistName, kit.byKey.header || {}, kit.byKey.bios || {});
  // The ONE indexable public page in this product, and only when somebody has
  // deliberately picked the listed setting. Everything else stays out of
  // search, which is what keeps the three visibility values meaningfully
  // different from each other.
  const index = isKitIndexable(kit.visibility);

  return {
    title,
    description,
    robots: { index, follow: index },
    openGraph: {
      title,
      description,
      type: 'profile',
      images: kit.photos[0]?.url ? [kit.photos[0].url] : undefined,
    },
    twitter: {
      card: kit.photos[0]?.url ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  };
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[]) : [];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="kit-section mt-12">
      <h2
        className="font-mono text-[11px] uppercase tracking-[0.18em]"
        style={{ color: FAINT }}
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A link that is safe to render from content somebody typed. */
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  const trimmed = href.trim();
  const safe = /^https?:\/\//i.test(trimmed);
  if (!safe) return <span style={{ color: MUTED }}>{children}</span>;
  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline underline-offset-4"
      style={{ color: ACCENT }}
    >
      {children}
    </a>
  );
}

function Bios({ content }: { content: PressKitSectionContent }) {
  const lengths: { key: string; label: string }[] = [
    { key: 'short', label: 'Short' },
    { key: 'medium', label: 'Medium' },
    { key: 'long', label: 'Long' },
  ];
  const available = lengths.filter((entry) => str(content[entry.key]));
  if (available.length === 0) return null;

  return (
    <div className="space-y-6">
      {available.map((entry) => (
        <div key={entry.key}>
          {available.length > 1 ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: FAINT }}>
              {entry.label}
            </p>
          ) : null}
          <div className="mt-1 space-y-3 text-[15px] leading-relaxed" style={{ color: CREAM }}>
            {str(content[entry.key])
              .split(/\n{2,}/)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionBody({
  section,
  content,
}: {
  section: PressKitSectionKey;
  content: PressKitSectionContent;
}) {
  if (section === 'bios') return <Bios content={content} />;

  if (section === 'latest_release') {
    const title = str(content.title);
    const hook = str(content.hook);
    const date = str(content.releaseDate);
    return (
      <div className="space-y-2">
        {title ? (
          <p className="font-display text-xl" style={{ color: CREAM }}>
            {title}
          </p>
        ) : null}
        {date ? (
          <p className="font-mono text-xs" style={{ color: FAINT }}>
            {date}
          </p>
        ) : null}
        {hook ? (
          <p className="text-[15px] leading-relaxed" style={{ color: MUTED }}>
            {hook}
          </p>
        ) : null}
      </div>
    );
  }

  if (section === 'music') {
    const tracks = rows(content.tracks);
    if (tracks.length === 0) return null;
    return (
      <ul className="space-y-1.5">
        {tracks.map((track, index) => (
          <li key={index} className="text-[15px]" style={{ color: CREAM }}>
            {str(track.title) || str(track.name)}
            {str(track.releaseTitle) ? (
              <span style={{ color: FAINT }}> · {str(track.releaseTitle)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'video') {
    const videos = rows(content.videos);
    if (videos.length === 0) return null;
    return (
      <ul className="space-y-1.5">
        {videos.map((video, index) => (
          <li key={index} className="text-[15px]" style={{ color: CREAM }}>
            <SafeLink href={str(video.url)}>{str(video.title) || str(video.url)}</SafeLink>
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'credits') {
    const credits = rows(content.credits);
    if (credits.length === 0) return null;
    return (
      <ul className="space-y-2">
        {credits.map((credit, index) => (
          <li key={index} className="text-[15px]" style={{ color: CREAM }}>
            {str(credit.stageName) || str(credit.legalName)}
            {str(credit.roles) ? (
              <span style={{ color: FAINT }}> · {str(credit.roles)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'numbers') {
    const stats = rows(content.stats);
    if (stats.length === 0) return null;
    return (
      <ul className="grid gap-4 sm:grid-cols-2">
        {stats.map((stat, index) => (
          <li key={index}>
            <p className="font-display text-2xl" style={{ color: CREAM }}>
              {str(stat.value)}
            </p>
            <p className="text-sm" style={{ color: MUTED }}>
              {str(stat.label)}
            </p>
            {/* The date is printed beside every figure, always. A number with
                no date attached is the kind of claim this product refuses to
                make on somebody's behalf. */}
            {str(stat.asOf) ? (
              <p className="font-mono text-[10px]" style={{ color: FAINT }}>
                as of {str(stat.asOf)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'press') {
    const coverage = rows(content.coverage);
    if (coverage.length === 0) return null;
    return (
      <ul className="space-y-2">
        {coverage.map((entry, index) => (
          <li key={index} className="text-[15px]" style={{ color: CREAM }}>
            <SafeLink href={str(entry.url)}>{str(entry.title) || str(entry.outlet)}</SafeLink>
            {str(entry.outlet) && str(entry.title) ? (
              <span style={{ color: FAINT }}> · {str(entry.outlet)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'live') {
    const shows = rows(content.shows);
    if (shows.length === 0) return null;
    return (
      <ul className="space-y-1.5">
        {shows.map((show, index) => (
          <li key={index} className="text-[15px]" style={{ color: CREAM }}>
            {str(show.title) || str(show.venue)}
            {str(show.date) ? <span style={{ color: FAINT }}> · {str(show.date)}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'contact') {
    const contacts = rows(content.contacts);
    if (contacts.length === 0) return null;
    return (
      <ul className="space-y-3">
        {contacts.map((contact, index) => (
          <li key={index}>
            <p className="text-[15px]" style={{ color: CREAM }}>
              {str(contact.name)}
              {str(contact.role) ? (
                <span style={{ color: FAINT }}> · {str(contact.role)}</span>
              ) : null}
            </p>
            {str(contact.email) ? (
              <a
                href={`mailto:${str(contact.email)}`}
                className="text-sm underline underline-offset-4"
                style={{ color: ACCENT }}
              >
                {str(contact.email)}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'links') {
    const links = rows(content.links);
    if (links.length === 0) return null;
    return (
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {links.map((link, index) => (
          <li key={index} className="text-[15px]">
            <SafeLink href={str(link.url)}>{str(link.label) || str(link.url)}</SafeLink>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

export default async function PublicPressKitPage({ params }: PageProps) {
  const { slug } = await params;
  const kit = await loadPublicPressKit(slug);
  if (!kit) notFound();

  const header = kit.byKey.header || {};
  const tagline = kitTagline(header);
  const genreTags = str(header.genreTags);
  const embargo = embargoNotice(kit.embargoDate);
  const body = kit.sections.filter((entry) => entry.section !== 'header');

  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND }}>
      <KitViewBeacon slug={kit.slug} />

      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
            Press kit
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl" style={{ color: CREAM }}>
            {kit.artistName}
          </h1>
          {tagline ? (
            <p className="mt-3 text-[15px]" style={{ color: MUTED }}>
              {tagline}
            </p>
          ) : null}
          {genreTags ? (
            <p className="mt-1 font-mono text-xs" style={{ color: FAINT }}>
              {genreTags}
            </p>
          ) : null}
          {kit.availableForInterview ? (
            <p
              className="mt-4 inline-block rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em]"
              style={{ backgroundColor: 'var(--kit-fill)', color: CREAM }}
            >
              Available for interview
            </p>
          ) : null}
        </header>

        {embargo ? (
          <p
            className="mt-8 rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: STROKE, backgroundColor: SURFACE, color: CREAM }}
          >
            {embargo}
          </p>
        ) : null}

        {kit.photos.length > 0 ? (
          <Section title={PRESS_KIT_SECTION_LABELS.assets}>
            <div className="grid gap-4 sm:grid-cols-2">
              {kit.photos.map((photo) => (
                <figure key={photo.id}>
                  {/* A signed Storage URL with a one hour life. next/image
                      would proxy and cache it past its own expiry. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`${kit.artistName} press photo`}
                    loading="lazy"
                    className="w-full rounded-lg"
                    style={{ backgroundColor: SURFACE }}
                  />
                  <figcaption className="mt-2 space-y-0.5">
                    {photo.photographerCredit ? (
                      <p className="text-xs" style={{ color: MUTED }}>
                        Photo by {photo.photographerCredit}
                      </p>
                    ) : null}
                    {photo.usageRights ? (
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: FAINT }}>
                        {usageRightLabel(photo.usageRights)}
                      </p>
                    ) : null}
                    {/* A plain link, so it can be right clicked and so a
                        browser with no scripting still hands over the file. */}
                    <a
                      href={`/api/k/${kit.slug}/photos/${photo.id}/download`}
                      className="kit-print-hide inline-block text-xs underline underline-offset-4"
                      style={{ color: ACCENT }}
                    >
                      Download full size
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Section>
        ) : null}

        {body.map((entry) => (
          <Section key={entry.section} title={PRESS_KIT_SECTION_LABELS[entry.section]}>
            <SectionBody section={entry.section} content={entry.content} />
          </Section>
        ))}

        <footer className="mt-16 border-t pt-6" style={{ borderColor: STROKE }}>
          <p className="font-mono text-[11px]" style={{ color: FAINT }}>
            Delivered with Urganize
          </p>
        </footer>
      </main>
    </div>
  );
}

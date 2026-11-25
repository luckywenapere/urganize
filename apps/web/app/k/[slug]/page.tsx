import { Fragment } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  embargoNotice,
  isKitIndexable,
  kitDescription,
  kitTagline,
  PUBLIC_SECTION_ORDER,
  resolveKitLink,
} from '@/lib/press-kit-public';
import { loadPublicPressKit, loadPublicReleaseStory, type PublicReleaseStory } from '@/lib/press-kit-public-server';
import { usageRightLabel } from '@/lib/press-photo';
import { PRESS_KIT_SECTION_LABELS } from '@/lib/press-kits';
import type { PressKitSectionContent, PressKitSectionKey } from '@/types/press-kits';
import { formatKitDate, firstContactEmail, kitTextFile } from '@/lib/press-kit-text';
import { KitViewBeacon } from './KitViewBeacon';
import { BioSwitch, CopyButton, DownloadKitButton, EmailButton } from './KitActions';
import { availableBios } from '@/lib/public-pages-desktop';
import { ThumbImage } from '@/components/shared/ThumbImage';

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

type PageProps = {
  params: Promise<{ slug: string }>;
  /** `?r=` names the rollout whose story sits on top (the merged kit). */
  searchParams?: Promise<{ r?: string | string[] }>;
};

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

/**
 * The right column's order on a computer (#1232): the mock's bio, latest
 * release, photos, numbers, then the rest, with Contact last because the email
 * is already on the left. A phone keeps PUBLIC_SECTION_ORDER.
 */
const DESKTOP_ORDER: Partial<Record<PressKitSectionKey, string>> = {
  bios: 'lg:order-1',
  latest_release: 'lg:order-2',
  assets: 'lg:order-3',
  numbers: 'lg:order-4',
  contact: 'lg:order-6',
};
const desktopOrder = (key: PressKitSectionKey): string => DESKTOP_ORDER[key] ?? 'lg:order-5';

/** On a computer each section is a card with a plain-word heading (#1232). */
const DESKTOP_CARD =
  'lg:mt-4 lg:rounded-2xl lg:border lg:border-[color:var(--kit-border)] lg:bg-[color:var(--kit-surface)] lg:p-6';

function Section({
  title,
  action,
  desktopTitle = true,
  className = '',
  children,
}: {
  title: string;
  /** Beside the heading on a computer only. */
  action?: React.ReactNode;
  /** False when the body draws its own heading on a computer (the bio switch). */
  desktopTitle?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`kit-section mt-12 ${DESKTOP_CARD} ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${desktopTitle ? '' : 'lg:hidden'}`}>
        <h2
          className="font-mono text-[11px] uppercase tracking-[0.18em] lg:font-sans lg:text-[13px] lg:font-semibold lg:normal-case lg:tracking-normal lg:text-[color:var(--kit-text-muted)]"
          style={{ color: FAINT }}
        >
          {title}
        </h2>
        {action ? <div className="hidden lg:block">{action}</div> : null}
      </div>
      <div className={desktopTitle ? 'mt-3' : 'mt-3 lg:mt-0'}>{children}</div>
    </section>
  );
}

/** A link that is safe to render from content somebody typed. */
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  const trimmed = href.trim();
  const safe = /^https?:\/\//i.test(trimmed);
  if (!safe) {
    return (
      <span className="break-words" style={{ color: MUTED, overflowWrap: 'anywhere' }}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="break-words underline underline-offset-4"
      style={{ color: ACCENT, overflowWrap: 'anywhere' }}
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
    <>
      {/* A computer: one bio with a Short, Medium, Long switch (#1232). */}
      <div className="hidden lg:block">
        <BioSwitch bios={availableBios(content)} title={PRESS_KIT_SECTION_LABELS.bios} />
      </div>
    <div className="space-y-6 lg:hidden">
      {available.map((entry) => (
        <div key={entry.key}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: FAINT }}>
              {available.length > 1 ? entry.label : 'Bio'}
            </p>
            <CopyButton text={str(content[entry.key])} label="Copy" />
          </div>
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
    </>
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
    const story = str(content.story);
    const date = formatKitDate(content.releaseDate);
    return (
      <div className="space-y-2">
        {title ? (
          <p className="font-display text-xl" style={{ color: CREAM }}>
            {title}
          </p>
        ) : null}
        {date ? (
          <p className="font-mono text-xs lg:font-sans lg:text-[13px]" style={{ color: FAINT }}>
            {date}
          </p>
        ) : null}
        {hook ? (
          <p className="text-[15px] leading-relaxed" style={{ color: MUTED }}>
            {hook}
          </p>
        ) : null}
        {story ? (
          <p
            className="whitespace-pre-line text-[15px] leading-relaxed"
            style={{ color: MUTED }}
          >
            {story}
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
            {(() => {
              const link = resolveKitLink({ label: video.title, url: video.url });
              return link ? <SafeLink href={link.href}>{link.label}</SafeLink> : str(video.title);
            })()}
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
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-2.5">
        {stats.map((stat, index) => (
          <li key={index} className="lg:rounded-xl lg:bg-[color:var(--kit-ground)] lg:p-3.5">
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
              <p className="font-mono text-[10px] lg:mt-0.5 lg:font-sans lg:text-[12px]" style={{ color: FAINT }}>
                as of {formatKitDate(stat.asOf)}
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
            {(() => {
              const text = str(entry.title) || str(entry.outlet);
              const link = resolveKitLink({ label: text, url: entry.url });
              return link ? <SafeLink href={link.href}>{text || link.label}</SafeLink> : text;
            })()}
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
            {formatKitDate(show.date) ? (
              <span style={{ color: FAINT }}> · {formatKitDate(show.date)}</span>
            ) : null}
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
              <div className="flex flex-wrap items-center gap-x-3">
                <a
                  href={`mailto:${str(contact.email)}`}
                  className="break-all text-sm underline underline-offset-4"
                  style={{ color: ACCENT }}
                >
                  {str(contact.email)}
                </a>
                <CopyButton text={str(contact.email)} label="Copy email" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section === 'links') {
    const links = rows(content.links)
      .map((entry) => resolveKitLink(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (links.length === 0) return null;
    return (
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {links.map((link, index) => (
          <li key={index} className="min-w-0 max-w-full text-[15px]">
            <SafeLink href={link.href}>{link.label}</SafeLink>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

/**
 * The rollout on top of the artist kit (2026-10-16, Pitch this! as one place):
 * cover, title, date, the story and who made it. Rendered only when the
 * release belongs to this artist and has something to say; otherwise the page
 * is the plain artist kit every older link already points at.
 */
function ReleaseBlock({ release, artistName }: { release: PublicReleaseStory; artistName: string }) {
  const date = formatKitDate(release.releaseDate || '');
  return (
    <section
      aria-label={release.title || 'New release'}
      className="mb-14 border-b pb-12 lg:col-start-2 lg:row-start-1 lg:mb-4 lg:rounded-2xl lg:border lg:bg-[color:var(--kit-surface)] lg:p-6"
      style={{ borderColor: STROKE }}
    >
      <div className="flex items-center gap-5">
        {release.coverUrl ? (
          // Signed with a short life; next/image would cache it past that.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={release.coverUrl}
            alt={`${release.title} cover art`}
            className="h-28 w-28 shrink-0 rounded-xl object-cover sm:h-32 sm:w-32"
            style={{ backgroundColor: SURFACE }}
          />
        ) : null}
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] lg:font-sans lg:text-[13px] lg:font-semibold lg:normal-case lg:tracking-normal" style={{ color: FAINT }}>
            {date ? `Out ${date}` : 'New release'}
          </p>
          <p
            className="mt-2 break-words font-display text-3xl sm:text-4xl"
            style={{ color: CREAM, overflowWrap: 'anywhere', textWrap: 'balance' }}
          >
            {release.title}
          </p>
          <p className="mt-1 text-[15px]" style={{ color: MUTED }}>
            {artistName}
          </p>
        </div>
      </div>
      {release.story ? (
        <p className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: CREAM }}>
          {release.story}
        </p>
      ) : null}
      {release.credits.length > 0 ? (
        <div className="mt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] lg:font-sans lg:text-[13px] lg:font-semibold lg:normal-case lg:tracking-normal" style={{ color: FAINT }}>
            Who made it
          </p>
          <ul className="mt-3 space-y-1.5">
            {release.credits.map((credit, index) => (
              <li key={index} className="text-[15px]" style={{ color: CREAM }}>
                {credit.name}
                {credit.role ? <span style={{ color: FAINT }}> · {credit.role}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default async function PublicPressKitPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const kit = await loadPublicPressKit(slug);
  if (!kit) notFound();
  const rawRelease = (await searchParams)?.r;
  const release = await loadPublicReleaseStory(kit, Array.isArray(rawRelease) ? rawRelease[0] : rawRelease);

  const header = kit.byKey.header || {};
  const tagline = kitTagline(header);
  const genreTags = str(header.genreTags);
  const embargo = embargoNotice(kit.embargoDate);
  const body = kit.sections.filter((entry) => entry.section !== 'header');
  const contactEmail = firstContactEmail(kit.byKey.contact);
  const textFile = kitTextFile({
    artistName: kit.artistName,
    header,
    bios: kit.byKey.bios || {},
    contact: kit.byKey.contact || {},
    links: kit.byKey.links || {},
  });

  const photosBlock = kit.photos.length > 0 ? (
            <Section
              title={PRESS_KIT_SECTION_LABELS.assets}
              className={desktopOrder('assets')}
              action={
                <DownloadKitButton
                  variant="link"
                  artistSlug={kit.slug}
                  textFile={textFile}
                  photos={kit.photos.map((photo) => ({ url: photo.url, fileName: photo.fileName }))}
                />
              }
            >
              <div className="kit-photos grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {kit.photos.map((photo) => (
                  <figure key={photo.id}>
                    {/* A signed Storage URL with a one hour life. next/image
                        would proxy and cache it past its own expiry. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={`${kit.artistName} press photo`}
                      loading="lazy"
                      className="w-full rounded-xl lg:aspect-[4/5] lg:object-cover"
                      style={{ backgroundColor: SURFACE }}
                    />
                    <figcaption className="mt-2 space-y-0.5">
                      {photo.photographerCredit ? (
                        <p className="text-xs" style={{ color: MUTED }}>
                          Photo by {photo.photographerCredit}
                        </p>
                      ) : null}
                      {photo.usageRights ? (
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] lg:font-sans lg:text-[12px] lg:normal-case lg:tracking-normal" style={{ color: FAINT }}>
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
          ) : null;

  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND }}>
      <KitViewBeacon slug={kit.slug} />

      {/* A computer: who, how to reach them and the download stay on the left
          while the reader scrolls the right (#1232). A phone keeps one column. */}
      <div
        className="kit-print-hide hidden h-16 items-center justify-between border-b px-10 lg:flex"
        style={{ borderColor: STROKE }}
      >
        <a href="https://urganize.app" className="font-display text-[20px]" style={{ color: ACCENT }}>
          Urganize
        </a>
        <span className="text-[13px]" style={{ color: MUTED }}>
          Press kit
        </span>
      </div>

      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8 lg:grid lg:max-w-[1120px] lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:px-10 lg:py-10">
        {release ? <ReleaseBlock release={release} artistName={kit.artistName} /> : null}
        <aside className="lg:sticky lg:top-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
        <header>
          {kit.artistPhotoUrl ? (
            // The artist's roster face, from its 384px copy. A plain img (in
            // ThumbImage): the url is signed with a short life, and next/image
            // would cache it past that. Hidden until decoded, then faded in
            // over the surface circle: never half painted.
            <span
              className="mb-6 block h-24 w-24 overflow-hidden rounded-full lg:mb-4 lg:aspect-[4/5] lg:h-auto lg:w-full lg:rounded-2xl"
              style={{ backgroundColor: SURFACE }}
            >
              <ThumbImage src={kit.artistPhotoUrl} width={96} height={96} className="block h-full w-full object-cover" />
            </span>
          ) : null}
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] lg:hidden" style={{ color: FAINT }}>
            Press kit
          </p>
          <h1
            className="mt-2 break-words font-display text-4xl sm:text-5xl lg:mt-0 lg:text-[34px] lg:leading-[1.15]"
            style={{ color: CREAM, overflowWrap: 'anywhere', textWrap: 'balance' }}
          >
            {kit.artistName}
            {kit.verified ? (
              <span
                role="img"
                aria-label="Verified artist"
                title="Verified artist"
                className="ml-3 inline-grid h-7 w-7 place-items-center rounded-full align-middle"
                style={{ background: '#7fd09c', color: '#0d120e' }}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 10.5l3.2 3.2L15 6.8" />
                </svg>
              </span>
            ) : null}
          </h1>
          {tagline ? (
            <p className="mt-3 text-[15px]" style={{ color: MUTED }}>
              {tagline}
            </p>
          ) : null}
          {genreTags ? (
            <p className="mt-1 font-mono text-xs lg:font-sans lg:text-[13px]" style={{ color: FAINT }}>
              {genreTags}
            </p>
          ) : null}
          {kit.availableForInterview ? (
            <p className="mt-4 inline-flex items-center rounded-full bg-[color:var(--kit-fill)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--kit-text)] lg:mt-3 lg:bg-transparent lg:px-0 lg:py-0 lg:font-sans lg:text-[13px] lg:font-semibold lg:normal-case lg:tracking-normal lg:text-[color:var(--kit-accent)]">
              <span
                aria-hidden="true"
                className="mr-1.5 hidden h-1.5 w-1.5 rounded-full bg-[color:var(--kit-accent)] lg:inline-block"
              />
              Available for interview
            </p>
          ) : null}
        </header>

        <div className="kit-print-hide mt-8 flex flex-wrap items-start gap-3 lg:mt-6 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-2.5 lg:[&_a]:w-full lg:[&_a]:justify-center lg:[&_button]:w-full lg:[&_button]:justify-center">
          {contactEmail ? <EmailButton email={contactEmail} artistName={kit.artistName} /> : null}
          <DownloadKitButton
            artistSlug={kit.slug}
            textFile={textFile}
            photos={kit.photos.map((photo) => ({ url: photo.url, fileName: photo.fileName }))}
          />
        </div>
        </aside>

        {/* Flex on a computer so the cards follow DESKTOP_ORDER. The -mt cancels the first card's margin. */}
        <div className="lg:col-start-2 lg:row-start-2 lg:-mt-4 lg:flex lg:flex-col">
        {embargo ? (
          <p
            className="mt-8 rounded-xl border px-4 py-3 text-sm lg:mt-4"
            style={{ borderColor: STROKE, backgroundColor: SURFACE, color: CREAM }}
          >
            {embargo}
          </p>
        ) : null}

        {PUBLIC_SECTION_ORDER.map((key) => {
          if (key === 'header') return null;
          if (key === 'assets') {
            return <Fragment key="assets">{photosBlock}</Fragment>;
          }
          const entry = body.find((candidate) => candidate.section === key);
          if (!entry) return null;
          if (key === 'bios' && availableBios(entry.content).length === 0) return null;
          return (
            <Section key={key} title={PRESS_KIT_SECTION_LABELS[key]} desktopTitle={key !== 'bios'}
              className={desktopOrder(key)}
            >
              <SectionBody section={key} content={entry.content} />
            </Section>
          );
        })}

        {body.length === 0 && kit.photos.length === 0 ? (
          <p className="mt-12 text-sm" style={{ color: MUTED }}>
            The team is still putting this kit together. Check back soon.
          </p>
        ) : null}
        </div>

        <footer className="mt-16 border-t pt-6 lg:col-span-2 lg:col-start-1 lg:row-start-3" style={{ borderColor: STROKE }}>
          <p className="font-mono text-[11px]" style={{ color: FAINT }}>
            Delivered with Urganize
          </p>
        </footer>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { PageDawn } from "../components/marketing/PageDawn";
import {
  CURRENT_VERSION,
  RELEASE_TAGS,
  publicChangelog,
  releaseTag,
  type Release,
} from "../../content/changelog";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PRIMARY_CTA } from "@/lib/app-urls";
import { ChangelogFilter } from "./ChangelogFilter";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";

export const metadata: Metadata = buildPageMetadata({
  title: "What's new",
  description: `What's new in Urganize, newest first. ${CORE_LINE}`,
  path: "/changelog",
  // Kept out of search so the homepage's sitelinks stay commercial
  // (Features / Pricing / For executives / For managers). The page stays public
  // and footer-linked — it just never competes as a search result.
  noIndex: true,
});

// /changelog, PostHog-style (2026-10-19, URG-388). The ledger stays
// version-shaped (packages/changelog); this page reads it as features:
//   - grouped by month, newest first, on a quiet timeline rail;
//   - a feature release (it carries a `title`, every x.y.0 does) is an entry:
//     tag · date · version as quiet meta, the title, then what it does for you;
//   - the month's patch releases fold into one "smaller improvements" group,
//     an entry's second and later highlights into "N more details", and
//     older months into "Show N updates";
//   - `listed: false` entries (site copy, metadata, internal monitoring) are
//     left off. The filter chips set data-filter on the list and the <style>
//     below hides what does not match, so no data is shipped twice.
const LIST_ID = "changelog-list";
// A titled entry may carry one still of the screen it changed (#967): the
// files are named by version in public/images/changelog/, light and dark,
// desktop and phone (see `siteStill` in packages/changelog). The phone drawing
// shows below sm; ResponsiveProductShot picks one per theme.
const stillPath = (version: string, variant: string) =>
  `/images/changelog/${version}${variant}.webp`;
// The newest month reads in full, and the next ones too until a dozen
// features are showing (so the 1st of a month never opens on one entry);
// older months fold behind "Show N updates".
const OPEN_FEATURES = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

type Month = {
  key: string;
  label: string;
  featured: Release[];
  smaller: Release[];
};

function monthLabel(date: string): string {
  const m = /^([A-Za-z]+) \d{1,2}, (\d{4})$/.exec(date.trim());
  return m ? `${m[1]} ${m[2]}` : date;
}

function shortDate(date: string): string {
  const m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), \d{4}$/.exec(date.trim());
  return m ? `${m[1]} ${m[2]}` : date;
}

function groupByMonth(releases: Release[]): Month[] {
  const months: Month[] = [];
  for (const release of releases) {
    const label = monthLabel(release.date);
    let month = months[months.length - 1];
    if (!month || month.label !== label) {
      month = { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, featured: [], smaller: [] };
      months.push(month);
    }
    (release.title ? month.featured : month.smaller).push(release);
  }
  return months;
}

function tagsIn(releases: Release[]): string {
  return Array.from(new Set(releases.map(releaseTag))).join(" ");
}

function countBy(releases: Release[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const release of releases) {
    const tag = releaseTag(release);
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

// The hero counts features (titled entries) shipped in the last 30 days, so
// the number matches what the page shows once housekeeping and patch notes
// are unlisted (2026-10-19 curation).
function recentFeatures(releases: Release[]): number {
  const cutoff = Date.now() - 30 * DAY_MS;
  return releases.filter((release) => {
    if (!release.title) return false;
    const shipped = new Date(release.date).getTime();
    return Number.isFinite(shipped) && shipped >= cutoff;
  }).length;
}

// One rule set per tag, generated from RELEASE_TAGS so a new tag can never be
// left unfilterable. Smaller-improvement counts swap via data-* + attr().
const slug = (tag: string) => tag.toLowerCase();
const filterCss = RELEASE_TAGS.map((tag) => {
  const f = `#${LIST_ID}[data-filter="${tag}"]`;
  return [
    `${f} [data-tag]:not([data-tag="${tag}"]){display:none}`,
    `${f} [data-tags]:not([data-tags~="${tag}"]){display:none}`,
    `${f} .changelog-count::before{content:attr(data-n-${slug(tag)})}`,
  ].join("");
}).join("");

function Entry({ release }: { release: Release }) {
  const [lead, ...rest] = release.highlights;
  const tag = releaseTag(release);
  return (
    <article data-tag={tag} className="changelog-entry relative pl-6 sm:pl-8">
      <span aria-hidden="true" className="changelog-dot" />
      <p className="changelog-meta">
        <span className="text-[var(--marketing-text)]">{tag}</span>
        <span aria-hidden="true"> · </span>
        <time>{shortDate(release.date)}</time>
        <span aria-hidden="true"> · </span>
        <span>v{release.version}</span>
      </p>
      <h3 className="mt-2 text-[1.375rem] leading-[1.2] sm:text-[1.5rem]">
        {release.title}
      </h3>
      {lead ? (
        <p className="mt-2 max-w-[38rem] leading-7 text-[var(--marketing-text-muted)]">
          {lead}
        </p>
      ) : null}
      {release.siteStill ? (
        <div className="mt-5 max-w-[334px] overflow-hidden rounded-[14px] sm:max-w-[608px] sm:rounded-2xl">
          <ResponsiveProductShot
            desktop={{
              light: stillPath(release.version, ""),
              dark: stillPath(release.version, "-dark"),
              width: release.siteStill.width,
              height: release.siteStill.height,
            }}
            phone={{
              light: stillPath(release.version, "-phone"),
              dark: stillPath(release.version, "-phone-dark"),
              width: release.siteStill.phoneWidth,
              height: release.siteStill.phoneHeight,
            }}
            alt={release.siteStill.alt}
            sizes="608px"
            className="h-auto w-full"
            fetchPriority="auto"
          />
        </div>
      ) : null}
      {rest.length > 0 ? (
        <details className="changelog-extra mt-1 max-w-[38rem]">
          <summary className="changelog-extra-summary">
            {rest.length === 1 ? "1 more detail" : `${rest.length} more details`}
          </summary>
          <ul className="mt-2 space-y-1.5 text-[0.9375rem] leading-6 text-[var(--marketing-text-muted)]">
            {rest.map((line) => (
              <li key={line} className="changelog-more">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

// A count that follows the filter: the label is the ::before of
// .changelog-count, read from data-n-all or data-n-<tag> (see filterCss), and
// is written out in full here so "1 update" never reads "1 updates".
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function Count({ releases, noun }: { releases: Release[]; noun: string }) {
  const counts = countBy(releases);
  const nAttrs = Object.fromEntries(
    RELEASE_TAGS.map((tag) => [`data-n-${slug(tag)}`, plural(counts[tag] ?? 0, noun)]),
  );
  return <span className="changelog-count" data-n-all={plural(releases.length, noun)} {...nAttrs} />;
}

function Smaller({ releases }: { releases: Release[] }) {
  return (
    <details data-tags={tagsIn(releases)} className="changelog-smaller relative pl-6 sm:pl-8">
      <span aria-hidden="true" className="changelog-dot changelog-dot-small" />
      <summary className="changelog-summary">
        <Count releases={releases} noun="smaller improvement" />
      </summary>
      <ul className="mt-4 space-y-4">
        {releases.map((release) => (
          <li key={release.version} data-tag={releaseTag(release)} className="max-w-[38rem]">
            <p className="changelog-meta">
              <span>{releaseTag(release)}</span>
              <span aria-hidden="true"> · </span>
              <time>{shortDate(release.date)}</time>
              <span aria-hidden="true"> · </span>
              <span>v{release.version}</span>
            </p>
            {release.highlights.map((line) => (
              <p key={line} className="mt-1 text-[0.9375rem] leading-6 text-[var(--marketing-text-muted)]">
                {line}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

function MonthBody({ month }: { month: Month }) {
  return (
    <div className="changelog-rail space-y-10">
      {month.featured.map((release) => (
        <Entry key={release.version} release={release} />
      ))}
      {month.smaller.length > 0 ? <Smaller releases={month.smaller} /> : null}
    </div>
  );
}

export default function ChangelogPage() {
  const months = groupByMonth(publicChangelog);
  // Running total of featured items per month, without reassigning a local
  // during render (react-hooks/immutability). Same result as the old loop.
  const runningTotals = months.reduce<number[]>(
    (totals, month) => [...totals, (totals[totals.length - 1] ?? 0) + month.featured.length],
    [],
  );
  const openMonths = runningTotals.findIndex((total) => total >= OPEN_FEATURES);
  const openCount = openMonths === -1 ? months.length : openMonths + 1;
  const recent = recentFeatures(publicChangelog);

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />
      <style>{filterCss}</style>

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-5xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Changelog · v{CURRENT_VERSION}
            </p>
            <h1 className="mt-6 max-w-[40rem] text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              What&apos;s new in Urganize
            </h1>
            <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
              {recent >= 4
                ? `${recent} new features in the last 30 days, newest first.`
                : "Every update, newest first."}
            </p>
          </PageDawn>

          <div className="mt-10">
            <ChangelogFilter tags={RELEASE_TAGS} targetId={LIST_ID} />
          </div>

          <div id={LIST_ID} className="mt-10">
            {months.map((month, index) => (
              <section
                key={month.key}
                aria-labelledby={`m-${month.key}`}
                data-tags={tagsIn([...month.featured, ...month.smaller])}
                className="changelog-month grid gap-6 border-t border-[color:var(--marketing-border)] py-10 sm:grid-cols-[13rem_1fr] sm:gap-10"
              >
                <div>
                  <h2
                    id={`m-${month.key}`}
                    className="text-[1.5rem] leading-[1.15] sm:sticky sm:top-24"
                  >
                    {month.label}
                  </h2>
                </div>
                {index < openCount ? (
                  <MonthBody month={month} />
                ) : (
                  <details className="changelog-older">
                    <summary className="changelog-summary">
                      {"Show "}
                      <Count releases={[...month.featured, ...month.smaller]} noun="update" />
                    </summary>
                    <div className="mt-6">
                      <MonthBody month={month} />
                    </div>
                  </details>
                )}
              </section>
            ))}
          </div>

          <div className="border-t border-[color:var(--marketing-border)] pt-10">
            <p className="text-[var(--marketing-text-muted)]">
              Plan your next release on Urganize.
            </p>
            <a
              href={PRIMARY_CTA.href}
              data-track="start_trial_click"
              data-location="changelog_footer"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--marketing-primary)] px-5 py-2.5 text-sm font-medium text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
            >
              {PRIMARY_CTA.label}
            </a>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

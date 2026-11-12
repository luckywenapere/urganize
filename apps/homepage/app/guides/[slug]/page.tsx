import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResponsiveProductShot } from "../../components/landing/ResponsiveProductShot";
import { TrialButton } from "../../components/landing/TrialButton";
import { MarketingFooter } from "../../components/marketing/MarketingFooter";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { GUIDES, getGuide } from "@/content/guides";
import { SHORT_LINE } from "@/lib/positioning";
import {
  ORGANIZATION_ID,
  SITE_URL,
  buildPageMetadata,
  guideShareCard,
  shareImageUrl,
} from "@/lib/seo";
import { PageDawn } from "../../components/marketing/PageDawn";

// Only the guides in content/guides.ts exist. Anything else is a real 404,
// not a soft one, so a mistyped URL never becomes an indexable empty page.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return buildPageMetadata({
    title: guide.title,
    description: `${guide.summary} ${SHORT_LINE}`,
    path: `/guides/${guide.slug}`,
    shareCard: guideShareCard(guide.slug),
  });
}

const bodyText = "text-[1.05rem] leading-8 text-[var(--marketing-text-muted)]";

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const url = `${SITE_URL}/guides/${guide.slug}`;
  const related = guide.related
    .map((relatedSlug) => getGuide(relatedSlug))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  // Article + breadcrumb structured data. The author and publisher are the
  // Organization node declared once in the layout, so the guides add to the
  // brand's identity instead of inventing a second author.
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.summary,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    inLanguage: "en",
    image: shareImageUrl(guideShareCard(guide.slug)),
    mainEntityOfPage: url,
    author: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
      { "@type": "ListItem", position: 3, name: guide.title, item: url },
    ],
  };

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <article className="mx-auto max-w-[44rem]">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              <Link href="/guides" className="hover:text-[var(--marketing-text)]">
                Guides
              </Link>
            </p>
            <h1 className="mt-6 text-balance text-[2.1rem] leading-[1.1] sm:text-[2.8rem]">
              {guide.title}
            </h1>
          </PageDawn>

          <div className="mt-6 space-y-4">
            {guide.intro.map((paragraph) => (
              <p key={paragraph} className={bodyText}>
                {paragraph}
              </p>
            ))}
          </div>

          {/* The guide's still (#966). Phone picture below sm, the wide one
              from sm up (ResponsiveProductShot picks one). */}
          <div className="mx-auto mt-10 max-w-[24rem] sm:max-w-none">
            <ResponsiveProductShot
              desktop={guide.still.desktop}
              phone={guide.still.phone}
              alt={guide.still.alt}
              sizes="(min-width: 752px) 704px, calc(100vw - 48px)"
              fetchPriority="auto"
            />
          </div>

          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-14">
              <h2 className="text-2xl sm:text-3xl">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4">
                {section.blocks.map((block, index) => {
                  if (block.type === "h3") {
                    return (
                      <h3
                        key={`${block.text}-${index}`}
                        className="pt-2 text-base text-[var(--marketing-text)]"
                      >
                        {block.text}
                      </h3>
                    );
                  }
                  if (block.type === "list") {
                    return (
                      <ul
                        key={`list-${index}`}
                        className={`list-disc space-y-2 pl-5 ${bodyText}`}
                      >
                        {block.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={`${block.text}-${index}`} className={bodyText}>
                      {block.text}
                    </p>
                  );
                })}
              </div>
            </section>
          ))}

          {/* The ask. Same button and tracking as every other page; the
              location name lets LandingAnalytics tell guide signups apart. */}
          <div className="mt-16 border border-[color:var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6 sm:p-8">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Skip the spreadsheet
            </p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.02em]">
              Let Urganize lay out the plan for you.
            </p>
            <p className={`mt-2 ${bodyText}`}>
              Tell Urganize your goals and get a plan that fits, with an owner and a due date
              on every task. Create your account and choose a price plan.
            </p>
            <div className="mt-5">
              <TrialButton location="guide_cta" />
            </div>
          </div>

          {related.length > 0 ? (
            <nav aria-label="More guides" className="mt-14">
              <p className="mono-label text-[var(--marketing-text-subtle)]">Keep reading</p>
              <ul className="mt-4 space-y-3">
                {related.map((entry) => (
                  <li key={entry.slug}>
                    <Link
                      href={`/guides/${entry.slug}`}
                      className="text-lg font-medium underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
                    >
                      {entry.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}

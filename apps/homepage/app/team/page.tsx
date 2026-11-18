import type { Metadata } from "next";
import Image from "next/image";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_CLAUSE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";

export const metadata: Metadata = buildPageMetadata({
  title: "Team",
  description:
    `The artist managers, artists and engineers building Urganize, ${CORE_CLAUSE}.`,
  path: "/team",
  // Kept out of search so the homepage's sitelinks stay commercial
  // (Features / Pricing / For executives / For managers). The page stays public
  // and footer-linked — it just never competes as a search result.
  noIndex: true,
});

// Bios are founder-approved facts (reworked 2026-10-19, team signed off). Never edit a bio without re-approval —
// same rule as the landing-page testimonials.
//
// Portraits are the illustrated brand set (cream ground, spring-green ink),
// resized to 640px wide WebP in public/images/team. next/image serves the
// display size from there, so replacing a portrait is a file swap only.
type Member = {
  name: string;
  role: string;
  photo: string;
  bio: string;
  /** Null when someone has no public profile: their name shows unlinked. */
  linkedin: string | null;
};

const members: readonly Member[] = [
  {
    name: "Oyin Wenapere",
    role: "Co-Founder and CEO",
    photo: "/images/team/lucky-wenapere.webp",
    bio: "Manages two artists and has spent ten years on music sets as a videographer, director and editor, so he\u2019s seen releases fall apart from every side. Studied Computer Engineering at Afe Babalola University and works with Afreximbank\u2019s Tech & Innovation team.",
    linkedin: "https://www.linkedin.com/in/oyinwenapere",
  },
  {
    name: "Tedum King",
    role: "Co-Founder and CTO",
    photo: "/images/team/tedum-king.webp",
    bio: "A music and visual artist who builds Urganize\u2019s AI from inside the creative process it serves. He knows what a release feels like from the artist\u2019s chair. Studied Computer Engineering at Afe Babalola University.",
    linkedin: "https://www.linkedin.com/in/tedum-king-kpunee-035556393/",
  },
  {
    name: "Chidera Nnamani",
    role: "Product Ops Lead",
    photo: "/images/team/chidera-nnamani.webp",
    bio: "Manages artists and has run operations at startups, so he sees both the manager\u2019s mess and the system that fixes it. Holds an MBA in Music Management from the Creative Business Academy for Africa, built on engineering and mathematics.",
    linkedin: "https://www.linkedin.com/in/chidera-nnamani/",
  },
];

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-5xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              The people
            </p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              Team
            </h1>
            <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
              Most of us manage artists or make music ourselves. We&apos;re
              building the tool we needed.
            </p>
          </PageDawn>

          <section className="mt-16 border-y border-[color:var(--marketing-border)] py-10 sm:py-12">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Why we&apos;re building this
            </p>
            <div className="mt-6 max-w-[42rem] space-y-5 leading-8 text-[var(--marketing-text-muted)]">
              <p>
                December 2025. Oyin was juggling a third artist&rsquo;s release
                across chats, notes and his own memory, and things kept
                slipping. The problem wasn&rsquo;t effort. Nothing held the
                release together.
              </p>
              <p>
                After ten years as a videographer, director and editor,
                he&rsquo;d seen that mess from every side. So he built the
                system he needed, and he runs his own artists&rsquo; releases
                on it today.
              </p>
            </div>
          </section>

          <div className="mt-16 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] md:grid-cols-2">
            {members.map((member) => (
              <div
                key={member.name}
                className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8"
              >
                <div className="relative aspect-[3/4] w-32 overflow-hidden rounded-lg border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] sm:w-36">
                  <Image
                    src={member.photo}
                    // Empty alt on purpose: the name sits directly below, so a
                    // screen reader would otherwise hear it twice.
                    alt=""
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                </div>
                <p className="mt-5 text-xl font-semibold tracking-[-0.02em]">
                  {member.linkedin ? (
                    <a
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-[color:var(--marketing-border-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
                    >
                      {member.name}
                    </a>
                  ) : (
                    member.name
                  )}
                </p>
                <p className="mt-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[var(--marketing-accent)]">
                  {member.role}
                </p>
                <p className="mt-4 max-w-[34rem] leading-7 text-[var(--marketing-text-muted)]">
                  {member.bio}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-16 border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl">
              Want to build this with us?
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              We&apos;re a small team, and we live the problem we&apos;re
              fixing. If you want to join us, partner with us or invest,
              write to us.
            </p>
            <p className="mt-4">
              <a
                className="text-[var(--marketing-accent)] hover:opacity-80"
                href="mailto:contact@urganize.app?subject=Urganize%20-%20Team"
              >
                contact@urganize.app
              </a>
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

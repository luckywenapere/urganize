import type { Metadata } from "next";
import Image from "next/image";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CUSTOMER_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Team",
  description:
    `The people building Urganize, the ${CUSTOMER_LINE}: artist managers, artists and engineers.`,
  path: "/team",
  // Kept out of search so the homepage's sitelinks stay commercial
  // (Features / Pricing / For executives / For managers). The page stays public
  // and footer-linked — it just never competes as a search result.
  noIndex: true,
});

// Bios are founder-approved facts. Never edit a bio without re-approval —
// same rule as the landing-page testimonials.
//
// Portraits are the illustrated brand set (cream ground, spring-green ink),
// resized to 640px wide WebP in public/images/team. next/image serves the
// display size from there, so replacing a portrait is a file swap only.
const members = [
  {
    name: "Lucky Wenapere",
    role: "Co-Founder and CEO",
    photo: "/images/team/lucky-wenapere.webp",
    bio: "Nine years in the music industry as a videographer, director, and editor; now manages two artists. Studied Computer Engineering at Afe Babalola University; currently works with Afreximbank's Tech & Innovation team.",
    linkedin: "https://linkedin.com/in/lucky-wenapere",
  },
  {
    name: "Tedum King",
    role: "Co-Founder and AI Engineer",
    photo: "/images/team/tedum-king.webp",
    bio: "An artist himself, in both music and visuals, Tedum builds Urganize's AI layer from inside the creative process it serves. Studied Computer Engineering at Afe Babalola University.",
    linkedin: "https://www.linkedin.com/in/tedum-king-kpunee-035556393/",
  },
  {
    name: "Adamu Kabiru",
    role: "Community Lead",
    photo: "/images/team/adamu-kabiru.webp",
    bio: "Known in Nigeria's underground music scene as Don Baba K, Adamu is an artist manager, A&R, event organiser, and music PR who manages three artists and helps foster the growth of upcoming talent.",
    linkedin: null,
  },
  {
    name: "Chidera Nnamani",
    role: "Operations Manager",
    photo: "/images/team/chidera-nnamani.webp",
    bio: "Manages artists and has worked across startups, bringing both the operator's and the manager's view to Urganize's operations. Holds an MBA in Music Management from the Creative Business Academy for Africa, on a foundation of engineering and mathematics.",
    linkedin: "https://www.linkedin.com/in/chidera-nnamani/",
  },
] as const;

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            The people
          </p>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Team
          </h1>
          <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
            Most of us manage artists or make music ourselves. We&apos;re
            building the tool we needed.
          </p>

          <section className="mt-16 border-y border-[color:var(--marketing-border)] py-10 sm:py-12">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Why we&apos;re building this
            </p>
            <div className="mt-6 max-w-[42rem] space-y-5 leading-8 text-[var(--marketing-text-muted)]">
              <p>
                Urganize started in December 2025, in the middle of the mess.
                Lucky was sorting out activities for a third artist&apos;s rollout
                across chats, notes, and memory. That is when it became clear
                the problem was not effort. His artists&apos; music was not
                getting the rollouts it deserved, because nothing held the
                rollout together.
              </p>
              <p>
                After nine years in the industry as a videographer, director,
                and editor, he had seen that mess from every side of a
                rollout. So he built the system he needed. Now he runs his
                own artists&apos; rollouts on it.
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
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              Want to build this with us?
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              We&apos;re a small team, and we live the problem we&apos;re
              fixing. If you want to join us, partner with us, or invest,
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

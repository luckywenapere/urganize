import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Team",
  description:
    "The team behind Urganize — artist managers, artists, and engineers making sure your music gets the release it deserves.",
  path: "/team",
});

// Bios are founder-approved facts. Never edit a bio without re-approval —
// same rule as the landing-page testimonials.
const members = [
  {
    name: "Lucky Wenapere",
    role: "Co-Founder and CEO",
    initials: "LW",
    bio: "Nine years in the music industry as a videographer, director, and editor; now manages two artists. Studied Computer Engineering at Afe Babalola University; currently works with Afreximbank's Tech & Innovation team via Pentagon Securities.",
    linkedin: "https://linkedin.com/in/lucky-wenapere",
  },
  {
    name: "Tedum King",
    role: "Co-Founder and AI Engineer",
    initials: "TK",
    bio: "An artist himself, in both music and visuals, Tedum builds Urganize's AI layer from inside the creative process it serves. Studied Computer Engineering at Afe Babalola University.",
    linkedin: "https://www.linkedin.com/in/tedum-king-kpunee-035556393/",
  },
  {
    name: "Adamu Kabiru",
    role: "Community Lead",
    initials: "AK",
    bio: "Manages an artist and is deeply active in Nigeria's underground music scene.",
    linkedin: null,
  },
  {
    name: "Chidera Nnamani",
    role: "Operations Manager",
    initials: "CN",
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
                Urganize started in December 2025, mid-chaos. Lucky was sorting
                out tasks for a third artist&apos;s release — across chats,
                notes, and memory — when it became obvious the problem
                wasn&apos;t effort. His artists&apos; music wasn&apos;t getting
                the releases it deserved, because nothing held the release
                together.
              </p>
              <p>
                Nine years in the industry as a videographer, director, and
                editor meant he had seen that chaos from every side of a
                rollout. So he built the system he needed — and now runs his
                own artists&apos; releases on it.
              </p>
            </div>
          </section>

          <div className="mt-16 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] md:grid-cols-2">
            {members.map((member) => (
              <div
                key={member.name}
                className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8"
              >
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)]"
                >
                  <span className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--marketing-accent)]">
                    {member.initials}
                  </span>
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
              We&apos;re a small team working close to the problem. If
              you&apos;re interested in joining, partnering, or investing,
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

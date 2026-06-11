import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";

export const metadata: Metadata = {
  title: "Team",
  description: "The team behind Urganize.",
};

const members = [
  { name: "Lucky Wenapere", role: "Co-Founder and CEO" },
  { name: "Tedum King", role: "Co-Founder" },
  { name: "Bobson Prosper", role: "Founding Engineer" },
  { name: "Gideon Ugorji", role: "Founding DevOps Engineer" },
  { name: "Adamu Kabiru", role: "Growth" },
  { name: "Chidera Nnamani", role: "Operations Lead" },
  { name: "Victoria Emmanuel", role: "Operations" },
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
            The team behind Urganize.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] md:grid-cols-2">
            {members.map((member) => (
              <div
                key={member.name}
                className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8"
              >
                <p className="text-xl font-semibold tracking-[-0.02em]">
                  {member.name}
                </p>
                <p className="mt-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[var(--marketing-accent)]">
                  {member.role}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

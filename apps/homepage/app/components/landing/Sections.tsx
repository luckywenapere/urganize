import Image from "next/image";
import Link from "next/link";
import { FaLinkedin } from "react-icons/fa6";
import {
  SiInstagram,
  SiThreads,
  SiTiktok,
  SiX,
  SiYoutube,
} from "react-icons/si";
import { ScrollReveal } from "./ScrollReveal";
import { SectionShell } from "./SectionShell";
import { WaitlistButton } from "./WaitlistButton";

const socialLinks = [
  { href: "https://x.com/urganize", label: "Urganize on X", Icon: SiX },
  {
    href: "https://www.linkedin.com/company/urganize",
    label: "Urganize on LinkedIn",
    Icon: FaLinkedin,
  },
  {
    href: "https://www.instagram.com/urganize",
    label: "Urganize on Instagram",
    Icon: SiInstagram,
  },
  {
    href: "https://www.tiktok.com/@urganize",
    label: "Urganize on TikTok",
    Icon: SiTiktok,
  },
  {
    href: "https://www.youtube.com/@urganize",
    label: "Urganize on YouTube",
    Icon: SiYoutube,
  },
  {
    href: "https://www.threads.net/@urganize",
    label: "Urganize on Threads",
    Icon: SiThreads,
  },
] as const;

type SocialProofLogo = {
  src: string;
  alt: string;
  width: number;
  height: number;
  imageClassName?: string;
};

const socialProofLogos: SocialProofLogo[] = [
  {
    src: "/images/logos/logo-1.svg",
    alt: "Logo 1",
    width: 160,
    height: 160,
    imageClassName: "max-h-10 sm:max-h-11",
  },
  {
    src: "/images/logos/logo-2.svg",
    alt: "Logo 2",
    width: 160,
    height: 160,
    imageClassName: "max-h-10 sm:max-h-11",
  },
  {
    src: "/images/logos/logo-3.svg",
    alt: "Logo 3",
    width: 160,
    height: 160,
    imageClassName: "max-h-10 sm:max-h-11",
  },
  {
    src: "/images/logos/logo-4.svg",
    alt: "Logo 4",
    width: 240,
    height: 80,
    imageClassName: "max-h-7 sm:max-h-8",
  },
];

const featureColumns = [
  {
    kicker: "Workflow",
    title: "Release tasks, assigned.",
    body: "Every step from demo lock to DSP delivery, owned by a person with a due date. No more 'who's doing the art again?'",
  },
  {
    kicker: "Assets",
    title: "Stems, versioned.",
    body: "Centralized storage with metadata. Right file, right version, right context — every time. No more 'Final v3 ACTUAL final.'",
  },
  {
    kicker: "Visibility",
    title: "Pipeline visibility.",
    body: "Dashboard view of every release in flight. Spot what's slipping before it hurts the rollout.",
  },
] as const;

const fourTools = [
  { num: "01", name: "WhatsApp", note: "group chats, voice notes, files" },
  { num: "02", name: "Google Drive", note: "stems, art, versioned by hope" },
  { num: "03", name: "Asana / Notion", note: "half-built templates" },
  { num: "04", name: "Memory", note: "or nothing at all" },
] as const;

const tractionStats = [
  { number: "Jan 28", label: "Live product", subLabel: "since 2026", accent: false },
  { number: "₦5K/mo", label: "First paying", subLabel: "Apr 22", accent: false },
  { number: "0%", label: "Churn", subLabel: "to date", accent: true },
  { number: "12%", label: "Conversion", subLabel: "April launch event", accent: false },
] as const;

const solidButtonClassName =
  "relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base";

function LogoStrip({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mono-label text-center text-[var(--marketing-text-subtle)]">
        Labels already inside.
      </p>

      <div className="mt-10 overflow-x-auto overscroll-x-contain pb-2">
        <div className="flex w-max min-w-full items-center justify-center gap-12 px-1 sm:gap-16">
          {socialProofLogos.map((logo) => (
            <div
              key={logo.alt}
              className="flex min-w-[9rem] shrink-0 items-center justify-center"
            >
              <Image
                src={logo.src}
                alt={logo.alt}
                width={logo.width}
                height={logo.height}
                className={`h-auto w-auto opacity-70 ${logo.imageClassName ?? ""}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <SectionShell
      className="pb-20 pt-[120px] sm:pb-24 sm:pt-[140px] lg:pb-32 lg:pt-[168px]"
      containerClassName="max-w-[84rem] px-6 sm:px-8 lg:px-10"
    >
      <div className="mx-auto flex max-w-[64rem] flex-col items-center text-center">
        <p className="hero-fade-in mono-label text-[var(--marketing-text-subtle)]">
          Music management teams
        </p>

        <div className="mt-10 flex flex-col items-center gap-12 sm:gap-14">
          <h1 className="hero-fade-in hero-delay-1 mx-auto max-w-[22ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.4rem] lg:text-[5.6rem]">
            Stop running releases out of{" "}
            <span className="italic text-[var(--marketing-accent)]">
              WhatsApp threads
            </span>{" "}
            and{" "}
            <span className="italic text-[var(--marketing-accent)]">
              Google Drive folders
            </span>
            .
          </h1>

          <p className="hero-fade-in hero-delay-2 mx-auto block w-full max-w-[44rem] text-balance text-center text-lg leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
            One workspace for music release workflows — task assignment,
            versioned asset storage, and pipeline visibility from demo to drop.
          </p>
        </div>

        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-10 flex justify-center">
          <WaitlistButton className={solidButtonClassName} source="hero_waitlist">
            Join the waitlist
          </WaitlistButton>
        </div>

        <LogoStrip className="hero-fade-in hero-delay-3 mt-14 w-full sm:mt-16" />
      </div>

      <div className="hero-fade-in hero-delay-3 mt-12 sm:mt-14 lg:mt-16">
        <Image
          src="/images/landing/hero-dashboard.png"
          alt="Urganize dashboard showing releases, search, and readiness progress in one workspace."
          width={1920}
          height={1396}
          priority
          className="h-auto w-full"
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
        />
      </div>
    </SectionShell>
  );
}

export function TractionStripSection() {
  return (
    <ScrollReveal>
      <SectionShell
        containerClassName="max-w-[84rem] px-6 sm:px-8 lg:px-10"
        className="py-[60px] lg:py-[80px]"
      >
        <div className="mx-auto max-w-[60rem]">
          <p className="mono-label mb-10 text-center text-[var(--marketing-text-subtle)]">
            Live since January 2026
          </p>

          <div className="grid grid-cols-2 divide-x divide-y divide-[color:var(--marketing-border)] border border-[color:var(--marketing-border)] sm:grid-cols-4 sm:divide-y-0">
            {tractionStats.map((stat) => (
              <div key={stat.label} className="px-5 py-7 sm:px-6 sm:py-8">
                <p
                  className={`font-mono text-[1.45rem] tracking-[-0.02em] sm:text-[1.65rem] ${
                    stat.accent
                      ? "text-[var(--marketing-accent)]"
                      : "text-[var(--marketing-text)]"
                  }`}
                >
                  {stat.number}
                </p>
                <p className="mono-label mt-4 text-[var(--marketing-text)]">
                  {stat.label}
                </p>
                <p className="mt-2 font-mono text-[0.72rem] tracking-[0.04em] text-[var(--marketing-text-subtle)]">
                  {stat.subLabel}
                </p>
              </div>
            ))}
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function VideoSection() {
  return (
    <ScrollReveal>
      <SectionShell
        containerClassName="max-w-[84rem] px-6 sm:px-8 lg:px-10"
        className="py-0"
      >
        <div className="mx-auto my-12 w-full max-w-3xl px-4 md:px-0">
          <p className="mono-label mb-5 text-center text-[var(--marketing-text-subtle)]">
            Three-minute product walkthrough
          </p>
          <div className="relative aspect-video w-full">
            <iframe
              className="absolute inset-0 h-full w-full rounded-xl"
              src="https://www.youtube.com/embed/nfOjPlmDpFw?start=10"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function MirrorSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[100px] lg:py-[140px]"
        containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="mx-auto flex w-full flex-col items-center text-center">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            A duct-taped stack of four tools
          </p>

          <p className="mx-auto mt-8 block w-full max-w-[800px] text-center font-display text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)]">
            Most teams run releases across WhatsApp, Drive, Asana, and Notion —
            or no system at all.
          </p>

          <div className="mt-14 grid w-full max-w-[60rem] grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2 lg:grid-cols-4">
            {fourTools.map((tool) => (
              <div
                key={tool.num}
                className="bg-[var(--marketing-bg)] px-5 py-6 text-left sm:px-6"
              >
                <p className="font-mono text-[0.72rem] font-medium tracking-[0.16em] text-[var(--marketing-accent)]">
                  {tool.num}
                </p>
                <p className="mt-3 font-mono text-[0.95rem] font-semibold uppercase tracking-[0.06em] text-[var(--marketing-text)]">
                  {tool.name}
                </p>
                <p className="mt-2 font-mono text-[0.78rem] italic tracking-[0.02em] text-[var(--marketing-text-subtle)]">
                  {tool.note}
                </p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-14 block w-full max-w-[640px] text-center font-sans text-[clamp(1.1rem,2vw,1.4rem)] leading-8 text-[var(--marketing-text-muted)]">
            Urganize replaces all of that with one structured workspace your
            entire team can actually use.
          </p>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function PlaybookSpotlightSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[84rem] px-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[52rem] text-center">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            Six stages
          </p>

          <pre className="mx-auto mt-6 inline-block whitespace-pre-wrap text-center font-mono text-[0.78rem] leading-7 tracking-[0.04em] text-[var(--marketing-text-muted)] sm:text-[0.95rem]">
            <span className="text-[var(--marketing-accent)]">░▒▓</span>{" "}
            DEMO ──► MIX ──► MASTER ──► ART ──► DSP ──► DROP
          </pre>

          <h2 className="mt-10 text-balance text-[3rem] font-semibold tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem] lg:text-[5rem]">
            Every release has stages. Now yours does too.
          </h2>

          <p className="mx-auto mt-8 max-w-[40rem] text-lg leading-8 text-[var(--marketing-text-muted)]">
            Six stages mapped, every owner named, every deadline visible.
          </p>
        </div>

        <div className="mt-16 w-full">
          <Image
            src="/images/landing/release-playbook.png"
            alt="Urganize release playbook showing phased release progress and structured tasks."
            width={1920}
            height={932}
            className="block h-auto w-full"
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function ThreeFeaturesSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[84rem] px-6 sm:px-8 lg:px-10">
        <div className="grid divide-y divide-[color:var(--marketing-border)] border-y border-[color:var(--marketing-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {featureColumns.map((feature) => (
            <div key={feature.title} className="py-10 lg:px-10 lg:py-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                {feature.kicker}
              </p>
              <h3 className="mt-5 text-balance text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.045em] text-[var(--marketing-text)] sm:text-[2.6rem]">
                {feature.title}
              </h3>
              <p className="mt-5 max-w-[24rem] text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function TestimonialSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[54rem] text-center">
          <blockquote className="relative pt-20 before:absolute before:left-1/2 before:top-0 before:-translate-x-1/2 before:font-display before:text-[7rem] before:leading-none before:text-[var(--marketing-text-subtle)] before:content-['“'] sm:before:text-[8.5rem]">
            <p className="text-balance font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.8rem] lg:text-[4.4rem]">
              This solves an actual problem in the industry.
            </p>
          </blockquote>

          <p className="mt-10 font-mono text-[0.8rem] uppercase tracking-[0.22em] text-[var(--marketing-text-subtle)]">
            — @zaddyfunds_ · Artist Manager
          </p>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function FinalCTASection() {
  return (
    <ScrollReveal>
      <SectionShell
        id="waitlist"
        containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="text-center">
          <h2 className="text-balance text-[3rem] font-semibold tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem] lg:text-[5rem]">
            Releases shouldn&apos;t be this hard to run.
          </h2>

          <div className="relative z-[60] mt-10 flex justify-center">
            <WaitlistButton className={solidButtonClassName} source="final_cta_waitlist">
              Join the waitlist
            </WaitlistButton>
          </div>

        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function FooterTagline() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="pb-10 pt-14 sm:pb-12 sm:pt-16 lg:pb-14 lg:pt-20"
      style={{ borderTop: "0.5px solid var(--marketing-border)" }}
    >
      <div className="mx-auto max-w-[84rem] px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/"
              className="flex h-12 items-center overflow-hidden"
              aria-label="Urganize home"
            >
              <Image
                src="/images/urganize-logo.svg"
                alt="Urganize"
                width={680}
                height={144}
                className="marketing-wordmark mt-[-0.6rem] h-24 w-auto max-w-none"
              />
            </Link>

          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm tracking-[-0.01em] text-[var(--marketing-text-subtle)]">
            <Link href="/privacy" className="hover:text-[var(--marketing-text)]">
              Privacy
            </Link>
            <Link href="/team" className="hover:text-[var(--marketing-text)]">
              Team
            </Link>
            <Link href="/press" className="hover:text-[var(--marketing-text)]">
              Press
            </Link>
            <a
              href="mailto:theurganization@gmail.com"
              className="hover:text-[var(--marketing-text)]"
            >
              Contact
            </a>
            <Link href="/terms" className="hover:text-[var(--marketing-text)]">
              Terms
            </Link>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-5">
          {socialLinks.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-[var(--marketing-text-subtle)] transition-colors hover:text-[var(--marketing-text)]"
            >
              <Icon className="h-4 w-4" aria-hidden />
            </a>
          ))}
        </div>

        <p className="mt-6 text-center font-mono text-[0.68rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          &copy; {currentYear} Urganize Technologies Ltd. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CANONICAL_DESCRIPTION, CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";

// INDEXED since 2026-09-30 (it was noindex before, to keep the homepage's
// sitelinks commercial). Reversed on evidence from a brand search: the results
// for "urganize" were led by third-party listings (RocketReach) and dictionary
// pages for "urbanize", because nothing on the site we control states, in one
// crawlable place, what the company is, what it is called and how it is
// spelled. This page already held the company facts and the boilerplate; it
// now also carries the name, so it is the page a search engine should treat as
// the answer to "what is Urganize". The cost is that Google may offer it as a
// sitelink; that is accepted, and it is one line to reverse (noIndex: true).
export const metadata: Metadata = buildPageMetadata({
  title: "About Urganize: name, brand and press assets",
  description:
    `What Urganize is, how to spell it, and the logos and words to use when you write about us. ${CORE_LINE}`,
  path: "/brand",
});

const VOICE_PILLARS = [
  {
    title: "Plain-spoken, no jargon",
    body: "We say “the plan, the tasks and the files for your release,” not “a synergistic platform.” If a sentence needs a decoder, rewrite it.",
    say: "Every task has an owner and a date.",
    avoid: "Holistic asset-lifecycle management.",
  },
  {
    title: "Concrete, never overclaiming",
    body: "We don’t advertise what isn’t built. Unshipped work is marked “coming soon,” and screenshots show the real app.",
    say: "64 tasks, generated from a template.",
    avoid: "AI runs your whole release for you.",
  },
  {
    title: "Name the problem",
    body: "We say the quiet part out loud: releases run on group chats and “Final v3 ACTUAL final” in Drive. The enemy is chaos — we name it.",
    say: "No more “I thought you were handling it.”",
    avoid: "Streamline your creative workflow.",
  },
  {
    title: "Operator to operator",
    body: "We write like a manager talking to a manager — benefit-first, active, specific. We’ve run releases; the copy shows it.",
    say: "No more “who’s doing the art again?”",
    avoid: "Empower your creative journey.",
  },
] as const;

// Real token values from apps/homepage globals.css (+ the product-app green
// for cross-surface accuracy). `swatch` is an inline style value because
// Tailwind can't compile arbitrary runtime hex classes.
const COLORS = [
  { name: "Canvas", hex: "#f7f4ee", note: "Warm paper, the light background", border: true },
  { name: "Ink", hex: "#171311", note: "Primary text", border: false },
  { name: "Accent green", hex: "#3f7e5c", note: "Marketing emphasis + links (light)", border: false },
  { name: "Accent green (dark)", hex: "#6ee99b", note: "Same accent on dark surfaces", border: false },
  { name: "Product green", hex: "#7fd99a", note: "The app UI accent (app.urganize.app)", border: false },
] as const;

const FONTS = [
  { name: "Cormorant Garamond", role: "Headlines (the serif)" },
  { name: "Instrument Sans", role: "Body text" },
  { name: "IBM Plex Mono", role: "Small uppercase labels" },
] as const;

const LOGO_DOWNLOADS = [
  { label: "Wordmark (SVG)", href: "/brand/urganize-logo.svg", note: "Vector, preferred" },
  { label: "Wordmark (PNG)", href: "/brand/urganize-wordmark.png", note: "1011×231" },
  { label: "“U” mark (PNG)", href: "/brand/urganize-mark.png", note: "Icon only" },
  {
    label: "Square, dark on light (PNG)",
    href: "/brand/urganize-square-black-on-white.png",
    note: "For light backgrounds",
  },
  {
    label: "Square, light on dark (PNG)",
    href: "/brand/urganize-square-white-on-black.png",
    note: "For dark backgrounds",
  },
  { label: "All logos (ZIP)", href: "/brand/urganize-logos.zip", note: "Everything above" },
] as const;

const OTHER_ASSETS = [
  { label: "Social share image (PNG)", href: "/opengraph-image.png", note: "1200×630" },
  {
    label: "Product screenshot: rollouts",
    href: "/images/product/workspace-releases.png",
    note: "The live app",
  },
  {
    label: "Product screenshot: rollouts (dark)",
    href: "/images/product/workspace-releases-dark.png",
    note: "The live app",
  },
  {
    label: "Product screenshot: activities",
    href: "/images/product/workspace-tasks.png",
    note: "The live app",
  },
  {
    label: "Product screenshot: activities (dark)",
    href: "/images/product/workspace-tasks-dark.png",
    note: "The live app",
  },
] as const;

const sectionEyebrow = "mono-label text-[var(--marketing-text-subtle)]";
const sectionTitle = "mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl";
const bodyText = "text-[var(--marketing-text-muted)]";
const downloadRow =
  "flex items-center justify-between gap-4 bg-[var(--marketing-bg)] px-4 py-3.5 text-sm transition-colors hover:bg-[var(--marketing-surface)]";

export default function BrandPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-4xl">
          <PageDawn>
            {/* Hero */}
            <p className={sectionEyebrow}>Brand</p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              Brand
            </h1>
            <p className={`mt-4 max-w-[38rem] ${bodyText}`}>
              How Urganize looks, how it speaks and what it stands for, plus the logos and
              images that represent us. Using anything here? Use it exactly as it is, and{" "}
              <a
                href="mailto:contact@urganize.app?subject=Urganize%20-%20Brand"
                className="text-[var(--marketing-text)] underline underline-offset-2"
              >
                ask us
              </a>{" "}
              if you’re not sure.
            </p>
          </PageDawn>

          {/* 1 — Brand foundations */}
          <section id="foundations" className="mt-16">
            <p className={sectionEyebrow}>01 · Foundations</p>
            <h2 className={sectionTitle}>What Urganize stands for</h2>

            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-sm text-[var(--marketing-text)]">Mission</h3>
                <p className={`mt-1.5 ${bodyText}`}>
                  The music industry runs on chaos: knowledge stuck in people’s heads, scattered
                  group chats, spreadsheets and one overworked manager chasing everyone till
                  drop day. Urganize ends that. Every release runs to plan, with the work and
                  the status in one place.
                </p>
              </div>

              <div>
                <h3 className="text-sm text-[var(--marketing-text)]">Positioning</h3>
                {/* Composed from the shared constants rather than typed out.
                    This block is the one paragraph on the site whose entire job
                    is to state the positioning, so it is the last place that
                    should be able to drift from it. Since 2026-09-24 it is the
                    founder's core line, verbatim. */}
                <p className={`mt-1.5 ${bodyText}`}>
                  {CORE_LINE}
                </p>
              </div>

              <div>
                <h3 className="text-sm text-[var(--marketing-text)]">Who it’s for</h3>
                <p className={`mt-1.5 ${bodyText}`}>
                  Artists and their teams, from the artist to the manager to the designer. One release is a lot of moving parts; a roster is
                  many calendars, many releases at once and a pile of chats holding it
                  together. Urganize is what runs that. Labels and teams with a bigger roster get the
                  Label plan, with the founders working alongside them.
                </p>
              </div>

              <div>
                <h3 className="text-sm text-[var(--marketing-text)]">
                  What we believe
                </h3>
                <ul className={`mt-1.5 list-disc space-y-1 pl-5 ${bodyText}`}>
                  <li>The release is the spine. Every feature serves a release.</li>
                  <li>We are opinionated on purpose: if it doesn’t cut the chaos, it’s out.</li>
                  <li>
                    That’s why we don’t do revenue tracking, legal contracts or analytics
                    dashboards. We stay focused on the release.
                  </li>
                </ul>
              </div>

              {/* The name (2026-09-30). The brand is one letter from "urbanize" and
                  a respelling of "organize", so a search engine and a person
                  both need it said outright. The facts below are the ones the
                  terms and the footer already state; nothing here is new. */}
              <div>
                <h3 className="text-sm text-[var(--marketing-text)]">The name</h3>
                <p className={`mt-1.5 ${bodyText}`}>
                  Urganize is spelled with a G, like organize. It is not urbanize. The company
                  behind it is Urganization, started in December 2025. The product lives at urganize.app.
                </p>
              </div>

              {/* Boilerplate: copy/paste block for media. The founder's long
                  description, verbatim, from the shared constant (2026-09-24),
                  so a journalist pasting it quotes exactly what every other
                  surface says. */}
              <div className="border border-[color:var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-5">
                <p className={sectionEyebrow}>Boilerplate · copy / paste</p>
                <p className="mt-2 text-[var(--marketing-text)]">
                  {CANONICAL_DESCRIPTION}
                </p>
              </div>

              <p className={`text-sm ${bodyText}`}>
                Urganization. Started December 2025.{" "}
                <Link
                  href="/team"
                  className="text-[var(--marketing-text)] underline underline-offset-2"
                >
                  Meet the team
                </Link>
                .
              </p>
            </div>
          </section>

          {/* 2 — Voice & tone */}
          <section id="voice" className="mt-16">
            <p className={sectionEyebrow}>02 · Voice &amp; tone</p>
            <h2 className={sectionTitle}>How Urganize speaks</h2>
            <p className={`mt-3 max-w-[38rem] ${bodyText}`}>
              Four rules, drawn from how the product already talks.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] md:grid-cols-2">
              {VOICE_PILLARS.map((pillar) => (
                <div key={pillar.title} className="bg-[var(--marketing-bg)] px-6 py-6">
                  <h3 className="text-base text-[var(--marketing-text)]">
                    {pillar.title}
                  </h3>
                  <p className={`mt-1.5 text-sm ${bodyText}`}>{pillar.body}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-[var(--marketing-accent)]">We say</dt>
                      <dd className="text-[var(--marketing-text)]">{pillar.say}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-[var(--marketing-text-subtle)]">
                        Not
                      </dt>
                      <dd className="text-[var(--marketing-text-subtle)] line-through">
                        {pillar.avoid}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-2 text-sm">
              <p className={bodyText}>
                <span className="font-medium text-[var(--marketing-text)]">Tone tells:</span> active
                voice, specific over abstract, short sentences over long ones, emphasis set in the
                brand green.
              </p>
              <p className={bodyText}>
                <span className="font-medium text-[var(--marketing-text)]">
                  Words from others run verbatim.
                </span>{" "}
                Testimonials and bios are published with sign-off and never edited after approval.
              </p>
            </div>
          </section>

          {/* 3 — Visual identity */}
          <section id="visual" className="mt-16">
            <p className={sectionEyebrow}>03 · Visual identity</p>
            <h2 className={sectionTitle}>How Urganize looks</h2>

            {/* Logo */}
            <h3 className="mt-6 text-sm text-[var(--marketing-text)]">Logo</h3>
            <p className={`mt-1.5 max-w-[38rem] text-sm ${bodyText}`}>
              The wordmark is the main logo. The “U” is the icon on its own. Use the dark logo
              on light backgrounds and the light logo on dark ones. Don’t recolor it, stretch it,
              add effects, or box it in.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
              <div className="flex items-center justify-center bg-white px-6 py-12">
                <Image
                  src="/brand/urganize-square-black-on-white.png"
                  alt="Urganize logo on a light background"
                  width={140}
                  height={140}
                  className="h-auto w-32"
                />
              </div>
              <div className="flex items-center justify-center bg-[#171311] px-6 py-12">
                <Image
                  src="/brand/urganize-square-white-on-black.png"
                  alt="Urganize logo on a dark background"
                  width={140}
                  height={140}
                  className="h-auto w-32"
                />
              </div>
            </div>

            {/* Color */}
            <h3 className="mt-10 text-sm text-[var(--marketing-text)]">Color</h3>
            <div className="mt-4 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2 lg:grid-cols-3">
              {COLORS.map((color) => (
                <div key={color.name} className="bg-[var(--marketing-bg)] px-4 py-4">
                  <div
                    className={`h-14 w-full rounded-md ${
                      color.border ? "border border-[color:var(--marketing-border-strong)]" : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="mt-2.5 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--marketing-text)]">
                      {color.name}
                    </span>
                    <span className="mono-label text-[var(--marketing-text-subtle)]">
                      {color.hex}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-xs ${bodyText}`}>{color.note}</p>
                </div>
              ))}
            </div>

            {/* Typography */}
            <h3 className="mt-10 text-sm text-[var(--marketing-text)]">Typography</h3>
            <div className="mt-4 space-y-px bg-[color:var(--marketing-border)]">
              {FONTS.map((font) => (
                <div key={font.name} className="bg-[var(--marketing-bg)] px-4 py-4">
                  <p className="text-lg text-[var(--marketing-text)]">{font.name}</p>
                  <p className={`mt-0.5 text-sm ${bodyText}`}>{font.role}</p>
                </div>
              ))}
            </div>
            <p className={`mt-3 text-xs ${bodyText}`}>
              The product app (app.urganize.app) uses its own fonts: IBM Plex Sans, Space Grotesk,
              and JetBrains Mono.
            </p>

            {/* Motifs */}
            <h3 className="mt-10 text-sm text-[var(--marketing-text)]">Motifs</h3>
            <p className={`mt-1.5 max-w-[38rem] text-sm ${bodyText}`}>
              Small uppercase labels in the mono font. Thin lines and grids. A warm paper
              background with serif headlines, and emphasis set in green.
            </p>
          </section>

          {/* 4 — Brand assets */}
          <section id="assets" className="mt-16">
            <p className={sectionEyebrow}>04 · Assets</p>
            <h2 className={sectionTitle}>Download</h2>

            <h3 className="mt-6 text-sm text-[var(--marketing-text)]">Logos</h3>
            <div className="mt-3 space-y-px bg-[color:var(--marketing-border)]">
              {LOGO_DOWNLOADS.map((asset) => (
                <a key={asset.href} href={asset.href} download className={downloadRow}>
                  <span className="font-medium text-[var(--marketing-text)]">{asset.label}</span>
                  <span className="mono-label text-[var(--marketing-text-subtle)]">
                    {asset.note} ↓
                  </span>
                </a>
              ))}
            </div>

            <h3 className="mt-8 text-sm text-[var(--marketing-text)]">
              Images &amp; screenshots
            </h3>
            <div className="mt-3 space-y-px bg-[color:var(--marketing-border)]">
              {OTHER_ASSETS.map((asset) => (
                <a key={asset.href} href={asset.href} download className={downloadRow}>
                  <span className="font-medium text-[var(--marketing-text)]">{asset.label}</span>
                  <span className="mono-label text-[var(--marketing-text-subtle)]">
                    {asset.note} ↓
                  </span>
                </a>
              ))}
            </div>

            <h3 className="mt-8 text-sm text-[var(--marketing-text)]">Media contact</h3>
            <p className={`mt-1.5 text-sm ${bodyText}`}>
              Press questions:{" "}
              <a
                href="mailto:contact@urganize.app?subject=Urganize%20-%20Press"
                className="text-[var(--marketing-accent)] hover:opacity-80"
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

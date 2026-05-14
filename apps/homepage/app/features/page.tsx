"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { RiCheckLine } from "react-icons/ri";

export default function FeaturesPage() {
  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--marketing-bg)] font-sans text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)]">
      {/* --- SIMPLE NAVIGATION --- */}
      <nav className="fixed left-1/2 top-6 z-[100] w-[90%] max-w-5xl -translate-x-1/2">
        <div className="flex items-center justify-between rounded-full border border-[var(--marketing-border)] bg-[var(--marketing-surface)]/90 px-6 py-3 shadow-[0_8px_32px_var(--marketing-shadow)] backdrop-blur-xl">
          <Link
            href="/"
            className="text-sm font-medium text-[var(--marketing-text-muted)] transition-colors hover:text-[var(--marketing-text)]"
          >
            ← Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="https://app.urganize.app/auth"
              className="rounded-full border border-[var(--marketing-border-strong)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-[var(--marketing-text)] transition-all hover:scale-105 hover:bg-[var(--marketing-surface-muted)]"
            >
              Login
            </Link>
            <Link
              href="https://app.urganize.app/auth"
              className="rounded-full bg-[var(--marketing-primary)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-[var(--marketing-primary-text)] shadow-[0_8px_24px_var(--marketing-shadow-strong)] transition-all hover:scale-105 hover:bg-[var(--marketing-primary-hover)]"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* --- HERO SECTION --- */}
        <section className="relative flex min-h-[60vh] items-center justify-center px-6 pb-20 pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]"
            >
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--marketing-accent)]" />
              Features
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8 text-5xl font-black leading-[0.9] tracking-tighter sm:text-6xl md:text-8xl"
            >
              AI-guided.
              <br />
              <span className="text-[var(--marketing-accent)]">Stress-free.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mx-auto max-w-2xl text-lg leading-relaxed text-[var(--marketing-text-muted)] md:text-xl"
            >
              Every feature in Urganize exists to remove overwhelm and guide you through your release — one intelligent step at a time.
            </motion.p>
          </div>
        </section>

        {/* --- CORE FEATURES --- */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            {/* Feature 1: AI-Guided Steps */}
            <motion.div {...fadeInUp} className="mb-32">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div>
                  <div className="mb-6 inline-block rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
                    Core Feature
                  </div>
                  <h2 className="mb-6 text-4xl font-black tracking-tighter md:text-6xl">Intelligent Guidance</h2>
                  <p className="mb-8 text-xl leading-relaxed text-[var(--marketing-text-muted)]">
                    Instead of overwhelming you with a massive checklist, Urganize shows you one task at a time. Complete it, share the outcome, and get your next step — adapted to your results.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">One task at a time</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Never see 50 tasks at once. Focus on what matters now.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Feedback-driven adaptation</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Answer a quick question after each task. The system learns from real outcomes.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Smart next steps</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Your next task is intelligently determined based on what just happened.</p>
                      </div>
                    </li>
                  </ul>
                </div>
                <div className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8">
                  <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl bg-[var(--marketing-surface)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <span className="text-lg text-[var(--marketing-accent)]">✓</span>
                      </div>
                      <span className="text-[var(--marketing-text-muted)]">Task completed</span>
                    </div>
                    <div className="mb-4 w-full rounded-xl border border-[var(--marketing-accent)]/30 bg-[var(--marketing-surface-muted)] p-4">
                      <p className="mb-2 text-sm text-[var(--marketing-text-muted)]">How did it go?</p>
                      <div className="flex gap-2">
                        <span className="rounded-full bg-[var(--marketing-accent)]/20 px-3 py-1 text-xs text-[var(--marketing-accent)]">Got approval</span>
                        <span className="rounded-full bg-[var(--marketing-surface-muted)] px-3 py-1 text-xs text-[var(--marketing-text-subtle)]">Needs revision</span>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--marketing-text-subtle)]">→ Next step adapts based on your answer</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Feature 2: Promotion Built In */}
            <motion.div {...fadeInUp} className="mb-32">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div className="order-2 lg:order-1">
                  <div className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8">
                    <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl bg-[var(--marketing-surface)] p-6">
                      <div className="w-full space-y-3">
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--marketing-accent)]/20 text-sm text-[var(--marketing-accent)]">📸</div>
                          <span className="text-sm text-[var(--marketing-text-muted)]">Plan content shoot</span>
                          <span className="ml-auto text-xs text-[var(--marketing-accent)]">Now</span>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-3 opacity-60">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--marketing-bg-muted)] text-sm text-[var(--marketing-text-subtle)]">📅</div>
                          <span className="text-sm text-[var(--marketing-text-subtle)]">Schedule rollout</span>
                          <span className="ml-auto text-xs text-[var(--marketing-text-subtle)]">Next</span>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-3 opacity-40">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--marketing-bg-muted)] text-sm text-[var(--marketing-text-subtle)]">📣</div>
                          <span className="text-sm text-[var(--marketing-text-subtle)]">Announcement post</span>
                          <span className="ml-auto text-xs text-[var(--marketing-text-subtle)]">Later</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="order-1 lg:order-2">
                  <div className="mb-6 inline-block rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
                    Game Changer
                  </div>
                  <h2 className="mb-6 text-4xl font-black tracking-tighter md:text-6xl">Promotion First</h2>
                  <p className="mb-8 text-xl leading-relaxed text-[var(--marketing-text-muted)]">
                    Promotion is where releases fail. That&apos;s why it&apos;s built into every release from day one — not an afterthought.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Promotion tasks surface early</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Content planning, shoot schedules, social rollout — visible from the start</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">No last-minute scrambling</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Timeline guidance prevents &quot;we&apos;ll figure it out later&quot;</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Clear accountability</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Track progress on every promotion task</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>

            {/* Feature 3: Release-First File System */}
            <motion.div {...fadeInUp} className="mb-32">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div>
                  <div className="mb-6 inline-block rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
                    Organization
                  </div>
                  <h2 className="mb-6 text-4xl font-black tracking-tighter md:text-6xl">Files That Make Sense</h2>
                  <p className="mb-8 text-xl leading-relaxed text-[var(--marketing-text-muted)]">
                    Stop searching through Google Drive. Every file belongs to a release. Every release has structure.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Pre-built folder structure</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Audio, stems, artwork, contracts — organized by default</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Release-connected</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Files live with the release they belong to. No more hunting.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Nothing gets lost</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Metadata, credits, assets — all in one place</p>
                      </div>
                    </li>
                  </ul>
                </div>
                <div className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8">
                  <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl bg-[var(--marketing-surface)] p-6">
                    <div className="w-full space-y-2">
                      {[
                        { name: "Audio", count: "3 files" },
                        { name: "Stems", count: "8 files" },
                        { name: "Artwork", count: "5 files" },
                        { name: "Contracts", count: "2 files" },
                        { name: "Promotion", count: "4 files" },
                      ].map((folder) => (
                        <div
                          key={folder.name}
                          className="flex items-center gap-3 rounded-lg p-2 hover:bg-[var(--marketing-surface-muted)]"
                        >
                          <span className="text-lg">📁</span>
                          <span className="text-sm text-[var(--marketing-text-muted)]">{folder.name}</span>
                          <span className="ml-auto text-xs text-[var(--marketing-text-subtle)]">{folder.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Feature 4: Timeline Enforcement */}
            <motion.div {...fadeInUp} className="mb-32">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div className="order-2 lg:order-1">
                  <div className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8">
                    <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl bg-[var(--marketing-surface)] p-6">
                      <div className="mb-4 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="mb-2 flex items-center gap-3">
                          <span className="text-amber-600">⚠️</span>
                          <span className="text-sm font-medium text-amber-700">Timeline Alert</span>
                        </div>
                        <p className="text-sm text-[var(--marketing-text-muted)]">Release date not set. Set a date to unlock timeline-based guidance.</p>
                      </div>
                      <div className="w-full rounded-xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-4">
                        <p className="mb-2 text-xs text-[var(--marketing-text-subtle)]">Suggested release window</p>
                        <p className="text-lg font-semibold text-[var(--marketing-text)]">March 14 - 21, 2026</p>
                        <p className="mt-1 text-xs text-[var(--marketing-text-subtle)]">Based on your current progress</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="order-1 lg:order-2">
                  <div className="mb-6 inline-block rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
                    Enforcement
                  </div>
                  <h2 className="mb-6 text-4xl font-black tracking-tighter md:text-6xl">Timeline Guidance</h2>
                  <p className="mb-8 text-xl leading-relaxed text-[var(--marketing-text-muted)]">
                    The system prompts you when dates are missing. No more &quot;we&apos;ll figure it out later&quot; that turns into last-minute panic.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Gentle prompts, not nagging</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">The system surfaces timeline issues before they become crises</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">Smart deadline suggestions</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Based on your progress and release date</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)]/20">
                        <RiCheckLine className="text-sm text-[var(--marketing-accent)]" />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold">No missed windows</p>
                        <p className="text-sm text-[var(--marketing-text-subtle)]">Distributor deadlines, playlist pitches — all accounted for</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* --- WHAT WE DON'T DO --- */}
        <section className="bg-[var(--marketing-bg-muted)] px-6 py-32">
          <div className="mx-auto max-w-4xl">
            <motion.div {...fadeInUp} className="mb-16 text-center">
              <h2 className="mb-8 text-5xl font-black tracking-tighter md:text-7xl">What Urganize Doesn&apos;t Do</h2>
              <p className="mx-auto max-w-2xl text-xl leading-relaxed text-[var(--marketing-text-muted)]">
                We&apos;re opinionated about what we build. If a feature doesn&apos;t reduce operational chaos, it&apos;s out.
              </p>
            </motion.div>

            <motion.div {...fadeInUp} className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                { title: "❌ Revenue Tracking", body: "We don't track streams, splits, or royalties. That's what distributors are for." },
                { title: "❌ Legal Contracts", body: "We don't generate or enforce contracts. Get a lawyer for that." },
                { title: "❌ Analytics", body: "We don't show streaming numbers or social media metrics. Check your platforms." },
                { title: "❌ Music Distribution", body: "We don't upload to Spotify or Apple Music. Use your preferred distributor." },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[2rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface)] p-8"
                >
                  <h3 className="mb-3 text-xl font-bold text-[var(--marketing-text-muted)]">{item.title}</h3>
                  <p className="text-[var(--marketing-text-subtle)]">{item.body}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* --- FINAL CTA --- */}
        <section className="relative overflow-hidden px-6 py-32">
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <motion.div {...fadeInUp}>
              <h2 className="mb-6 text-4xl font-bold tracking-tighter md:text-6xl">Ready to release without the stress?</h2>
              <p className="mx-auto mb-12 max-w-2xl text-xl text-[var(--marketing-text-muted)]">
                Join managers and artists who refuse to let chaos kill their releases.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="https://app.urganize.app/auth"
                  className="inline-flex items-center gap-3 rounded-full bg-[var(--marketing-primary)] px-10 py-5 text-sm font-black uppercase tracking-[0.2em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] transition-all hover:scale-105 hover:bg-[var(--marketing-primary-hover)] active:scale-95"
                >
                  Sign Up
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="https://app.urganize.app/auth"
                  className="inline-flex items-center gap-3 rounded-full border border-[var(--marketing-border-strong)] px-10 py-5 text-sm font-black uppercase tracking-[0.2em] text-[var(--marketing-text)] transition-all hover:bg-[var(--marketing-surface-muted)] active:scale-95"
                >
                  Login
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
}

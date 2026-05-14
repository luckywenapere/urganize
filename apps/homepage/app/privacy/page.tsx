"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function PrivacyPolicy() {
  const fadeInUp = {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--marketing-bg)] font-sans text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)]">
      <main className="relative z-10 px-6 pb-24 pt-28">
        <div className="mx-auto max-w-4xl">
          {/* Top nav line */}
          <motion.div {...fadeInUp} className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)] transition-colors hover:text-[var(--marketing-text)]"
            >
              <span className="text-[var(--marketing-accent)]">←</span>
              Back to home
            </Link>

            <Link
              href="mailto:contact@urganize.app?subject=Privacy%20question%20-%20Urganize"
              className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)] transition-colors hover:text-[var(--marketing-text)]"
            >
              Contact
            </Link>
          </motion.div>

          {/* Header card */}
          <motion.div
            {...fadeInUp}
            className="mt-10 rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
          >
            <div className="flex flex-col items-start gap-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--marketing-accent)]" />
                Privacy Policy
              </div>

              <h1 className="text-4xl font-black leading-[0.95] tracking-tighter md:text-6xl">
                How Urganize handles your data
              </h1>

              <p className="max-w-3xl text-lg leading-relaxed text-[var(--marketing-text-muted)] md:text-xl">
                This policy explains what we collect, why we collect it, how we use it, and
                the choices you have. We aim to keep this simple and transparent.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)]">
                  Last updated
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-text-muted)]">
                  {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <div className="mt-10 space-y-8">
            {/* Summary / quick bullets */}
            <motion.div
              {...fadeInUp}
              className="rounded-[2rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8"
            >
              <h2 className="mb-4 text-xl font-bold tracking-tight">Quick summary</h2>
              <ul className="space-y-3 text-[var(--marketing-text-muted)]">
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>We collect data needed to run Urganize and improve it.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>Payments are processed by Paystack. We do not store your card details.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>We use analytics (Google Analytics) to understand product usage.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>
                    We use AI (including Google Gemini). Inputs may be processed by providers, and
                    may be used to improve Urganize and underlying AI systems.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>You can request access, correction, or deletion of your data.</span>
                </li>
              </ul>
            </motion.div>

            {/* Sections */}
            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                1. Who we are
              </h2>
              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                Urganize (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is a release operating system for artist managers.
                We are not currently registered, but we intend to register in Nigeria.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                If you have privacy questions, email{" "}
                <a
                  href="mailto:contact@urganize.app?subject=Privacy%20question%20-%20Urganize"
                  className="font-semibold text-[var(--marketing-accent)] transition-colors hover:opacity-80"
                >
                  contact@urganize.app
                </a>
                .
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                2. Who can use Urganize
              </h2>
              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                Urganize is not intended for children under 13. We do not knowingly collect
                personal information from children under 13. If you believe a child has
                provided us personal data, contact us and we will take steps to delete it.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                3. Information we collect
              </h2>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-[1.75rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface)] p-6">
                  <h3 className="mb-3 text-lg font-bold text-[var(--marketing-text)]">Account data</h3>
                  <ul className="space-y-2 text-[var(--marketing-text-muted)]">
                    <li>• Email address</li>
                    <li>• Login credentials</li>
                    <li>• Basic profile details (if provided)</li>
                  </ul>
                </div>

                <div className="rounded-[1.75rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface)] p-6">
                  <h3 className="mb-3 text-lg font-bold text-[var(--marketing-text)]">Release data</h3>
                  <ul className="space-y-2 text-[var(--marketing-text-muted)]">
                    <li>• Artist and release info</li>
                    <li>• Dates, tasks, plans, notes</li>
                    <li>• Assets you upload or reference</li>
                  </ul>
                </div>

                <div className="rounded-[1.75rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface)] p-6">
                  <h3 className="mb-3 text-lg font-bold text-[var(--marketing-text)]">Usage & device data</h3>
                  <ul className="space-y-2 text-[var(--marketing-text-muted)]">
                    <li>• Pages viewed, features used</li>
                    <li>• IP address, browser, device info</li>
                    <li>• Logs for debugging and security</li>
                  </ul>
                </div>

                <div className="rounded-[1.75rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface)] p-6">
                  <h3 className="mb-3 text-lg font-bold text-[var(--marketing-text)]">Payments</h3>
                  <ul className="space-y-2 text-[var(--marketing-text-muted)]">
                    <li>• Processed by Paystack</li>
                    <li>• We do not store card details</li>
                    <li>• We may store billing status and receipts</li>
                  </ul>
                </div>
              </div>

              <p className="mt-6 text-sm text-[var(--marketing-text-subtle)]">
                Note: Some of these may apply &ldquo;eventually&rdquo; as Urganize evolves. We aim to
                collect only what we need.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                4. How we use your information
              </h2>

              <ul className="space-y-3 text-lg text-[var(--marketing-text-muted)]">
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>To provide and operate Urganize</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>To generate AI-guided tasks and workflows</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>To improve performance, reliability, and user experience</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>To communicate product updates and announcements (you can unsubscribe)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl font-bold leading-none text-[var(--marketing-accent)]">•</span>
                  <span>To prevent fraud, abuse, and security issues</span>
                </li>
              </ul>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                5. AI processing
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                Urganize uses third-party AI services (including Google Gemini) to generate
                recommendations, guidance, and workflows. Your inputs may be processed by
                those providers to produce outputs.
              </p>

              <p className="mt-4 text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                You agree that your data may be used to improve Urganize and underlying AI
                systems. AI outputs are informational only and do not replace professional
                advice.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                6. Cookies & analytics
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                We use Google Analytics to understand how users interact with Urganize.
                We may use cookies or similar technologies to measure performance and improve
                the product. We also collect anonymized usage data to improve experience.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                7. Data storage & international transfers
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                Urganize serves users internationally. Your information may be stored and
                processed on global cloud infrastructure and may be transferred outside your
                country of residence.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                8. Your rights
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                Depending on where you live, you may have the right to access, correct, or
                delete your personal data. You may also withdraw consent where applicable.
              </p>

              <div className="mt-6 rounded-[1.75rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface)] p-6">
                <p className="text-[var(--marketing-text-muted)]">
                  To make a request, email{" "}
                  <a
                    href="mailto:contact@urganize.app?subject=Privacy%20request%20-%20Urganize"
                    className="font-semibold text-[var(--marketing-accent)] transition-colors hover:opacity-80"
                  >
                    contact@urganize.app
                  </a>{" "}
                  and include the email associated with your Urganize account.
                </p>
              </div>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                9. Account deletion
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                When you delete your account, we remove your data within a reasonable time.
                Some backups may remain temporarily for security, compliance, or disaster
                recovery, and will be overwritten over time.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                10. Security
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                We use reasonable measures to protect your data. No system can guarantee
                absolute security.
              </p>
            </motion.div>

            <motion.div
              {...fadeInUp}
              className="rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10"
            >
              <h2 className="mb-6 text-2xl font-black tracking-tight md:text-3xl">
                11. Changes to this policy
              </h2>

              <p className="text-lg leading-relaxed text-[var(--marketing-text-muted)]">
                We may update this policy as Urganize evolves. We will post updates on this
                page and update the &ldquo;Last updated&rdquo; date at the top.
              </p>
            </motion.div>

            {/* Footer line */}
            <motion.div
              {...fadeInUp}
              className="flex flex-col items-start justify-between gap-4 border-t border-[var(--marketing-border)] pt-6 sm:flex-row sm:items-center"
            >
              <p className="text-sm text-[var(--marketing-text-subtle)]">
                &copy; {new Date().getFullYear()} The Urganization
              </p>

              <div className="flex gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)]">
                <Link href="/terms" className="transition-colors hover:text-[var(--marketing-text)]">
                  Terms
                </Link>
                <Link href="/subprocessors" className="transition-colors hover:text-[var(--marketing-text)]">
                  Subprocessors
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

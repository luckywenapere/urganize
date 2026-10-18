import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";

export const metadata: Metadata = buildPageMetadata({
  title: "Subprocessors",
  description:
    `The third-party services behind Urganize and what data each one processes. ${CORE_LINE}`,
  path: "/subprocessors",
  // Same class as Privacy and Terms, so it gets the same treatment: kept out
  // of search so the homepage's sitelinks stay commercial. Noindex hides the
  // page from RESULTS only — it stays public and linked from the privacy
  // policy, which is what a GDPR subprocessor disclosure actually requires.
  noIndex: true,
});

// Keep this date real — it moves only when the list changes.
const LAST_UPDATED = "June 11, 2026";

// Rule: this list reflects services actually in use. Add entries in the same
// PR that introduces a new provider; remove them when the integration is
// removed (e.g. Tawk.to was replaced by WhatsApp support in PR #48).
const subprocessors = [
  {
    name: "Vercel",
    purpose: "Hosting, deployment, and Vercel Analytics",
    data: "App traffic, server logs, anonymized usage events",
  },
  {
    name: "Supabase",
    purpose: "App database, authentication, and file storage",
    data: "Account data, release data, and the files you upload",
  },
  {
    name: "Neon",
    purpose: "Waitlist database (marketing site)",
    data: "Waitlist signups: email and submitted answers",
  },
  {
    name: "Paystack",
    purpose: "Payment processing",
    data: "Billing details and transactions. Card details go to Paystack directly. We never store them",
  },
  {
    name: "Google Analytics",
    purpose: "Marketing site analytics",
    data: "Device identifiers, usage events, IP (may be processed), cookies",
  },
  {
    name: "PostHog",
    purpose: "Product analytics (inside the app)",
    data: "Feature usage events tied to your account",
  },
  {
    name: "Formbricks",
    purpose: "In-product surveys",
    data: "Survey answers you choose to submit",
  },
  {
    name: "AI model provider (via our gateway)",
    purpose:
      "Generating plan tailoring and status updates, only when you use the AI features",
    data: "Release context (details, task progress). Never your uploaded files, and never used to train models",
  },
  {
    name: "WhatsApp (Meta)",
    purpose: "Customer support: the in-app founder chat",
    data: "Messages you send us there, under Meta's own privacy policy",
  },
  {
    name: "Google Workspace",
    purpose: "Email correspondence (contact@urganize.app)",
    data: "Email content and addresses",
  },
  {
    name: "Slack",
    purpose: "Internal team communication",
    data: "Operational messages; may include support context if shared internally",
  },
] as const;

export default function SubprocessorsPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-4xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Data processing
            </p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              Subprocessors
            </h1>
            <p className="mt-5 max-w-[40rem] text-lg leading-8 text-[var(--marketing-text-muted)]">
              The third-party services that help us run Urganize, and what each
              one processes. This list reflects what is actually in use today.
            </p>
            <p className="mt-6 font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
              LAST UPDATED: {LAST_UPDATED.toUpperCase()}
            </p>
          </PageDawn>

          <div className="mt-12 border-y border-[color:var(--marketing-border)]">
            {subprocessors.map((s) => (
              <div
                key={s.name}
                className="grid gap-2 border-b border-[color:var(--marketing-border)] py-6 last:border-b-0 lg:grid-cols-[16rem_1fr] lg:gap-12"
              >
                <p className="text-lg font-semibold tracking-[-0.02em] text-[var(--marketing-text)]">
                  {s.name}
                </p>
                <div className="space-y-1.5 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                  <p>
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[var(--marketing-text-subtle)]">
                      Purpose&nbsp;&nbsp;
                    </span>
                    {s.purpose}
                  </p>
                  <p>
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[var(--marketing-text-subtle)]">
                      Data&nbsp;&nbsp;
                    </span>
                    {s.data}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 max-w-[40rem] text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
            We may add, remove, or replace subprocessors as Urganize evolves.
            When we do, this page changes in the same release. Questions:{" "}
            <a
              href="mailto:contact@urganize.app"
              className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
            >
              contact@urganize.app
            </a>
            . See also our{" "}
            <Link
              href="/privacy"
              className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
            >
              privacy policy
            </Link>
            .
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

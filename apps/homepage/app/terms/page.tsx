import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection as Section } from "../components/marketing/LegalSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    `The terms that govern your use of Urganize: accounts, subscriptions, your content and our responsibilities. ${CORE_LINE}`,
  path: "/terms",
  // Kept out of search so the homepage's sitelinks stay commercial
  // (Features / Pricing / For executives / For managers). Noindex hides the page
  // from RESULTS only — it stays public, footer-linked, and reachable, which
  // is what any "terms must be accessible" obligation actually requires.
  noIndex: true,
});

// Real date discipline: moves only when the terms text changes.
const LAST_UPDATED = "November 10, 2026";

const CONTACT_HREF =
  "mailto:contact@urganize.app?subject=Terms%20question%20-%20Urganize";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-4xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Terms of Service
            </p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              The terms of using Urganize
            </h1>
            <p className="mt-5 max-w-[40rem] text-lg leading-8 text-[var(--marketing-text-muted)]">
              By creating an account or using Urganize, you agree to these terms.
              They are written to be read, not skimmed past.
            </p>
            <p className="mt-6 font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
              LAST UPDATED: {LAST_UPDATED.toUpperCase()}
            </p>
          </PageDawn>

          <div className="mt-12">
            <Section number="01" title="Who we are">
              <p>
                {/* The space is explicit on purpose: with an entity later in
                    the same text, the compiler dropped the leading space after
                    the expression and rendered "made.It is". */}
                {CORE_LINE}{" "}
                It is operated by Urganization, based in
                Nigeria (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;).
                The service runs at urganize.app and team.urganize.app.
              </p>
            </Section>

            <Section number="02" title="The service">
              <p>
                Urganize helps artists, managers and record labels plan new
                music and keep track of every task: a plan built from your
                goals or one you make yourself, tasks with owners and dates,
                cover art and release details, press kits, event milestones,
                pitching to curators and opportunities, distribution through
                our partner, and our AI assistant. We improve the product
                continuously: features may change, and we may add, modify, or
                retire functionality.
              </p>
            </Section>

            <Section number="03" title="Accounts">
              <p>
                You can create an account with an email and password or with Google. You
                are responsible for your account and for keeping your sign-in
                secure. You must be 13 or older. Provide accurate information.
                Billing and access depend on it.
              </p>
            </Section>

            <Section number="04" title="Trial, subscriptions, and billing">
              <p>
                Urganize is in public beta, so features may change as we
                improve it. Anyone can create an account. To plan rollouts and
                run tasks, your team needs a paid plan. Without a plan, you can
                still buy credits and use them for AI. Paid plans are a
                subscription, priced per team and paid monthly or once a year
                through Paystack, whichever you pick. We never see or store your
                card details.
              </p>
              <p>
                Subscriptions renew at the end of each period. If we change our
                prices, your renewal stays at the price you signed up on unless
                we agree otherwise with you. You can cancel anytime from
                Settings; you keep access through the period you already paid
                for. Access is locked when a trial ends
                without a subscription, when a payment fails or when a
                subscription lapses. Nothing you created is deleted when access
                is locked.
              </p>
              <p>
                Refunds are handled case by case. Email{" "}
                <a
                  href={CONTACT_HREF}
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  contact@urganize.app
                </a>
                .
              </p>
            </Section>

            <Section number="05" title="Your content">
              <p>
                You own everything you put into Urganize: releases, tasks,
                cover art, credits and release details. You grant us only the
                license we need to operate the service: hosting, processing,
                and displaying your content to you and the teammates you
                invite.
              </p>
              <p>
                Teams are shared. People you invite to your team can see and
                work on its releases and tasks. Invite accordingly.
              </p>
              <p>
                You are responsible for having the rights to what you upload.
                Don&apos;t send music or artwork you don&apos;t own or have
                permission to use.
              </p>
            </Section>

            <Section number="06" title="Acceptable use">
              <p>
                Use Urganize lawfully. Don&apos;t attempt to break, overload,
                or probe the service; don&apos;t use it to infringe rights,
                harass people, or store unlawful content; don&apos;t resell
                access. We may suspend or terminate accounts that violate
                these terms. Where reasonable, we&apos;ll warn you first.
              </p>
            </Section>

            <Section number="07" title="AI">
              <p>
                AI can plan, add and update releases and tasks when you
                ask it to. Check what it does. Its output is a draft for you to
                review, not professional advice, and we don&apos;t guarantee
                its accuracy or results. The product works without it. Each
                plan comes with a monthly allowance of AI credits, and
                unused credits roll over. How AI handles your data is covered in our{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  privacy policy
                </Link>
                .
              </p>
            </Section>

            <Section number="08" title="Distribution, pitching and press kits">
              <p>
                When you send a release to distribution, its audio goes from
                your device straight to our distribution partner, The Real
                Music Distro, and we pass its artwork and metadata to them. The
                partner&apos;s own terms also apply. You
                confirm that you hold the rights to the release and that its
                details (credits, splits, ISRC, UPC) are correct. Stores decide
                on their own when a release goes live and whether to approve
                it. Takedowns and changes go through us at your request.
              </p>
              <p>
                Whatever you put in a pitch is shared with the curator or
                opportunity you send it to. We don&apos;t promise placements,
                replies or results. Anyone with a press-kit link can view that
                press kit, so share it on purpose.
              </p>
            </Section>

            <Section number="09" title="Ending your account">
              <p>
                You can delete your account from Settings at any time. It
                takes effect immediately and removes your data as described in
                the privacy policy. We may suspend or terminate accounts for
                violations of these terms or non-payment, as described above.
              </p>
            </Section>

            <Section number="10" title="Disclaimers and liability">
              <p>
                Urganize is provided &ldquo;as is&rdquo;. We work hard to keep
                it fast and available, but we don&apos;t guarantee
                uninterrupted service, and we are not liable for indirect,
                incidental, or consequential damages, including lost profits
                or lost opportunities around a release. Our total liability to
                you is limited to the amounts you paid us in the 12 months
                before the claim.
              </p>
              <p>
                Keep your own copies of your recordings and artwork. Urganize
                does not store your audio, and it is not your archive of
                record.
              </p>
            </Section>

            <Section number="11" title="Governing law">
              <p>
                These terms are governed by the laws of the Federal Republic of
                Nigeria, and disputes are subject to the jurisdiction of
                Nigerian courts.
              </p>
            </Section>

            <Section number="12" title="Changes to these terms">
              <p>
                We update these terms when the product or our practices
                actually change. We&apos;ll post the new version here and
                update the date at the top; material changes will be flagged
                in-product. Continuing to use Urganize after a change means
                you accept the updated terms.
              </p>
            </Section>

            <Section number="13" title="Contact">
              <p>
                Questions about these terms:{" "}
                <a
                  href={CONTACT_HREF}
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
                </Link>{" "}
                and{" "}
                <Link
                  href="/subprocessors"
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  subprocessors
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

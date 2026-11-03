import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection as Section } from "../components/marketing/LegalSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_CLAUSE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";

// noIndex: this page was outranking the homepage for the query "urganize" —
// a legal document, not the pitch, was the first thing a searcher saw. It
// stays public, linked, and reachable; it just never competes as a result.
export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    `What Urganize collects, why, who processes it and the choices you have. The privacy policy for Urganize, ${CORE_CLAUSE}.`,
  path: "/privacy",
  noIndex: true,
});

// Keep this date REAL. It only moves when the policy text actually changes —
// never wire it to new Date() (the old version did, which made the policy
// claim it was updated every day).
const LAST_UPDATED = "October 19, 2026";

const CONTACT_HREF =
  "mailto:contact@urganize.app?subject=Privacy%20question%20-%20Urganize";

// Every claim below is checked against the codebase as of LAST_UPDATED.
// When the product's data handling changes (new analytics tool, new AI
// provider, email provider added), update this page in the same PR.

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-4xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Privacy Policy
            </p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              How Urganize handles your data
            </h1>
            <p className="mt-5 max-w-[40rem] text-lg leading-8 text-[var(--marketing-text-muted)]">
              This policy explains what we collect, why we collect it, who
              processes it, and the choices you have. We keep it short, specific,
              and true to how the product works today.
            </p>
            <p className="mt-6 font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
              LAST UPDATED: {LAST_UPDATED.toUpperCase()}
            </p>
          </PageDawn>

          {/* Quick summary */}
          <div className="mt-12 border border-[color:var(--marketing-border)] p-7 sm:p-8">
            <p className="mono-label text-[var(--marketing-accent)]">
              The short version
            </p>
            <ul className="mt-5 space-y-3 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
              <li>
                — We collect what we need to run Urganize: your account, your
                release data, and product usage.
              </li>
              <li>
                — Payments are processed by Paystack. We never see or store
                your card details.
              </li>
              <li>
                — We use analytics (Google Analytics, Vercel Analytics,
                PostHog) to understand product usage.
              </li>
              <li>
                — AI sends the release context it needs to our AI provider,
                only to do what you asked. We do not use your content to train
                AI models.
              </li>
              <li>
                — You can delete your account yourself, in the app, instantly.
              </li>
            </ul>
          </div>

          <div className="mt-12">
            <Section number="01" title="Who we are">
              <p>
                Urganize (&ldquo;we&rdquo;, &ldquo;our&rdquo;,
                &ldquo;us&rdquo;) is {CORE_CLAUSE}. It is operated by
                Urganization, based in Nigeria.
              </p>
              <p>
                For privacy questions, email{" "}
                <a
                  href={CONTACT_HREF}
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  contact@urganize.app
                </a>
                .
              </p>
            </Section>

            <Section number="02" title="Who can use Urganize">
              <p>
                Urganize is not intended for children under 13, and we do not
                knowingly collect personal information from them. If you
                believe a child has provided us personal data, contact us and
                we will delete it.
              </p>
            </Section>

            <Section number="03" title="What we collect">
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Account data.
                </strong>{" "}
                Email address and password (or your Google account email if you
                sign in with Google), your name and role if you provide them,
                and your team settings.
              </p>
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Setup answers.
                </strong>{" "}
                The questions we ask when you first set up your team: what
                you&apos;re working on, where your releases usually fall apart,
                what stage the release is at, and how you want releases
                planned. We keep these to decide what to put in front of you
                first and to work out which parts of the product to sharpen.
              </p>
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Release data.
                </strong>{" "}
                Everything you put into Urganize: artists, releases,
                dates, tasks, comments, event milestones, teammates you invite
                (their email addresses), and the files you upload: masters,
                artwork, contracts, split sheets.
              </p>
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Billing data.
                </strong>{" "}
                Your plan, payment references, amounts, and subscription
                status. Card details go directly to Paystack and never touch
                our servers.
              </p>
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Usage and device data.
                </strong>{" "}
                Pages viewed, features used, IP address, browser and device
                information, and server logs for debugging and security.
              </p>
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Waitlist data.
                </strong>{" "}
                If you join our waitlist, we collect your email, name, and
                phone number, plus a few qualification questions (your role,
                team size, how many releases you run, and what you need
                most). We also capture basic marketing attribution: the page
                you signed up from, how you found us, and any campaign
                parameters in the URL, to understand what&apos;s working.
              </p>
              <p>
                <strong className="text-[var(--marketing-text)]">
                  Survey data.
                </strong>{" "}
                If you answer an in-product survey (via Formbricks), we keep
                what you submitted.
              </p>
            </Section>

            <Section number="04" title="How we use it">
              <p>— To provide and operate Urganize.</p>
              <p>
                — To build your release plan and, when you use AI, to do
                what you ask it to (see section 05).
              </p>
              <p>
                — To improve performance, reliability, and the product itself.
              </p>
              <p>
                — To communicate with you about your account and the product.
              </p>
              <p>— To prevent fraud, abuse, and security issues.</p>
              <p>
                We share data outside Urganize only when you act: audio,
                artwork and release metadata go to our distribution partner
                when you send a release; what you put in a pitch goes to the
                curator or opportunity you send it to; and anyone with a
                press-kit link can see that press kit.
              </p>
              <p>
                We do not sell your personal data, and beyond those, we do not
                share your release data with anyone except the service
                providers (including error monitoring and account email)
                listed on our{" "}
                <Link
                  href="/subprocessors"
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  subprocessors page
                </Link>
                .
              </p>
            </Section>

            <Section number="05" title="AI processing">
              <p>
                When you use AI, the release details, tasks and messages it
                needs are sent through our AI gateway to a third-party AI model
                provider, solely to do what you asked. Your uploaded files are
                never sent.
              </p>
              <p>
                If you talk to AI instead of typing, the voice clip is sent
                to the same AI provider to turn into text, and the clip is not
                stored. The text lands in the message box for you to read and
                edit before anything is sent.
              </p>
              <p>
                We do not use your content to train AI models, and we use
                providers whose terms do not train on customer API data. AI
                output is a draft for you to edit. The product works without
                it.
              </p>
            </Section>

            <Section number="06" title="Cookies, analytics, and storage">
              <p>
                We use Google Analytics and Vercel Analytics on our marketing
                site, and PostHog and Vercel Analytics inside the app, to
                understand how Urganize is used. These tools may set cookies or
                collect device identifiers and usage events.
              </p>
              <p>
                The app also stores your session and some app state in
                your browser&apos;s local storage so it loads fast and keeps
                you signed in. Clearing your browser storage signs you out.
              </p>
            </Section>

            <Section number="07" title="Support channels">
              <p>
                In-app support runs through WhatsApp: the &ldquo;chat with the
                founder&rdquo; button opens a WhatsApp conversation. Anything
                you send there is processed by WhatsApp (Meta) under their own
                privacy policy. Don&apos;t send passwords or card details over
                chat; we will never ask for them.
              </p>
            </Section>

            <Section number="08" title="Where your data lives">
              <p>
                App data and uploaded files are stored with Supabase; waitlist
                data is stored with Neon; the product is hosted on Vercel.
                These run on global cloud infrastructure, so your information
                may be stored and processed outside your country of residence.
                The full list of providers is on the{" "}
                <Link
                  href="/subprocessors"
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  subprocessors page
                </Link>
                .
              </p>
            </Section>

            <Section number="09" title="Your rights">
              <p>
                Depending on where you live (including under the Nigeria Data
                Protection Act and the GDPR), you may have the right to access,
                correct, export, or delete your personal data, and to withdraw
                consent where processing is based on it.
              </p>
              <p>
                To make a request, email{" "}
                <a
                  href={CONTACT_HREF}
                  className="font-medium text-[var(--marketing-accent)] hover:opacity-80"
                >
                  contact@urganize.app
                </a>{" "}
                from the address associated with your account.
              </p>
            </Section>

            <Section number="10" title="Account deletion">
              <p>
                You can delete your account yourself from Settings. It takes
                effect immediately and removes your releases, tasks, profile,
                and sign-in, and deletes your uploaded files. We
                may retain minimal payment records where required for
                accounting and legal compliance, and residual copies may
                persist briefly in encrypted backups before being overwritten.
              </p>
            </Section>

            <Section number="11" title="Security">
              <p>
                Your data is protected with encryption in transit, row-level
                access controls in our database, and signed, expiring links for
                file access. No system can guarantee absolute security. If we
                learn of a breach affecting your data, we will notify you.
              </p>
            </Section>

            <Section number="12" title="Changes to this policy">
              <p>
                We update this policy when how we handle data actually changes,
                post the new version here, and change the date at the top. The
                date only moves when the text does.
              </p>
            </Section>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

import Link from "next/link";

export default function SubprocessorsPage() {
  const subprocessors = [
    {
      name: "Vercel",
      purpose: "Hosting and deployment",
      data: "App traffic, server logs, operational data",
    },
    {
      name: "Google Analytics",
      purpose: "Usage analytics",
      data: "Device identifiers, usage events, IP (may be processed), cookies",
    },
    {
      name: "Google Gemini",
      purpose: "AI processing for guidance and recommendations",
      data: "User inputs and context needed to generate outputs",
    },
    {
      name: "Paystack",
      purpose: "Payment processing",
      data: "Billing metadata and transaction details (we do not store card details)",
    },
    {
      name: "Gmail",
      purpose: "Email communications",
      data: "Email content and addresses",
    },
    {
      name: "Neon",
      purpose: "Database infrastructure",
      data: "User account and product data stored by Urganize",
    },
    {
      name: "Supabase",
      purpose: "Authentication and storage services",
      data: "Auth identifiers, tokens, and files you upload (if enabled)",
    },
    {
      name: "Slack",
      purpose: "Internal team communication",
      data: "Operational messages (may include support context if shared internally)",
    },
    {
      name: "WhatsApp",
      purpose: "Customer messaging and support",
      data: "Messages and identifiers needed to communicate with you",
    },
    {
      name: "Telegram",
      purpose: "Customer messaging and support",
      data: "Messages and identifiers needed to communicate with you",
    },
    {
      name: "MailerLite",
      purpose: "Product updates and marketing emails",
      data: "Email address, subscription preferences, email engagement metrics",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] px-6 py-24 text-[var(--marketing-text)]">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)] transition-colors hover:text-[var(--marketing-text)]"
        >
          ← Back to home
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tighter md:text-6xl">
          Subprocessors
        </h1>

        <p className="mt-6 max-w-3xl text-lg text-[var(--marketing-text-muted)]">
          Urganize uses trusted third-party services (&ldquo;subprocessors&rdquo;) to help us
          operate the platform. This page lists the subprocessors we may use and what they do.
        </p>

        <div className="mt-10 rounded-[2rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8">
          <h2 className="text-xl font-bold text-[var(--marketing-text)]">Quick summary</h2>
          <ul className="mt-4 space-y-2 text-[var(--marketing-text-muted)]">
            <li>• We use subprocessors for hosting, analytics, payments, AI, and communication.</li>
            <li>• We do not store your card details. Payments are processed by Paystack.</li>
            <li>• This list may change as Urganize evolves.</li>
          </ul>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          {subprocessors.map((s) => (
            <div
              key={s.name}
              className="rounded-[2rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8 transition-colors hover:border-[var(--marketing-border-strong)]"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-bold text-[var(--marketing-text)]">{s.name}</h3>
                <span className="rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
                  Subprocessor
                </span>
              </div>

              <p className="mt-4 text-[var(--marketing-text-muted)]">
                <span className="text-[var(--marketing-text-subtle)]">Purpose:</span> {s.purpose}
              </p>

              <p className="mt-3 text-[var(--marketing-text-muted)]">
                <span className="text-[var(--marketing-text-subtle)]">Data involved:</span> {s.data}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-[2.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-10">
          <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Changes to subprocessors</h2>
          <p className="mt-4 text-lg text-[var(--marketing-text-muted)]">
            We may add, remove, or replace subprocessors as Urganize evolves. If you have
            questions about this list, contact us at{" "}
            <a
              href="mailto:theurganization@gmail.com"
              className="font-semibold text-[var(--marketing-accent)] transition-colors hover:opacity-80"
            >
              theurganization@gmail.com
            </a>
            .
          </p>
        </div>

        <div className="mt-16 flex justify-between border-t border-[var(--marketing-border)] pt-6 text-xs uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)]">
          <span>© The Urganization</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="transition-colors hover:text-[var(--marketing-text)]">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--marketing-text)]">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

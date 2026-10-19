"use client";

import { useState, type FormEvent } from "react";
import { trackEvent } from "@/lib/analytics";

// Inline waitlist capture. It WAS the landing page's primary CTA from
// 2026-07-15 (visitors weren't converting to sign-ups from the site alone)
// until the 2026-09-02 overhaul: with the two lowest tiers self-serve since
// 2026-08-30, the homepage's primary ask is the free trial (TrialButton) and
// this form survives there only behind WaitlistDisclosure under the final
// CTA. The homepage_hero source is retired; homepage_final_cta lives on.
// /features and the three self-serve persona pages fold it behind the same
// disclosure; /pricing and /for-curators (invite-only accounts, so a queue is
// the honest ask there) still mount it directly.
// Progressive two-step so the first touch stays light:
// step 1 is just email + "Join now"; step 2 asks for name + phone (the
// founder's manual WhatsApp outreach needs a reachable number) plus ONE
// optional role select. Slimmed 2026-08-13 (founder call): step 2 used to
// demand 6 required fields — name, phone, and 4 qualification selects —
// right after a one-field "Join now" promise, the page's biggest drop-off
// point. The teamSize/releaseVolume/primaryNeed selects were dropped from
// the UI entirely (POST /api/signup accepts them as optional now; the Neon
// columns were always nullable), and role stays as the one optional
// segmenting field the admin growth dashboard uses most. The header's
// primary button has pointed at the free trial since 2026-08-30 (see
// MarketingHeader.tsx); nothing links to /#waitlist any more.

const ROLE_OPTIONS = [
  { value: "artist_manager", label: "Artist manager" },
  { value: "independent_artist", label: "Independent artist" },
  { value: "label_manager_executive", label: "Label manager" },
  { value: "a_and_r", label: "A&R" },
  { value: "music_producer", label: "Music producer" },
  // Added 2026-08-21 alongside /for-curators: a real segmenting option, not
  // just copy, since this value round-trips through POST /api/signup's Zod
  // enum and the admin growth/waitlist dashboards' roleLabels maps (both
  // updated to match — see WaitlistAdminPageClient.tsx). A curator waitlist
  // signup is a separate thing from the app's actual curator accounts
  // (playlist-pitching's invite-only `curator_profiles`, still behind
  // NEXT_PUBLIC_FEATURE_PITCHING) — this only tags who to reach out to.
  { value: "curator", label: "Playlist curator" },
] as const;

const inputClassName =
  "w-full rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-5 py-3 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-text)] sm:text-base";

const selectClassName =
  "w-full rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-4 py-3 text-sm text-[var(--marketing-text)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-text)]";

const buttonBaseClassName =
  "relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full px-7 py-3.5 text-sm font-medium tracking-[-0.02em] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto disabled:opacity-60 sm:text-base";

const buttonClassName = `${buttonBaseClassName} bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]`;

const accentButtonClassName = `${buttonBaseClassName} home-action`;

function collectMetadata(source: string) {
  if (typeof window === "undefined") return { source };
  const params = new URLSearchParams(window.location.search);
  const pick = (key: string) => params.get(key) || undefined;
  return {
    source,
    pageUrl: window.location.href,
    referrer: document.referrer || undefined,
    utmSource: pick("utm_source"),
    utmMedium: pick("utm_medium"),
    utmCampaign: pick("utm_campaign"),
    utmTerm: pick("utm_term"),
    utmContent: pick("utm_content"),
    ref: pick("ref"),
  };
}

// Optional props (2026-10-17, URG-334, homepage v2): the homepage names the
// button for what happens ("Join the waitlist"), sets its own hint line and
// fills the button with the accent (`.home-action`, globals.css). Every other
// page passes only `source` and renders exactly as before.
export function WaitlistForm({
  source,
  // Defaults since 2026-10-19 (founder call): "Join waitlist" and no hint
  // line (the old "JOIN THE WAITLIST" label under "Join now" read as a stray).
  buttonLabel = "Join waitlist",
  hint = null,
  accent = false,
}: {
  source: string;
  buttonLabel?: string;
  hint?: string | null;
  accent?: boolean;
}) {
  const actionClassName = accent ? accentButtonClassName : buttonClassName;
  const [step, setStep] = useState<"email" | "details" | "done">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");

  const handleEmailStep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStep("details");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          phone: phone.trim(),
          // Optional: an empty string would fail the API's role enum, so
          // send the field only when a choice was actually made.
          role: role || undefined,
          metadata: collectMetadata(source),
        }),
      });

      if (response.status === 409) {
        setDoneMessage("You're already on the list. We'll be in touch.");
        setStep("done");
        trackEvent("waitlist_submit", { source, outcome: "duplicate" });
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Something went wrong. Try again.");
        return;
      }

      setDoneMessage("You're on the list. We'll reach out soon.");
      setStep("done");
      trackEvent("waitlist_submit", { source, outcome: "new" });
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <div
        role="status"
        className="relative z-[60] mx-auto w-full max-w-[28rem] rounded-2xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] px-6 py-5 text-center"
      >
        <p className="text-base font-medium text-[var(--marketing-text)]">{doneMessage}</p>
      </div>
    );
  }

  if (step === "email") {
    return (
      <form
        onSubmit={handleEmailStep}
        className="relative z-[60] mx-auto flex w-full max-w-[30rem] flex-col items-center gap-3"
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          {/* name + autoComplete let a phone offer the saved address in one
              tap. type="email" already picks the email keyboard, so no
              inputMode is needed here or on the phone field. */}
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className={inputClassName}
          />
          <button type="submit" className={`${actionClassName} shrink-0`}>
            {buttonLabel}
          </button>
        </div>
        {hint ? (
          <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
            {hint}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-[60] mx-auto flex w-full max-w-[34rem] flex-col gap-3 text-left"
    >
      {/* Step 2 explains itself: the old form dropped 6 required fields on
          the visitor with no framing at all. */}
      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--marketing-text)]">
          Almost in.
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--marketing-text-muted)]">
          Leave a name and number so we can reach you when your spot opens.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          name="name"
          autoComplete="name"
          required
          minLength={1}
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className={inputClassName}
        />
        {/* pattern is escaped for the v-flag regex semantics browsers now
            apply to the attribute: unescaped ( ) . - inside a character
            class throw, and a throwing pattern is silently ignored (the old
            value logged "Invalid regular expression" and validated nothing).
            The API's Zod regex is a plain JS regex and is fine unescaped. */}
        {/* title is what the browser shows beside its bare "Please match
            the requested format." so the person is told what the format is.
            It names the same characters the pattern and the API accept. */}
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          required
          minLength={7}
          maxLength={32}
          pattern="[+\d\s\(\)\.\-]+"
          title="Use digits, spaces and + ( ) . - only, for example +234 801 234 5678."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          aria-label="Phone number"
          className={inputClassName}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="What best describes you (optional)"
          className={`${selectClassName} sm:col-span-2`}
        >
          <option value="">What best describes you? (optional)</option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* role="alert" so a screen reader announces a failed submit the
          moment it appears; the line is only mounted on an error, which is
          what makes the announcement fire. */}
      {error ? (
        <p role="alert" className="text-center text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3">
        <button type="submit" disabled={isSubmitting} className={actionClassName}>
          {isSubmitting ? "Joining…" : "Join waitlist"}
        </button>
        <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          {email.toUpperCase()}
        </p>
      </div>
    </form>
  );
}

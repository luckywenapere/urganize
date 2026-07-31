"use client";

import { useState, type FormEvent } from "react";

// Inline waitlist capture — the landing page's primary CTA (reverted from
// direct app signup 2026-07-15: visitors weren't converting to sign-ups from
// the site alone). Progressive two-step so the first touch stays light:
// step 1 is just email + "Join now"; step 2 reveals the qualification fields
// POST /api/signup requires (they feed the Neon waitlist table the admin
// growth dashboard segments on — the endpoint predates this form and is
// reused unchanged, per the CLAUDE.md rule: new surface, same pipeline).
// The header's Login / Start free links are deliberately untouched.

const ROLE_OPTIONS = [
  { value: "artist_manager", label: "Artist manager" },
  { value: "independent_artist", label: "Independent artist" },
  { value: "label_manager_executive", label: "Label manager" },
  { value: "a_and_r", label: "A&R" },
  { value: "music_producer", label: "Music producer" },
] as const;

const TEAM_SIZE_OPTIONS = [
  { value: "solo", label: "Just me" },
  { value: "two_to_three", label: "2–3 people" },
  { value: "four_to_six", label: "4–6 people" },
  { value: "seven_plus", label: "7+ people" },
] as const;

const RELEASE_VOLUME_OPTIONS = [
  { value: "one", label: "1" },
  { value: "two_to_four", label: "2–4" },
  { value: "five_plus", label: "5+" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

const PRIMARY_NEED_OPTIONS = [
  { value: "release_playbook", label: "Release planning" },
  { value: "team_handoff", label: "Passing work to my team" },
  { value: "collaborator_credits", label: "Credits" },
  { value: "all_of_it", label: "All of it" },
] as const;

const inputClassName =
  "w-full rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-5 py-3 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-text)] sm:text-base";

const selectClassName =
  "w-full rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-4 py-3 text-sm text-[var(--marketing-text)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-text)]";

const buttonClassName =
  "relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] disabled:opacity-60 sm:text-base";

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

export function WaitlistForm({ source }: { source: string }) {
  const [step, setStep] = useState<"email" | "details" | "done">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [releaseVolume, setReleaseVolume] = useState("");
  const [primaryNeed, setPrimaryNeed] = useState("");
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
          role,
          teamSize,
          releaseVolume,
          primaryNeed,
          metadata: collectMetadata(source),
        }),
      });

      if (response.status === 409) {
        setDoneMessage("You're already on the list. We'll be in touch.");
        setStep("done");
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Something went wrong. Try again.");
        return;
      }

      setDoneMessage("You're on the list. We'll reach out soon.");
      setStep("done");
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
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className={inputClassName}
          />
          <button type="submit" className={`${buttonClassName} shrink-0`}>
            Join now
          </button>
        </div>
        <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          JOIN THE WAITLIST
        </p>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-[60] mx-auto flex w-full max-w-[34rem] flex-col gap-3 text-left"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          required
          minLength={1}
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className={inputClassName}
        />
        <input
          type="tel"
          required
          minLength={7}
          maxLength={32}
          pattern="[+\d\s().-]+"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          aria-label="Phone number"
          className={inputClassName}
        />
        <select
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="What best describes you"
          className={selectClassName}
        >
          <option value="" disabled>
            What best describes you?
          </option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          required
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value)}
          aria-label="Team size"
          className={selectClassName}
        >
          <option value="" disabled>
            Team size
          </option>
          {TEAM_SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          required
          value={releaseVolume}
          onChange={(e) => setReleaseVolume(e.target.value)}
          aria-label="Releases you're planning"
          className={selectClassName}
        >
          <option value="" disabled>
            Releases you&apos;re planning
          </option>
          {RELEASE_VOLUME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          required
          value={primaryNeed}
          onChange={(e) => setPrimaryNeed(e.target.value)}
          aria-label="What do you need most"
          className={selectClassName}
        >
          <option value="" disabled>
            What do you need most?
          </option>
          {PRIMARY_NEED_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col items-center gap-3">
        <button type="submit" disabled={isSubmitting} className={buttonClassName}>
          {isSubmitting ? "Joining…" : "Join the waitlist"}
        </button>
        <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          {email.toUpperCase()}
        </p>
      </div>
    </form>
  );
}

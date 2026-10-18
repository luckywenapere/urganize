"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

type Mode = "sign_in" | "sign_up";

/**
 * Sign-in/sign-up panel for the roadmap board. Independent of apps/web's
 * /auth flow (separate session, same auth.users pool -- see
 * lib/supabase/client.ts). Every call passes an EXPLICIT redirect target
 * rather than relying on the Supabase project's shared Site URL, which
 * defaults to app.urganize.app -- omitting this would strand homepage users
 * on the wrong domain after a confirmation email or OAuth round-trip.
 */
export function AuthPanel({ onClose }: { onClose?: () => void }) {
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const callbackUrl = () =>
    typeof window !== "undefined" ? `${window.location.origin}/roadmap/auth/callback` : "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === "sign_up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          // Email confirmation is required on this project -- no session yet.
          setCheckEmail(true);
          return;
        }
        onClose?.();
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) throw signInError;
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) setError(oauthError.message);
  };

  if (checkEmail) {
    return (
      <div className="rounded-2xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] p-6 text-center">
        <h3 className="text-lg text-[var(--marketing-text)]">Check your email</h3>
        <p className="mt-2 text-sm text-[var(--marketing-text-muted)]">
          We sent a confirmation link to <strong>{email}</strong>. Confirm it, then come back
          here to sign in and vote.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] p-6">
      <h3 className="text-lg text-[var(--marketing-text)]">
        {mode === "sign_in" ? "Sign in to vote" : "Create an account to vote"}
      </h3>
      <p className="mt-1 text-sm text-[var(--marketing-text-muted)]">
        Same account works across Urganize — one email, one password.
      </p>

      <button
        type="button"
        onClick={handleGoogle}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-secondary)] px-4 py-2.5 text-sm font-medium text-[var(--marketing-secondary-text)] transition-colors hover:bg-[var(--marketing-secondary-hover)]"
      >
        Continue with Google
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-[color:var(--marketing-border)]" />
        <span className="mono-label text-[var(--marketing-text-subtle)]">or</span>
        <div className="h-px flex-1 bg-[color:var(--marketing-border)]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="w-full rounded-lg border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] px-3 py-2.5 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-primary)]"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          aria-label="Password"
          className="w-full rounded-lg border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] px-3 py-2.5 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-primary)]"
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-[var(--marketing-primary)] px-4 py-2.5 text-sm font-medium text-[var(--marketing-primary-text)] transition-opacity hover:bg-[var(--marketing-primary-hover)] disabled:opacity-60"
        >
          {isSubmitting ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign_in" ? "sign_up" : "sign_in");
          setError("");
        }}
        className="mt-4 w-full text-center text-sm text-[var(--marketing-text-subtle)] hover:text-[var(--marketing-text)]"
      >
        {mode === "sign_in" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

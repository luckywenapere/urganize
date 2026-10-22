# First-release prompt: deferred and dismissible (2026-08-28, v1.4.2)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: for accounts with zero releases, the create-release pop-up must
not open the moment they land — "they have to log in first, look at how it looks
before the pop-up comes up," with the trigger choice delegated ("time-based …
or when they try to click on something … just decide"). His read was that the
instant pop-up churns people who wanted to see the workspace first.

**What changed, in one line: the URG-217 wall is gone.** The old mechanism was
instant AND inescapable — `CreateReleaseModal` read `useFirstReleaseRequired`
as `isMandatory` and dropped every exit (no Escape, no backdrop, no X, no
Cancel; a Sign out button as the only way off), while two identical effects
(`WorkspaceView`, `ChappiPageClient`) opened it the moment the store confirmed
zero releases. Both halves had to move together: a pop-up that arrives 30
seconds later but still cannot be closed contradicts "look before creating" —
the wall IS the churn moment, just delayed. And because the modal read the hook
itself, every instance was inescapable for a zero-release user however it was
opened, including AppShell's manual one. Dismissal now lands on the existing
"No releases yet" empty state, whose Create release button remains the standing
CTA.

**The trigger that won the evaluation: a 30s dwell timer, once per browser
session.** First-interaction triggers punish exactly the exploring this exists
to allow; exit intent is mouse-tracking theater that fails on phones; idle
detection is the politest but needs global listeners nobody else has (principle
6); never-auto-opening drops the activation nudge the founder explicitly kept.
A settle delay has house precedent — `PushPermissionPrompt`'s `ASK_DELAY_MS`.

**Five things worth knowing before editing this:**

1. **The countdown lives in sessionStorage (`urganize.first-release.prompt`,
   `{ armedAt, shownAt? }`) so it SPANS the two surfaces** that mount the hook
   (`/dashboard` and `/dashboard/urgans`) instead of restarting on every
   navigation — a per-mount timer would either never fire for a user hopping
   pages or fire once per page. Per tab; a fresh session re-arms, so a
   returning zero-release user gets one gentle re-prompt per visit. Pure
   decision logic in `lib/first-release-prompt.ts` (unit-tested), timer + fire
   guards in `components/releases/useFirstReleasePrompt.ts`.
2. **The two modules fail in OPPOSITE directions, on purpose.** The predicate
   (`lib/first-release-required.ts`) fails OPEN — uncertain ⇒ not required —
   because a wrong `true` used to wall people in. The prompt storage fails
   CLOSED — broken sessionStorage ⇒ never auto-open — because the only cost of
   silence is that the offer never arrives, and the empty-state CTA stands.
   `armPrompt` returning null on a failed write is load-bearing: arming a
   timer without a stored `armedAt` would run a private countdown that
   restarts on every mount.
3. **Four fire-time guards, all failing toward not interrupting:** re-check
   the predicate from live snapshots (a release created via UrgAns/MCP since
   arming wins); a hidden tab defers to the next `visibilitychange`; another
   modal holding the body scroll lock (WhatsNew, or a create modal the user
   opened themselves seconds earlier — `isBodyScrollLocked()`, a new read-only
   getter on `lib/body-scroll-lock.ts`) consumes the session's prompt
   silently; an UrgAns conversation in progress (`messages.length > 0`, any of
   its three surfaces) consumes silently — the assistant is itself an
   activation path and must not be talked over. Mark-then-open, so a crash
   between the two fails toward silence.
4. **The modal keeps its first-release COPY, keyed on the renamed
   `isFirstRelease` read** ("Welcome to Urganize / Create your first release /
   Every release gets its own workspace…") — the wall and the timing were the
   problem, not the framing. The Tab-trap was kept and made UNCONDITIONAL,
   matching `TaskQuickCreateModal`'s identical trap (a dialog's backdrop
   already communicates that the page behind is inert); the Sign out escape
   hatch went with the wall it compensated for, along with `handleSignOut`
   and the modal's `useRouter`/`useAuthStore` imports.
5. **Who this actually serves:** the onboarding wizard creates the first
   release before `onboarding_completed` is stamped, so the wizard path never
   sees the prompt. The zero-release population is people who deleted their
   last release (still re-arms by design), teammates invited into a team with
   no releases yet (invite-accept stamps onboarding complete), and
   artist-scoped members whose artist has no releases — the last two being
   exactly the people the old modal's own docstring admitted "shouldn't be
   creating releases" while offering them Sign out as the only exit. They now
   get a dismissible offer; role-aware suppression is a plausible follow-up,
   not this change.

No new feature flag (the back-arrow/mobile-scene-nav/Collect-metadata
precedent for founder-driven UX reworks of shipped surfaces); revert is git
revert. No analytics on the prompt — `NEXT_PUBLIC_POSTHOG_KEY` is still unset
in production, so an event would record nothing (the documented telemetry
correction).

**Verified:** the full vitest suite green including 11 new cases in
`lib/first-release-prompt.test.ts` (the cross-navigation resume, the
exactly-at-deadline fire, shownAt outranking everything, the clock-skew clamp,
the junk-rejection contract, delay bounds, key namespace); `eslint .` — 0 new
findings, and the change deletes three pre-existing warnings (the two
auto-open `set-state-in-effect`s and one in the sign-out path); `next build`
green by exit code with `/auth`, `/onboarding`, `/settings` still `○ Static`.
**Not verified:** nothing rendered in a browser — the workspace needs an
authenticated session this sandbox cannot mint. Worth one live pass: fresh
zero-release account → workspace + empty state, no modal; prompt at ~30s;
Escape/backdrop/X/Cancel all close it; no re-prompt that session while the CTA
still opens it; a /dashboard ↔ /dashboard/urgans hop resumes the countdown
rather than restarting it (seed
`sessionStorage['urganize.first-release.prompt']='{"armedAt":0}'` to skip the
wait).

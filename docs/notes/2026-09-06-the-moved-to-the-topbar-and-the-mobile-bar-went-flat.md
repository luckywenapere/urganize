# The "+" moved to the topbar, and the mobile bar went flat (2026-09-06)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, hours after the directory tab landed: *"Move the plus button to the
top right."*

**It is the same button, in the topbar's right corner, `lg:hidden`.** Its
contextual behaviour travelled with it — quick-create for a scoped release,
New release everywhere else — because that is the job TasksPanel's retired
mobile "New activity" pill left behind, and leaving it in the bar would have
orphaned it. `handleCreateClick` in `AppTopbar.tsx` is now the one
implementation; it reads `window.location.search` at CLICK time for the reason
the bar's version did, so the ACTION is right on the one transition a
render-time read lags (scoping a release on `/dashboard`, a same-pathname
replace).

**Four things worth knowing:**

1. **It is LAST in the topbar's right cluster, so it is the rightmost control
   at every width below `lg`.** Everything above it there is `lg:` or `md:`
   gated, so on a phone this is the only thing on that side and it balances
   the account link anchored top-left.
2. **The labelled "New release" pill stays `lg`-only and keeps plain
   `onNewRelease`.** On desktop TasksPanel still has its own New activity
   button, so making that pill contextual would change a behaviour nobody
   asked to change. `MOBILE_CREATE_DISPLAY` is the exact complement of the
   pill's own conditional, so the two can never both be on screen.
3. **Flag OFF, the icon renders nowhere.** Without
   `NEXT_PUBLIC_FEATURE_MOBILE_NAV` the pill shows from `sm` and MobileNavBar
   is not mounted at all, so an `lg:hidden` icon would double the CTA across
   the whole `sm`-to-`lg` range — and below `sm` there was no topbar create
   button before this. Flag off, that file behaves exactly as it did.
4. **`AppTopbar` now calls `useTaskUI()`, which THROWS outside its provider.**
   Safe today because the topbar has exactly one mount, inside
   `TaskUIProvider` in `AppShell`. A second mount anywhere outside it is a
   crash, not a degraded button.

**The bar is a plain row of tabs again, and that retired two rules.** The two
`flex-1` regions flanking a fixed 64px centre existed only to put the "+" on
the bar's midpoint. With the centre gone the whole 375px divides: six tabs are
~62px each and seven — the dual-account maximum — are ~54px, both over the
~44px touch target. So the "three per side" ceiling is gone, and with it **the
dual-account exclusion the Directory tab carried for exactly one day**: that
constraint was an artefact of the centre button, and once the button left it
had no reason. Every account sees Directory now. Which side a tab sits on is
an ORDERING question now rather than a width one.

**Verified:** 2685 tests unchanged, `eslint .` at the exact 3-error /
80-warning baseline, `next build` green by exit code with
`NEXT_PUBLIC_FEATURE_MOBILE_NAV` on and off, `/auth`, `/onboarding`,
`/settings` and `/dashboard` all still `○ Static` in each. **Not verified:**
nothing has rendered on a phone from here — the position of the button against
a real thumb, and the bar at seven tabs, are both unobserved.

# Marketing site log

One entry per fix to urganize.app (`apps/homepage`), newest first. Each entry is written before the fix: what is wrong, where to see it, and why it costs sign-ups. Proposals that touch the headline, positioning, pricing or page structure are not built; they go in `notes/needs-lucky.md`.

## Baseline audit, 2026-10-09

Every route (27, including the 404 page) at 390px and 1440px, dark and light, in headless Chromium against a local dev server with the waitlist API mocked (nothing could reach a database).

Clean: no horizontal overflow at 390px, no broken images, every image has alt text, one `h1` per page, every form field has a label or `aria-label`, no dead internal links, the waitlist form works end to end (email, then name and phone, then the success line; a bad phone number and a bad email are both refused). The only console errors were requests the sandbox cannot make (Google Tag Manager, Vercel analytics). `/roadmap` is a 404 because its flag is off, as intended; `/press` goes to `/brand` and `/for-labels` to `/pricing`, as intended.

Open, in the order they will be taken:

1. Everything below the first screen is invisible without JavaScript, and until it loads on a slow link. **Fixed in the first entry below.**
2. Tapping "Try Urganize" lands on the waitlist form with its headline ("Put your next rollout on plan.") hidden behind the fixed header (`id="waitlist"` sits on the div under the heading).
3. `/pricing` footnote says "Every plan is paid once a year." but the card has a Monthly / Yearly toggle that opens on Monthly, and `packages/pricing` sells both.
4. `/pricing` meta description still says "how to book a demo with the founders" (stale; the page now has a waitlist and a free-trial style ask).
5. Waitlist form fields have no `autocomplete` / `inputmode`, the phone field gives no hint when the pattern fails, and the error line is not announced to screen readers (`role="alert"` missing).
6. Header "Try Urganize" is 36px tall and the "Product" button 20px tall at 390px (under the 44px target); theme toggle is 40x40.
7. Product shots on a phone are desktop screenshots shrunk to about 330px wide and cannot be read.
8. The press kit shot still reads "Made with Urganize, the operating system" (the app dropped that line). Retaking shots needs a signed-in headed Chrome, so it is in `notes/needs-lucky.md`.
9. `scripts/smoke-waitlist.mjs` looks for copy and an h1 that no longer exist.

## 2026-10-09 | Page blank below the first screen without JavaScript

**What is wrong.** `.scroll-reveal` started at `opacity: 0` in CSS and only a script (the `IntersectionObserver` in `ScrollReveal.tsx`) ever made a section visible. Eight homepage sections use it, including the pricing strip, the FAQ and the waitlist form. With JavaScript off, blocked, or not yet hydrated (a slow connection, a failed chunk), the page showed the hero and the logo strip and then roughly 6,500px of empty dark screen. The same happened on `/features` (about 1,700px).

**Where to see it.** Before: `before-nojs-home__01.png` (logo strip, then blank) and `before-nojs-home__03.png` (all blank). After: `after-nojs-home__01.png` and `after-nojs-home__06.png` (the waitlist form). All at 390px, JavaScript off. They are attached to the PR.

**Why it costs sign-ups.** The waitlist form is the last block of the homepage and the only sign-up path from the site. A visitor on a weak connection, or with a script blocker, scrolls into nothing and leaves. They also never see the pricing or the proof. It is also what a search or link-preview crawler that does not run scripts sees, minus the text.

**Fix.** Sections are shown by default. `ScrollReveal` hides one (`data-reveal="armed"`) only after it has run in the browser and only when the section is wholly below the fold; sections already on screen, or already scrolled past (a reload that restored the scroll position, a jump link), are left showing. No new component, no new dependency, nothing animated that was not animated before.

**Checked.** JavaScript off: all 8 sections at opacity 1. JavaScript blocked at the network: all 8 at 1. JavaScript on: all 8 start hidden below the fold and are visible after scrolling. Jump to `/#waitlist`: the six sections above the landing point stay shown. Homepage lint (0 errors, the 2 existing warnings), homepage build, and the positioning and copy guard tests in `apps/web` all pass.

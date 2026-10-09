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
10. `/pricing` bottom block still says "Not ready to talk yet? ... We'll reach out when the time is right for your team." There is no longer a sales conversation on that page (every plan sends you to the form), so "talk" promises something the page does not offer.

## 2026-10-09 | Tapping "Try Urganize" lands on a bare email field

**What is wrong.** Every "Try Urganize" button (hero, header, the four pricing cards, /signup) links to `/#waitlist`. The `id="waitlist"` sits on the div that wraps the form, which is *under* the headline "Put your next rollout on plan.", and `scroll-mt-28` then leaves the form just under the fixed header. So the page jumps to an email field and "JOIN THE WAITLIST", with the headline scrolled off the top. Seen at 390px: `cta/after-hero-tap.png`.

**Why it costs sign-ups.** This is the one click the whole site is built to earn. The visitor arrives from a button that said "Try Urganize", on a box with no sentence above it saying what they are about to do. A field with no question over it reads as a stray input, not the end of the pitch.

**Fix.** Move the anchor up to the block that holds the headline, and give it `scroll-mt-28` (112px) so the headline lands just under the fixed header (77px on a phone, 81px on desktop). `scroll-mt-24` was tried first and left the headline flush against the header, because the section slides up 20px after the browser has placed the anchor (the `ScrollReveal` entrance). One id moved and one margin class, no copy changed, nothing else on the page touched.

**Checked.** Tapping "Try Urganize" at 390px: header bottom 77px, headline top 92px, email field top 166px, so the headline reads above the form in dark and light. At 1440px the headline is visible with the form under it in both themes. Before: `cta/after-hero-tap.png`. After: `anchor/after-m390-dark.png`, `anchor/after-m390-light.png`, `anchor/after-d1440-dark.png`, `anchor/after-d1440-light.png`. Selectors that reach the form (`#waitlist input[type=email]`) still work.

## 2026-10-09 | Page blank below the first screen without JavaScript

**What is wrong.** `.scroll-reveal` started at `opacity: 0` in CSS and only a script (the `IntersectionObserver` in `ScrollReveal.tsx`) ever made a section visible. Eight homepage sections use it, including the pricing strip, the FAQ and the waitlist form. With JavaScript off, blocked, or not yet hydrated (a slow connection, a failed chunk), the page showed the hero and the logo strip and then roughly 6,500px of empty dark screen. The same happened on `/features` (about 1,700px).

**Where to see it.** Before: `before-nojs-home__01.png` (logo strip, then blank) and `before-nojs-home__03.png` (all blank). After: `after-nojs-home__01.png` and `after-nojs-home__06.png` (the waitlist form). All at 390px, JavaScript off. They are attached to the PR.

**Why it costs sign-ups.** The waitlist form is the last block of the homepage and the only sign-up path from the site. A visitor on a weak connection, or with a script blocker, scrolls into nothing and leaves. They also never see the pricing or the proof. It is also what a search or link-preview crawler that does not run scripts sees, minus the text.

**Fix.** Sections are shown by default. `ScrollReveal` hides one (`data-reveal="armed"`) only after it has run in the browser and only when the section is wholly below the fold; sections already on screen, or already scrolled past (a reload that restored the scroll position, a jump link), are left showing. No new component, no new dependency, nothing animated that was not animated before.

**Checked.** JavaScript off: all 8 sections at opacity 1. JavaScript blocked at the network: all 8 at 1. JavaScript on: all 8 start hidden below the fold and are visible after scrolling. Jump to `/#waitlist`: the six sections above the landing point stay shown. Homepage lint (0 errors, the 2 existing warnings), homepage build, and the positioning and copy guard tests in `apps/web` all pass.

**Merged.** #766, 2026-10-09 (squash).

**Merged.** #767, 2026-10-09 (squash).

## 2026-10-09 | /pricing says "paid once a year" next to a Monthly / Yearly switch

**What is wrong.** Under the four plan cards the footnote reads "Every plan is paid once a year." Right above the cards is a Monthly / Yearly switch that opens on Monthly, and both intervals are on sale (`SELLABLE_INTERVALS` in `packages/pricing`; `/terms` already says "paid monthly or once a year"). The line was true on 2026-09-08 when the switch did not exist and nobody changed it when monthly came back on 2026-09-10. Seen at 390px: `foot/before-m390-toggle-yearly.png` (the switch and the cards) and `foot/before-m390-footnote.png`.

**Why it costs sign-ups.** A visitor on Monthly reads a price like ₦5,000/month, scrolls to the small print and is told every plan is yearly. That is a pricing contradiction on the page people compare plans on, and it makes the monthly price look like a trick. It is the one place on the site that disagrees with `packages/pricing`.

**Fix.** The sentence in `PricingTierCards.tsx` now reads "You can pay monthly or once a year." (the wording `/terms` uses) and is built from `SELLABLE_INTERVALS`, the same list the switch above the cards reads, so the two cannot disagree again. If only yearly were ever on sale it says "Every plan is paid once a year."; if only monthly, "Every plan is paid monthly." No price, interval or plan definition touched.

**Checked.** `/pricing` at 390px and 1440px: the footnote now reads "You can pay monthly or once a year." with the Monthly / Yearly switch above it, on Monthly and on Yearly. No price, plan or interval changed. Before: `foot/before-m390-toggle-yearly.png`, `foot/before-m390-footnote.png`, `foot/before-d1440-footnote.png`. After: `foot/after-m390-toggle-monthly.png`, `foot/after-m390-toggle-yearly.png`, `foot/after-m390-footnote.png`, `foot/after-d1440-footnote.png`.

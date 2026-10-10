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
9. `scripts/smoke-waitlist.mjs` looks for copy and an h1 that no longer exist. **Fixed in the 2026-10-10 smoke-test entry below.**
10. `/pricing` bottom block still says "Not ready to talk yet? ... We'll reach out when the time is right for your team." There is no longer a sales conversation on that page (every plan sends you to the form), so "talk" promises something the page does not offer.

## 2026-10-10 | The waitlist smoke test checked a page that no longer exists

**What is wrong.** `apps/homepage/scripts/smoke-waitlist.mjs` (`npm run smoke:waitlist`) waits for the sentence "runs to plan." on the homepage and then clicks a button labelled "Not ready yet? Join the waitlist". The homepage has had neither for a while: the h1 is the founder's short line, and since 2026-10-07 the waitlist form is open on the page. The disclosure component that owned that button is not mounted anywhere on the site. So the script times out on its first wait and can only fail, whether or not the waitlist works. Separately, its default address, `127.0.0.1`, cannot work against `next dev`: Next 16's dev server blocks dev assets from another origin, so the page never hydrates and any check that needs the form's JavaScript times out.

**Why it costs sign-ups.** It is the only check that exercises the one sign-up path on the site, and a check that always fails gets ignored. The two things the earlier entries today fixed (the page showing without scripts, and "Try Urganize" landing on the form's headline) had nothing guarding them, and a future change to the header or the final section could break the waitlist with no signal.

**Fix.** The script now does what a visitor does, at a desktop (1280x900) and a phone (390x844) size, each from a fresh page load: it taps the header's "Try Urganize" and checks the waitlist headline ends up fully on screen and below the fixed header (re-checked after the section's slide-in settles); then it waits for the form to hydrate, types an email, presses "Join now" and checks step 2 (name and phone) appears. It stops before submitting, because that request needs the waitlist database. The hero check matches the stable core of the founder's line, lower-cased, so rewording one sentence does not break it. Default address is now `localhost`; `WAITLIST_SMOKE_TIMEOUT_MS` lengthens the wait for a cold dev compile. README updated to match. No site code changed.

**Checked.** Against `next dev` on `localhost`: all four checks pass (desktop and phone, both steps). Against a production build (`next start`): all four pass on both `localhost` and `127.0.0.1`, which confirms the origin block is dev-only. Then three deliberate breaks of the site, each restored byte for byte afterwards: removing the header offset from the anchor fails the phone headline check (the desktop page is too short to scroll that far, which is why both sizes are checked), making "Join now" not advance fails the step-2 check, and pointing the header button at `/#pricing` fails the headline check. One of my first attempts at the second break never applied (a pattern spanning a CRLF line break), so the pass it printed meant nothing; it was redone and failed as it should. Homepage lint (0 errors, the 2 existing warnings).

**Not done, and why.** One run against the production build printed "browser runtime exceptions were observed" on `127.0.0.1`; four later runs with `WAITLIST_SMOKE_STRICT_CONSOLE=1` were clean, so it was not reproduced and its text was not captured. The script does not submit the form, so the sign-up request itself (the `/api/signup` call) is still unchecked by it. It is not wired into any CI job (there are no GitHub Actions in this repo; it is run by hand).

## 2026-10-10 | Product screenshots are unreadable on a phone

**What is wrong.** On a phone, five product screenshots were 1920px desktop captures shrunk to the 340px column (0.18x), so they read as dark rectangles with grey dots. Three sit in the homepage's step-by-step section (the activity list under "Create the rollout. Get the plan.", the open activity under "Put a name on every activity.", the Timeline under "See where every rollout stands."), one on `/features` (the same activity list), and one on `/for-managers`, `/for-executives`, `/for-ai-artists` and `/why-urganize` (the catalog). The homepage hero already had a proper phone capture; none of these did.

**Why it costs sign-ups.** These are the proof under each promise. On a phone, which is where this audience reads, the visitor cannot read a word of it, so the "Put a name on every activity" claim has nothing to back it.

**Fix.** Two changes, both marketing-site only.
- The catalog on the four persona pages now uses the same pair the hero uses (`PRODUCT_SHOTS.catalog` and `catalogPhone`) through `ResponsiveProductShot`: the phone capture in a 4:5 window below 640px, the desktop capture above it. The old `workspace-releases` files it read were byte-identical legacy copies of `catalog` with no phone version. `ResponsiveProductShot` gets an optional `fetchPriority` (default "high", so the hero is unchanged) and this mount passes "auto", because it is below the fold.
- The other four get a phone crop. `ThemedProductShot` takes an optional `phoneCrop`; below 640px it shows only that window of the desktop capture at the full column width (about 0.5x instead of 0.18x), as CSS on the same image, so a phone still downloads one image per theme and desktop is untouched. The rectangles are in `content/product-shot-crops.ts` (hand-written, because `product-shots.ts` is regenerated by the capture script). A crop is only used if the shot's size still matches the size it was measured on.

**Not done, and why.** There are still no real phone captures of the activity list, the open activity or the Timeline. Making them needs the capture script run from a signed-in headed Chrome on the demo team, which this loop cannot do, so it is in `notes/needs-lucky.md` with the crops' retake check. The crops also hide a stale detail: those captures show the side menu and top bar from before the app was redesigned, and a crop leaves them out, but desktop visitors still see them (that is the retake already in `needs-lucky.md`). The Timeline crop is the least readable (about 0.35x): the bars, TODAY and RELEASE read, the row labels are small.

**Checked.** At 390px in dark and light: the three crop boxes are 340 wide and 242, 210 and 163 tall; the activity list, the assignee row (Dami Okafor) and the week axis with TODAY and RELEASE are legible; the hidden theme's box is `display: none` and takes no space; no horizontal scroll. The persona page shows the phone catalog in a 342x428 frame (`fetchpriority="auto"`). At 1440px the crop box is a plain static block, the image renders whole (1022x518 on `/features`) and the persona page serves the desktop catalog on a fresh load. Served images are the full 1920px files (the preview pane reports a smaller `naturalWidth` that a direct fetch disproves). Homepage lint (0 errors, the 2 existing warnings), `tsc`, production build (all pages still static) and the four `apps/web` guard test files (137 tests) pass. **Not seen:** a real phone, or a retina screen where the crop's sharpness could be judged.


## 2026-10-10 | Header buttons are too small to tap on a phone

**What is wrong.** At 390px the header's three controls were under the 44px touch size: "Try Urganize" 36px tall, the "Product" menu button 20px tall (its hit area was just the word) and the theme toggle 40x40. Inside the menu each link was 40px tall. "Log in" (shown from 640px up, so on tablets) was 20px tall.

**Why it costs sign-ups.** The header is on every page and "Try Urganize" in it is the primary ask. A 20px target next to a 36px one on a thumb-sized screen means mis-taps open the wrong thing, and "Product" is the only way to reach pricing, features and log in from a phone.

**Fix.** Three small files. `MarketingHeader.tsx`: the CTA gets `min-h-11` (it grows from 36 to 44px; the header row is already 44px tall because of the logo link, 48px from 640px up, so the header and the spacer under it do not move); "Log in" gets `min-h-11` and an `-mx-2 px-2` pair. `ProductMenu.tsx`: the button gets `min-h-11` and the same `-mx-2 px-2` pair, the menu's `mt-4` becomes `mt-1` so it opens in the same place (the button is 24px taller, the gap 12px smaller, measured: menu top 64px), and each link goes from `py-2.5` to `py-3` (44px). `ThemeToggle.tsx`: the button is now the 44px target and the 40px disc is a span inside it, with `-mx-0.5` so the row is no wider. The `-mx-2 px-2` pairs make the extra width invisible hit area: nothing shifts and the 375px budget in the header comment still holds.

**Not done, and why.** The menu is 10 x 44px (about 460px) tall and the header is fixed, so on a phone held sideways (about 390px high) the last items cannot be reached. It was 10 x 40px before, so this is not new, but it is a real problem for its own entry (a max height and `overflow-y-auto`). The video-modal close button in `WatchDemo.tsx` is also 40x40; it is not header chrome and is left alone.

**Checked.** At 390px: CTA 109.6x44, Product hit area 82.9x44 (the word is still 66.9px wide), toggle 44x44 around the same 40px disc, header height 76.8px (unchanged), menu top 64px, all ten menu links 44px, no horizontal scroll. At 360px: the gap between the logo and "Product" is 14.6px (the minimum is 12), no horizontal scroll. At 1440px: CTA 117.6x44, "Log in" 53.6x44, header 80.8px, and the visible gaps between "Log in", "Product" and the CTA are the same 24px and 16px as before. The toggle still switches theme and the disc keeps its background in both themes. **Not seen:** a real thumb on a real phone.

**Merged.** #786, 2026-10-10 (squash).

## 2026-10-10 | Waitlist form: no autofill, a bare "match the format" error, a silent error line

**What is wrong.** The waitlist form is the only sign-up path from the site and it fights the browser on a phone. None of its three fields has a `name` or an `autocomplete` value, so a phone cannot offer the saved email, name or number and the visitor types all three by hand. The phone field's pattern fails with the browser's default "Please match the requested format." and nothing says what the format is. And when the sign-up request itself fails, the red error line appears with no `role="alert"`, so a screen reader says nothing and the form just looks like it did nothing.

**Why it costs sign-ups.** The two-step form exists to keep the first touch light. Autofill is what makes step 2 (name and number) one tap instead of two typed fields on a phone keyboard, and step 2 is where the page already loses people. A rejected number with no hint reads as a dead button. A screen reader user whose request failed is not told.

**Fix.** In `WaitlistForm.tsx` only: `name` and `autoComplete` on email (`email`), name (`name`) and phone (`tel`); a `title` on the phone field naming the characters it takes (the same set the pattern and the API accept), which is the attribute browsers show beside their format message; `role="alert"` on the error line. `inputMode` was on the original list and is left out on purpose: `type="email"` and `type="tel"` already select the right mobile keyboard, so it would change nothing. No copy, field, validation rule, request or layout changed.

**Not done, and why.** Focus is not moved to the name field when step 2 appears, so a screen reader is not told the form changed. That is a separate behaviour change (and raises the keyboard on a phone), so it is left for its own entry.

**Checked.** Homepage lint (0 errors, the 2 existing warnings). In the running form at `/pricing`: the email field carries `name="email"` and `autocomplete="email"`; step 2's name and phone carry `name`/`autocomplete` `name` and `tel`; the phone field has the `title`; `0801 abc 5678` fails the pattern and `+234 801 234 5678` passes; a forced 429 from `/api/signup` renders its message in an element with `role="alert"`. **Not seen:** the browser's own validation bubble (a headless browser does not draw it, and Chrome's `validationMessage` property returns only the generic sentence, not the title) and a real phone's autofill sheet, so the title text and the one-tap fill are set up as the HTML spec describes but not observed.

**Merged.** #785, 2026-10-10 (squash).

## 2026-10-10 | /pricing description still promises a demo

**What is wrong.** The `/pricing` meta description ended "...and how to book a demo with the founders." Nothing on the page books a demo any more: the plan buttons say "Try Urganize" and go to the waitlist, Group says "Let's talk" and opens an email, and the page lead says "Join the waitlist". The same sentence is the Open Graph and Twitter description, so it is what a link preview and a search result show under the page title.

**Why it costs sign-ups.** Someone who clicks through from search because they want to book a demo lands on a page with no demo to book and has to work out the next step. A snippet that promises a step the page does not have sends the click to the wrong place. Pricing is a standing sitelink candidate, so it is shown right under the brand result.

**Fix.** One sentence in `apps/homepage/app/pricing/page.tsx`: "...how to book a demo with the founders" became "...how to join the waitlist". The first half ("Everything after the music, at one price for your whole team...") is untouched, so the positioning guard still passes. A comment beside it records why, so the demo line is not put back. No page copy, price, plan or button changed.

**Checked.** Homepage lint (0 errors, the 2 existing warnings), production build (`/pricing` still static) and the positioning and copy guard tests in `apps/web` (4 files, 137 tests) all pass. In the built `pricing.html`, the `description`, `og:description` and `twitter:description` tags all carry the new sentence and "book a demo" appears nowhere on the page. No other live copy on the site says it (the only other hits are code comments).

**Merged.** #784, 2026-10-10 (squash).

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

**Merged.** #769, 2026-10-09 (squash).

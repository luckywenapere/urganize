# Onboarding: team, then first project. Visual audit and design direction

Issue #854. Phase 1 of the design work: what is wrong with the screens today, and the look and feel for the new flow. The flow itself (steps, rules, copy decisions) is the PM's spec in `spec.md` next to this file; where the two disagree, the spec wins on flow and this file wins on look. Nothing here is built.

**How this was checked.** Read from code: `apps/web/app/onboarding/OnboardingPageClient.tsx`, `apps/web/components/onboarding/*`, `apps/web/app/auth/AuthPageClient.tsx`, `apps/web/components/auth/EmailConfirmation.tsx`, `apps/web/app/globals.css`, `packages/ui/src/Button.tsx`, the shell (`components/shell/*`, `components/app/WorkspaceMenu.tsx`). Live: the Browser pane is signed in, so `/onboarding` redirects to Home; I saw the signed-in Home at 375px (the landing target) but **not the signed-out wizard live**. Every wizard finding below is from code, not a screenshot. User behaviour claims are predictions: there is no click data.

---

## Part 1. Audit, ranked

Ranked by how much each one costs a new person in their first two minutes (drop-off and trust first, polish last).

### 1. Ten to twelve screens before anything is yours
The step list (`lib/onboarding-steps.ts`) runs: Who are you, What are you working on, Who is the artist (import), Where does a rollout fall apart, What's already done, Tell us about this rollout, Your first move, Your plan week by week, Stay on top (opt-in), Create your account, Paywall, Welcome, Invite. The progress bar draws up to 12 segments (`OnboardingPageClient.tsx` ~1933). On a phone on bad data, a 12-segment bar on screen one says "this is long" before a single question. Predicted effect: the biggest drop-off sits here, not on the paywall. This is the structural problem the new flow fixes (account, team, project).

### 2. The display face is drawn in fake bold
Young Serif comes in one weight (400, `app/layout.tsx:27`). Onboarding headings use `font-display font-semibold` (page h1, step h2, first-move h3, paywall h3, welcome h3) and the auth h1 uses `font-bold`. The browser smears a synthetic bold: thick, blurry serifs that read cheap on a phone screen. Home ("Good afternoon, Oyin.") and Check your inbox (`EmailConfirmation.tsx:140`, `font-normal`) draw it correctly, so the first screen after onboarding looks like a different, better product. `PageHeader.tsx:40` has the same fault in the app.

### 3. Two primary buttons, two different colours
Onboarding's primary is a cream pill (`bg-content-primary`, `OnboardingPageClient.tsx:451`, also in Welcome and Paywall). Auth's primary is a spring-green pill (`primaryPillClass`, `AuthPageClient.tsx:58`), and so is the app's `Button` primary. A person goes green (log in) to cream (wizard) to green (app). The eye learns "the green thing moves me forward" on the auth page and then loses it. One primary: spring green, ink text.

### 4. Every screen is a box inside a page inside a box
The page h1 "Welcome aboard" plus subline sits above a 12-segment bar, above a bordered card (`cardShell`), which holds a caps kicker "Step 3 of 11", a second heading (the real question), a helper paragraph, then options that are themselves bordered boxes. Four levels of chrome before the first tap target. On 375px the question starts about 230px down and the Next button often falls below the fold. The real question should be the only heading.

### 5. The page title never changes, and says nothing
"Welcome aboard / A few questions and your first rollout is ready." stays on every step, including the account form and the invite step. It pushes content down, repeats on each screen, and "aboard" is filler. The step's own question carries the page.

### 6. Shouting labels and kickers
Field labels (`labelBase`: `text-xs font-semibold uppercase tracking-[0.16em]`), "Step N of M", "Or with email", "What to look out for", "Your first move", "Coming soon" are all small tracked capitals in the sans face. The brand bible says sentence case always; capitals belong to Space Mono metadata only (dates, counts, statuses). The auth h1 is set in capitals too ("LOG INTO URGANIZE"). Capital labels also read slower for the eye at 11px.

### 7. Square corners mixed with round ones
The progress segments, error box, noscript box, invite rows, invite Remove button and Google button have no radius, next to `rounded-xl` options, `rounded-2xl` card and `rounded-full` buttons. It looks unfinished, as if two kits were merged. Everything gets a radius from the scale: 12 for fields and rows, 16 for surfaces, full for buttons and chips.

### 8. Pure white Google button
`bg-white text-zinc-900 hover:bg-zinc-100` (`OnboardingPageClient.tsx` ~2317). Pure white is on the bible's never list, and on the ink ground it is the brightest object on the screen, so it out-shouts the real primary. Auth already does it right: an outlined pill on `bg-bg-surface` with the Google mark. Use that.

### 9. Same-colour surfaces with no edge
Inside the step card (`bg-bg-surface`), the artist-import candidate rows and the "found their releases" box also use `bg-bg-surface` (`OnboardingArtistImportStep.tsx:215, 348`), so they only separate by a faint border or not at all. Options use `bg-bg-elevated`, which in dark is only 2 points lighter than surface (`#1a1f1b` vs `#181d19`). In light (paper) mode the two are identical (`250 245 236` both). Selected state then leans entirely on a 1px green border and an 8% tint, weak on a dim phone screen outdoors.

### 10. Tap targets and hit areas
Radio and checkbox inputs are 16px (`h-4 w-4`); the whole label row is tappable, which saves it, but the visible control is tiny and the row height is about 44px with 12px padding. "+ Add another" is a text link with no padded hit area. The Paywall dots are 8px tall tab buttons (`OnboardingPaywall.tsx:192`). Back and Next stack vertically on phone with Back on the bottom (`flex-col-reverse`), so the thumb lands on Next correctly, but both are full-width 48px pills, which gives Back the same weight as Next.

### 11. Motion that says nothing, and a jump that says too little
The step card fades in on every step (`animate-fade-in`) but there is no sense of direction: Back and Next look identical. Meanwhile the hand-off from the wizard to the app is a hard route change into a completely different layout (no logo in the same place, nav appears from nothing). The one place motion would tell the truth, "your project now lives here", is the one place there is none.

### 12. Tone and copy on screen
"Welcome aboard", "Let's go" with a curly apostrophe next to "Next", "Working…", "Create account & rollout" (ampersand), "e.g. Tems" (naming a real artist as placeholder), the placeholder "My Next Single" in title case. The persona list and release-type list show "Coming soon" rows, which spend space on things the person cannot pick. Small, but this audience notices.

### 13. Light (paper) mode is an afterthought
Bordered option rows in paper mode get `border-stroke-default` (cream-on-cream at low alpha), so unselected options nearly disappear. `bg-brand/8` selected tint in paper mode is forest at 8% on cream, which reads as dirty, not chosen. The welcome and opt-in screens use `bg-white` thumbs and hard-coded colours that do not swap.

### 14. Desktop is a phone column floating in black
`max-w-xl md:max-w-2xl` centred, no top bar, no logo, nothing on the sides. Fine for focus, but on a 1440 screen it looks like an error page. The paywall then jumps to `lg:max-w-5xl` two columns, so the column width changes mid-flow.

### 15. Auth page: two titles for one page
Phone says "Log into Urganize", desktop says "Sign up or log in" (`AuthPageClient.tsx:509`), in capitals, 40px below a 64px logo, with the form pushed to `mt-16`. A new person on a phone is told this page is for logging in, which it is not only.

**What is already good and should be kept:** Check your inbox and You're in (`EmailConfirmation.tsx`) are the best screens in the flow: fixed small logo top-left on desktop, Young Serif at regular weight 31/40px with balanced wrapping, one surface, one action. The new flow borrows that frame. The artist import (search, pick, see their covers) is a real "this knows me" moment and should survive inside the project step.

---

## Part 2. Design direction

### The idea in one line
A quiet setup frame that already looks like the app with the lights half on: same ink ground, same logo position, same avatar, same type, so the person never feels they left a form and entered a product. They are in the product from the first screen after the account.

### Why (the psychology)
- People who just made an account want proof it was worth it within one screen. So the first screen after the account shows their name, their team, and one obvious next action, not a question about them.
- Managers think in teams and artists, not in "workspaces" or "projects". The Vercel pattern works because the scope (the team pill) is visible inside the sentence, so they learn "things live inside my team" without being taught.
- Someone holding only an idea feels they are "not ready for a tool like this". If "Just an idea" looks like the small, lesser option, they leave and come back never. So every stage is drawn at the same size and weight, and the idea stage is first in reading order.
- Thumbs: primary actions sit low on phone. Lists of choices are full-width rows, not grids, because rows are faster to scan top to bottom and every row is an equal target.

### The frame (all three screens: team, project, paywall)
- **Top bar, 56px phone / 72px desktop, same geometry as the app's `TopNav`.** Logo mark left (desktop: mark plus "Urganize", matching You're in). Right: the account avatar as a flat initials tile (never a gradient). No nav pills yet. When the app loads after the project, logo and avatar stay put and only the nav fades in. That is the continuity.
- **Progress lives in the top bar, not above the content.** Three named stops in Space Mono, small: `Account · Team · Project`. Done stops get a spring tick, the current one is cream, the next is tertiary. On phone it collapses to `2 of 3` in mono beside the logo. Three stops, not twelve: the count itself lowers anxiety.
- **One column, 480px max, 16px side gutters on phone.** Desktop keeps the same column centred with generous top space (like You're in), so the width never changes between screens. The paywall uses the same column, not a new two-column layout.
- **No card around the step.** The question is the page heading: Young Serif 400, 28px phone / 36px desktop, `text-balance`, one line of plain sub copy under it in `content-secondary`. Choices sit directly on the ground as rows on `bg-bg-surface` with a 1px `stroke-strong` edge.
- **Buttons.** One primary: spring pill, ink text, 48px tall, full width on phone and pinned to the bottom safe area when a form is short enough to need it. Back is a text button with a chevron in the top-left of the content, not a second pill.

### Screen A. Create or join a team (the Vercel screen, adapted)
Heading: **No projects yet.**
Sub line, with the team pill inline in the sentence: **Start one in [▣ Northline ▾], or ask someone to invite you.**

- **The team pill** is the same control as the app's team menu, so they meet it once here and recognise it later. It shows a flat initials tile, the team name and a chevron. Brand-new person: we suggest a name from their first name ("Oyin's team") so the sentence is never broken; the pill has a small "Rename" affordance and the name can change any time. (Flow detail for the PM: is the team created on landing or on the first project? I recommend on the first project, so nobody owns an empty team they never used.)
- **Tapping the pill** opens a bottom sheet on phone, a popover on desktop: teams you are in (with a tick), invites waiting for your email (Accept), then "New team" and "Join a team".
- **Under the sentence, one list of action rows** (Vercel's card list, as rows, 64px each, a 40px icon tile, title, one line, chevron):
  1. If an invite is waiting: **Join Northline Music** / "Ada invited you as a manager." with Accept as a small spring pill. This row comes first and gets a 2px spring keyline on the left, because joining a team that already exists beats starting from nothing.
  2. **New project** / "A release at any stage, even just an idea." Primary row (the icon tile is spring, the rest are neutral).
  3. **Ask to be invited** / "Send your team a WhatsApp asking for an invite." Opens WhatsApp with the message and their email filled in.
- No invite waiting: row 1 is not shown (no empty "no invites" message). The list stays three rows at most so the thumb reaches all of it.

### Screen B. New project (stage first, then only what that stage needs)
Heading: **What are you working on?** Sub: **Pick where it is today. You can change it later.**

- **The stage picker is the first control,** four full-width rows, equal size and equal weight, in this order:
  1. **Just an idea** / "No date yet. We help you shape it."
  2. **Making it** / "Recording or mixing."
  3. **Ready to release** / "Done or nearly done. We plan back from the date."
  4. **Already out** / "Keep it going after release day."
  Each row has a small mono stamp on the right (`IDEA`, `IN STUDIO`, `READY`, `OUT`) drawn like the catalogue stamps elsewhere in the app. Nothing is pre-selected, so "Ready to release" never looks like the expected answer. Wording is a draft for the PM spec.
- **After a pick, the row collapses into a summary line and only that stage's fields slide in below** (progressive disclosure, one decision at a time):
  - Every stage: artist (search with the existing import, flat initials tile until a photo is found), and a name with a soft default ("Untitled idea" for an idea, so the field is optional).
  - Making it / Ready / Out: kind as chips (Single, EP, Album, Not sure yet). Ready and Out add a date; Making it gets "Rough month" instead of a day.
  - Idea asks for nothing else. One optional line: "What is it about?"
- **Live preview card under the fields**, the same card the person will see first on Home: initials cover tile, title in Young Serif, the stage stamp and catalogue number in Space Mono (`URG·001 · IDEA`). It fills in as they type. This is the "could only be us" moment from the bible, and it is the object that later moves into Home.
- Primary button: **Create project**. Under it, quiet: "Your plan is built next."

### Screen C. Paywall (after the first project)
Same frame and column. The project card from screen B sits at the top, small, so the paywall is about keeping something they made, not about a product they have not seen. One plan recommendation, one spring button, "Talk to us" as a text link. Detail waits for the spec.

### Motion
All within the existing tokens (`--motion-base 180ms`, `--motion-out`), and all off under `prefers-reduced-motion`.
- **Forward vs back:** forward screens enter 12px from the right with a fade; back enters from the left. It tells the truth about direction.
- **Stage pick:** the chosen row stays, the others fold up (`--motion-slow 280ms`), the fields rise in. The person sees their choice "stick".
- **Team name:** when they rename, the pill's text cross-fades; the top-bar avatar does not move.
- **Hand-off to Home:** the preview card keeps its position while the frame dissolves around it and Home's layout fades in, then the card settles into Home's first card slot. One continuous object. If that is too costly to build, the fallback is a plain cross-fade with the top bar fixed.

### Light and dark
Design in dark first (default), then check every screen in paper mode. Rules: choice rows use `bg-bg-surface` on `bg-bg-base` plus `stroke-strong` (never `stroke-default`, which vanishes on cream); selected = 1.5px brand border plus a brand check tile, never a tint alone; no `bg-white` or hard-coded colours anywhere.

### Phone (375px) and desktop
- Phone: top bar 56px, heading starts about 96px from the top, all of screen A fits above the fold with the three rows. Primary button pinned to the bottom safe area on screen B once fields appear.
- Desktop: same 480px column centred under a 72px top bar that matches the app; the sides stay quiet ink. No side illustrations, no gradient art.

### Fixes to carry into the existing screens either way
Even if the new flow slips, these are cheap and should go with it: Young Serif at 400 everywhere (onboarding, auth, `PageHeader`); one spring primary; sentence-case labels; one radius scale; the outlined Google button from auth; Back as a text button; drop the "Welcome aboard" page title; one auth heading for phone and desktop ("Log in or sign up", sentence case).

### Open questions for the PM spec
1. When is the team created: on landing, or with the first project? (Design recommends with the first project.)
2. Final stage names and how many (four proposed).
3. Does the artist import live inside screen B, or after the project is made?
4. What a person who taps "Ask to be invited" sees after WhatsApp opens (a waiting screen that checks for the invite?).

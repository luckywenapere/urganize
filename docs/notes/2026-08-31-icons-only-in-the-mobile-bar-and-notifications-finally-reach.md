# Icons only in the mobile bar, and notifications finally reach a phone (2026-08-31, v1.10.3)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: *"In UrgAns view instead of showing 'song' on the mobile lower
menu, show 'notifications' then remove all the titles and just show the icons
to save space."*

**Read as two changes with different scopes, and the reading is worth
recording** since only one of them names a view. The Song → Notifications swap
is the assistant page only, as asked. **The labels come off EVERY tab, not just
that view's** — "all the titles" is bar-wide on its face, the space argument is
about the bar rather than about one screen, and the alternative would have been
worse on this bar specifically: labels on five views and absent on one changes
the bar's shape as you navigate, which is the exact complaint that produced
`EmptyTabSlot` a day earlier ("let the icons remain in the same position... so
they don't jump around"). Note also that on the assistant page the swap is a
SWAP, so the tab count there is unchanged — meaning "to save space" cannot have
been about that view at all.

### Notifications was a deferral being closed, not a new surface

`AppTopbar` wraps the bell in `hidden lg:block` and the comment gives one
reason: *"the mobile bar has no room for it once the logo takes the centered
slot, and **MobileNavBar has no notifications tab to move it to**."* Now it has
one. `MobileNavBar` renders **the same `NotificationsBell` component** in a new
`placement="bar"` mode — not a reimplementation — so the fetch, the unread
badge, the peek-vs-read model and the row-tap navigation are all the shipped
ones. Nothing is stored and no route is added, which is also what keeps it
clear of the "Notifications inbox … in-app inbox is v2" scope line: this is the
built bell, finally reachable on a phone.

**Four things a later change will be tempted to get wrong:**

1. **The bar panel is `absolute`, not `fixed`, and that inverts a trap into the
   mechanism.** `MobileNavBar`'s `<nav>` carries `backdrop-blur-xl`, and
   `backdrop-filter` makes an element a containing block for `fixed`
   descendants — the bell's own topbar comment already records hitting this
   with the topbar. So a `fixed inset-x-4 top-[4.5rem]` panel mounted in the bar
   would measure against the 64px bar rather than the viewport and land off
   screen. Using `absolute bottom-full` makes that containing block the thing
   the panel *wants* to measure from, so it opens upward off the bar's top edge
   with **no portal**. The wrapper in bar placement must therefore stay
   unpositioned — adding `relative` to it breaks this.
2. **It must not reuse the topbar's `sm:`-and-up branch.** That one is
   trigger-anchored (`sm:absolute sm:top-full`), which from a bottom-bar tab
   opens the panel *downward* off the bottom of the screen. The bar renders up
   to `lg`, so bar placement is viewport-relative at every width it sees.
3. **The trailing slot's EXISTENCE is an account question; its CONTENT is a view
   question.** That split is what keeps the bar still. Existence is
   `hasCuratorProfile !== true` (a dual account carries Pitches there instead) —
   fixed per account, so dropping it costs no stability. Content is
   Notifications on the assistant page and Song elsewhere. It deliberately no
   longer depends on the SONG flag, because notifications have nothing to do
   with song upload: with that flag off the slot still exists and holds
   Notifications on the assistant page, `EmptyTabSlot` elsewhere.
4. **Labels are `sr-only`, not deleted.** Five unlabelled icon links would
   announce as five links with no accessible names. Keeping one string per tab
   also means the icon and the announced name cannot drift — the reasoning
   `WorkspaceIdentityPanel`'s collapsed rail already uses.

**The width ceiling changed meaning, so re-read it before adding a tab.** The
recorded five-tabs-plus-button limit was set by the widest LABEL ("Pitches",
~45px) in a ~52px slot. Measured against a 20px glyph instead, the binding
constraint is now the ~44px touch target, so there is real headroom that did
not exist before. A sixth tab is still a decision rather than free, but it is
no longer the hard stop the old note describes.

**One known limit, stated rather than papered over: a dual account gets no
notifications tab**, because it has no trailing slot to swap. That is one
partner account, and the alternative — a tab appearing only on the assistant
page — would move Pitches every time they opened the assistant, reintroducing
the jumping. Their bell is still there on desktop.

Also folded in: the five inline copies of the tab class string became one
`NavTab`, since all five were being edited anyway and copy drift in this file
is a recorded problem.

- **Verified:** 1846 tests (unchanged — nothing here is unit-testable; this repo
  has no component tests and no jsdom), `eslint .` at the exact 3-error /
  70-warning baseline with **zero** new findings, and `next build` green **by
  exit code** with every bar flag on and `/auth`, `/onboarding`, `/settings`
  still `○ Static`. The compiled output was checked rather than trusted from
  source: the bell is bundled into the nav-bar chunk, the upward-panel classes
  are present, and `.animate-menu-up`, `.sr-only` and `.bottom-full` all exist
  in the emitted CSS.
- **Not verified, and it is the whole visual risk:** nothing has rendered on a
  phone. This sandbox cannot mint a session and has no route to
  app.urganize.app, so the upward panel, the badge on the tab and the icon-only
  row rest on the build plus the CSS check. Worth one pass on a real device:
  open the assistant, tap the bell, and confirm the panel opens upward and
  clears the bar.

### REVERTED the same day: two live bells broke the assistant page (v1.11.2)

Founder, minutes after the flip: *"urgans is not opening anymore on mobile
view."* **The notifications tab is out; the icons-only half stayed.**

**The mechanism, and it is the thing to read before re-landing this.** The
topbar's bell is wrapped in `<div className="hidden lg:block">` — that is CSS,
so below `lg` the component still **MOUNTS and still runs its effects**. Adding
a second instance in the bar therefore gave `/dashboard/urgans` on mobile TWO
live bells, each calling `supabase.channel(`notifications:${'${userId}'}`)` on the
**same topic** and each fetching `/api/notifications`. Duplicate realtime
subscriptions to one topic are not something supabase-js promises anything sane
about, and **this app has no error boundaries anywhere** (its own Known issues
entry says so), so a throw in that effect takes the page down instead of
surfacing. It could only happen on that one route, because the bar renders Song
everywhere else — which matches the report's scope exactly.

**Honest limit on the diagnosis:** the mechanism was confirmed by reading (the
CSS-hide, the shared topic, the missing boundaries), not by reproducing it — no
session is mintable here. The revert was chosen over a speculative fix because
it restores a known-good state in one deploy.

**Re-landing it needs ONE live subscription, not two.** Hoist the fetch and the
channel into a shared store (`useNotificationsStore`) so any number of triggers
render against one subscription. **Do NOT just gate the second instance on a
viewport check:** that still leaves two independent fetches and two toasts for
one event in any state where both are mounted, and it trades a CSS gate for a
hydration-sensitive JS one. The `placement` prop was reverted too rather than
left inert — an untested code path nothing calls is worse than no path.

Two smaller lessons worth keeping:

- **`hidden lg:block` is not "not mounted".** Several surfaces in this app use
  CSS to hide chrome per viewport (the topbar nav icons, `WorkspaceMenu`, this
  bell). Any of them that owns a subscription, a fetch or a timer is still
  paying for it on the viewport where it is invisible — and is still there to
  collide with a second instance.
- The v1.11.1 ledger entry promising notifications on mobile is **left as
  written**; v1.11.2 corrects it in the log rather than rewriting history,
  which is how this changelog works.

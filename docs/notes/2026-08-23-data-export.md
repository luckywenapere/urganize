# Data export (2026-08-23, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The feature that makes an entitlement true. `lib/entitlements.ts` declares
`data_export` on every tier with a test enforcing it; this is the control that
honours it. Behind `NEXT_PUBLIC_FEATURE_DATA_EXPORT` (default off). **No
migration, no new table** — it is a read.

Two downloads in Settings → Account: **everything as JSON** and **every activity
as a CSV**. Not one zip: an archiver dependency to deliver strictly less.

**Five things worth knowing before touching this:**

1. **The route is DELIBERATELY NOT behind the paywall, and a test enforces
   that.** It uses `getAuthenticatedUser`, never
   `requireActiveAuthenticatedUser`. The people who most need their data out are
   exactly the ones a paywall would stop: a walled team, a failed card, a
   cancellation inside its 90-day window. The whole trust property rests on one
   import, and a comment cannot defend it — so `account-export.test.ts` reads the
   route source and fails if any paywall wrapper appears. **That guard strips
   comments before matching**, which is not a convenience: the route's own header
   names the wrappers it does not use, so a raw grep failed on the very prose
   explaining the rule. Verified by injecting the forbidden import and watching
   the guard trip.
2. **Scope is the account-deletion boundary** (`owner_user_id` / `owner_id`,
   cascading from releases — see `app/api/account/delete-now/route.ts`). "You can
   export exactly what deleting your account would destroy" is a rule that is
   easy to check and impossible to argue with, and it is why the section sits
   directly above Delete account: same conversation, right order.
3. **Every table is read with `select('*')`, never a column allowlist.** An
   allowlist would quietly shrink the export each time the schema grew. A
   denylist in `lib/account-export.ts` (`REDACTED_KEYS`) removes credentials
   after the fact — `paystack_response` is the sharp one, since it carries an
   `email_token` capable of mutating a live subscription and this file gets
   forwarded to accountants. Share tokens are deliberately KEPT: they are the
   user's own links, already visible in the app.
4. **Sections fail independently.** A table that does not exist in this
   environment reports itself as `unavailable` with a reason, so an empty section
   is never ambiguous between "you have no data" and "we could not read it" — the
   defensive-probe pattern `release-recap` already uses for `playlist_pitches`.
   Truncation past `EXPORT_ROW_CAP` is likewise announced in the envelope rather
   than silently dropping rows.
5. **Native cannot download, and the code says so out loud.**
   `shareOrDownloadTextFile` (new, in `lib/share-file.ts` beside the image
   helper) uses the share sheet when the Capacitor plugins are present and
   returns `'unsupported'` when they are not — an export is fetched from our own
   API with an Authorization header, so there is no URL a system browser could be
   pointed at. The UI then tells the user to use the web app. A silent no-op on
   *this* button would be the worst outcome in the product.

**`lib/csv.ts` is new and shared.** The escape rule already existed three times
over (`admin/onboarding`, `admin/pricing-validation`, `CaptureSection`); a fourth
copy is worse than a helper. The existing three are deliberately left alone —
they work, and migrating them is not this feature's job. It quotes every field
unconditionally, which is right by construction rather than right about commas,
quotes, newlines, leading zeros and whatever Excel decides looks like a date.

**A verification trap worth remembering:** `NEXT_PUBLIC_*` is inlined at build
time **even on the server**, so probing two flag states by restarting
`next start` with different env proves nothing — both runs serve the last build.
The first probe here showed 401 in both states for exactly that reason. Rebuild
between probes. Done properly: flag off → export **404** while the ungated
control `/api/releases` **401**s; flag on → export **401**. That
404-vs-401 discrimination is what rules out a routing accident.

**Verified:** 1018 tests (36 new), `eslint .` at the exact 3-error/65-warning
baseline, homepage lint clean, `next build` green by exit code in both flag
states with `/auth` and `/settings` still `○ Static`, plus the runtime probes
above. **Not verified:** nothing has run against a real database, so a real
export has never been generated — the owner UI needs an authenticated session
this environment cannot mint. The JSON shape, the signed asset URLs and the
spreadsheet are reasoned from code plus unit tests, not observed.

**Activation checklist:** (1) nothing to migrate — set
`NEXT_PUBLIC_FEATURE_DATA_EXPORT=true` in Vercel `Web` **and make sure the deploy
rebuilds `apps/web`**; (2) export a real account and open both files, checking
especially that no section reads `unavailable` in production (that would mean a
table this environment genuinely lacks) and that an asset `download_url`
resolves; (3) changelog entry + version bump at flip, not at merge (the EPK
precedent). **Only after that is the pricing page allowed to advertise
"Export your data anytime"** — until then that line would be a claim we cannot
keep.

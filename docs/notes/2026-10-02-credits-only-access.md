# Credits-only access (2026-10-02)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: a team with no plan (trial ended, or plan lapsed) can still use UrgAns, **including changes**, and pays for each turn in credits. Rides the existing switches (`NEXT_PUBLIC_FEATURE_URGANS_CREDITS` plus the assistant flag): no new flag, no migration. With credits off nothing here applies. **Credits are on in production, so this is live once deployed.**

**A duplicate checkout was dropped while merging.** The session that built this also wrote its own credit-pack purchase (`/api/credits/topup`, `lib/credits/topup*.ts`, a Settings section), and while it sat uncommitted #660 merged a different one to main, both under the same switch name `NEXT_PUBLIC_FEATURE_CREDITS_PURCHASE`. Main's (#660) was kept and this branch's was left out entirely; the page below uses main's `BuyCredits`. The unmerged copy is still in worktree `credit-system-status-20d37c`; do not merge it.

### How it works

1. **`requireUrgansAccess` (`app/api/_shared/urgans-access.ts`) replaces the paywalled gate on UrgAns's own routes only** (every `app/api/urgans/**/route.ts`: chat, usage, credit history, the embedded-action routes, conversations, transcribe). It runs the normal gate first and returns that result untouched for everyone it admits. Only a PAYWALL refusal (a 402, or the 403 carrying the read-only code, decided by pure `isPaywallRefusal` in `lib/credits/urgans-admission.ts`) for a non-curator on a team the credit rules call `credits_only` is admitted. Every other refusal comes back as it was. It returns `creditsOnly: { workspaceId, ownerUserId, funded }`; `funded` is true when the balance is positive or unreadable (fail open).
2. **The assistant's changes go through a signed pass.** Tools act by calling the ordinary REST routes with the user's token, and those are paywalled. `lib/urgans-pass.ts` mints `<expiry>.<hmac>` (3 minutes, bound to the user id, key derived from the service-role key, no new env var); `/api/urgans` mints one only for a funded credits-only team, and `callInternalApi` sends it as `x-urganize-urgans-pass` only when present. In `requireActiveAuthenticatedUser` a valid pass for this user skips the paywall check and **nothing else**: the token check and the curator block still run. A forged, expired, wrong-user or empty pass meets the paywall as before.
3. **A page behind the wall, `/locked/urgans`.** The dashboard and settings are walled for such a team, so the balance, main's `BuyCredits` and the chat live under `/locked`, which the wall and the 402 redirect both leave alone. `WallUrgansCard` on `TeamWall` is the way in (only with credits on and a known balance; "Open UrgAns", or "Get credits" at zero, and no card at zero while buying is switched off). `AppShell` treats `/locked/*` as a flow page.
4. **Buying from behind the wall returns there.** `POST /api/credits/checkout` takes an optional `returnTo`, resolved by `resolveCreditsReturnPath` (`lib/credits/purchase.ts`) against a fixed list (`/dashboard/credits`, `/locked/urgans`; anything else answers the credits page), because Paystack's return to `/dashboard/credits` would be walled and the reference that settles the purchase lost. That route was already open (`getAuthenticatedUser`), so a walled team can start a checkout.
5. **At zero credits** a credits-only team is not told "quick commands still work" (`quickCommandsLine` in `lib/credits/copy.ts`): those commands reach the same paywalled routes.

### Things not to undo

- **The pass skips only the paywall.** `credits-guard.test.ts` ("a credits-only team can use UrgAns, and only UrgAns") pins that every UrgAns route uses `requireUrgansAccess` and no other route does, that only the chat route mints a pass, and that the header is added only when a pass exists. Widening admission to another route family is a founder call.
- **402 for walled, 403 for read-only**, as before; the browser redirects on 402.
- **A credits-only team on the pass can change anything the assistant can.** That was the ask. Confirmation-gated tools still need the card.

### Verified, and not

See the PR. Not verified: no walled account has used it for real (no pass honoured by a real route, no change made while walled, no turn charged), and no purchase has returned to `/locked/urgans` from a real Paystack checkout. On a phone the chat sits below the credits panel and needs a scroll.

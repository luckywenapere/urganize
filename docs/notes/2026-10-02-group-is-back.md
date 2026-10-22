# Group is back (2026-10-02)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The strategy doc (section 8) makes Group a plan again: "Group | Custom | Custom | Custom | Distributors and multi-label groups", and Group teams count as paying teams. It was removed 2026-09-09 (see "Group tier removed" above, now history). No migration and no flag: `subscriptions_plan_check` has permitted `enterprise` since 20260823100000.

Founder calls: Group is the fourth card on the public pricing page, with "Let's talk"; and a Group team gets 1,500 monthly UrgAns credits by default, the same as Label, topped up by hand per deal.

- **The id is `enterprise`, the name is "Group".** The id is what `subscriptions.plan` stores and the constraint permits; renaming it means a migration. `entitlements.test.ts` pins the split.
- **Sales-led.** No `monthlyPrice`, `contactSales: true`. Everything that already keyed off `contactSales` handles it with no new code: checkout refuses it, plan changes refuse a move onto or off it, the in-app wall leaves it out (its "Talk to us" card is the path), `minimumTierWith` skips it, and a lapsed Group subscriber is pointed at a conversation rather than checkout.
- **Same as Label everywhere a tier is read:** uncapped limits, the Label entitlement row, Label's AI router ceiling (and its `AI_ROUTER_CEILING_LABEL` override), the Label home layout, and 1,500 credits a month (`ALLOWANCE_CREDITS.enterprise`). SSO and sub-teams stay false, because nothing reads them and a public card may not promise an unbuilt feature.
- **How a team gets onto Group:** `/admin/teams`, "Mark paid", plan `group` (stored as `enterprise`), the agreed amount, the end date, and monthly or yearly. The interval is REQUIRED for Group and is written to `subscriptions.billing_interval`, so the scoreboard's MRR divides a yearly deal by 12. It is optional for the legacy plans, whose name already says.
- **Before marking an existing Paystack subscriber as Group, disable their Paystack subscription first.** "Mark paid" does not touch it, so it would keep renewing at the old price. This is true of every "Mark paid" deal, not just Group.
- **The scoreboard counts it with no change**: `isPayingTeam` counts every tier but Solo.
- **Not restored:** the "How the Group plan works" three steps on `/pricing`, deleted 2026-09-09. Git history has them if wanted.
- Marketing-site change plus an internal admin change, so no changelog entry or version bump.

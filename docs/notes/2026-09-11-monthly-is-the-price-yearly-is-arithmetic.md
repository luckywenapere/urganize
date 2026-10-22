# Monthly is the price, yearly is arithmetic (#580, activated 2026-09-11)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: *"make the pricing monthly not yearly any more then calculate the
yearly based off"*, at **₦5,000 / ₦22,000 / ₦50,000 per month**. This reverses
the annual-only shape from two days earlier (see "Annual only, at new prices"
above) and is roughly a **12× reprice per customer**, confirmed explicitly when
the three figures turned out to be the previous pass's *yearly* prices.

**The shape is the enforcement, and it is the inverse of the one it replaces.**
A tier declares `monthlyPrice` and nothing else; `getTierPrice` multiplies by
`ANNUAL_MONTHS_BILLED` (10) for the yearly figure. There is exactly one
multiplication and nowhere else a yearly number can enter the system — where the
annual-only pass guaranteed the same property by having no monthly field at all.
Repricing is now one number per tier and the "2 months free" badge is derived
from the same constant as the gap it describes.

### Activation — DONE 2026-09-11, and nothing here is outstanding

Six Paystack Plans minted on the **live** account and six Production env vars
set on the Vercel `urganize` project:

| Env var | Plan code | Charges | Paystack interval |
|---|---|---|---|
| `PAYSTACK_PLAN_SOLO_PER_MONTH_NGN` | `PLN_s5gl9tcxqetgu8k` | ₦5,000 | monthly |
| `PAYSTACK_PLAN_SOLO_PER_YEAR_NGN` | `PLN_62yzge8f7ra4pyv` | ₦50,000 | annually |
| `PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN` | `PLN_ag8u3p0l9gu9lwr` | ₦35,000 (₦22,000 until 2026-10-17, edited in place) | monthly |
| `PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN` | `PLN_p0m3un66lb0mzvz` | ₦350,000 (₦220,000 until 2026-10-17, edited in place) | annually |
| `PAYSTACK_PLAN_LABEL_PER_MONTH_NGN` | `PLN_9b8bkya2tjchga2` | ₦50,000 | monthly |
| `PAYSTACK_PLAN_LABEL_PER_YEAR_NGN` | `PLN_6xj3i1wweis6tka` | ₦500,000 | annually |

**SUPERSEDED 2026-10-17 (URG-349, founder-approved reprice).** The six vars now
point at new Plans; the six above stay in Paystack untouched (no subscriber was
on them — 0 paying subscriptions in production at the time):

| Env var | Plan code | Charges | Paystack interval |
|---|---|---|---|
| `PAYSTACK_PLAN_SOLO_PER_MONTH_NGN` | `PLN_gw8hma7l7uf6ko7` | ₦7,500 | monthly |
| `PAYSTACK_PLAN_SOLO_PER_YEAR_NGN` | `PLN_4z12z6ruske767p` | ₦75,000 | annually |
| `PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN` | `PLN_n7jqaieaqejiydp` | ₦25,000 | monthly |
| `PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN` | `PLN_2kzoyuywqp01vvv` | ₦250,000 | annually |
| `PAYSTACK_PLAN_LABEL_PER_MONTH_NGN` | `PLN_h8lyam0zxwa2uc3` | ₦60,000 | monthly |
| `PAYSTACK_PLAN_LABEL_PER_YEAR_NGN` | `PLN_g1n3kunp71hhu9k` | ₦600,000 | annually |

Cancel-flow retention Plans for the new bands (monthly, all Production,
non-sensitive): `_SOLO_RETENTION_5000` `PLN_cbale0i1tldkyhd`, `_SOLO_RETENTION_7000`
`PLN_lig7tum4vmmk9qu`, `_MANAGER_RETENTION_17000` `PLN_nwui13d76rcjsiz`,
`_MANAGER_RETENTION_23000` `PLN_35nr548x92kixts`, `_LABEL_RETENTION_40000`
`PLN_ah3aovizsqxv88h`, `_LABEL_RETENTION_55000` `PLN_f8sbdop1oicyapp`. The old
_3500/_4500/_25000/_30000/_35000/_45000 vars are left set and are no longer read.

The tiers after it: Solo ₦7,500/mo (1 artist, **2 seats**, 1 active release),
Manager ₦25,000/mo (**3 artists, 5 seats**, 3 releases, now `recommended`), Label
₦60,000/mo (unlimited), Group unchanged. Credits unchanged (150 / 660 / 1,500).
⚠️ Solo IS purchasable (it has been since 2026-09-01); the "NOT PURCHASABLE YET"
comment on PRICING_TIERS.solo described the 2026-08-30 staging and is now marked
stale in place.

**Unit economics (2026-10-17):** at ₦1,500/$ each allowance now costs at most
~15% of its price — Manager about $2.20 of provider cost against ~$16.70, Label
about $5 against ~$40, Solo well under (150 credits against ~$5). No allowance
needed to move.

**No existing Plan could be reused, and the near-miss is worth knowing.** The
three minted on 2026-09-09 hold the right *amounts* — ₦5,000, ₦22,000, ₦50,000 —
at interval `annually`. A ₦5,000/**year** Plan cannot serve a ₦5,000/**month**
slot, so pointing `_PER_MONTH_` at one would have sold a year for the price of a
month. Amounts alone are never enough to identify a Plan; the interval is half
of it.

Verified end to end rather than assumed: every one of the six was cross-checked
by pulling the var back out of Vercel, resolving it at Paystack, and comparing
the Plan's `amount`/`interval`/`currency` against the kobo figure
`getTierMinorUnit` will actually send to `transaction/initialize`. All six
matched and `purchasableTiers()` resolves all three tiers as OFFERED. The DB
side was checked too — `subscriptions_plan_check` permits all three tier ids and
`subscriptions_billing_interval_check` permits both intervals, so nothing was
waiting on a migration.

⚠️ **The vars were first written SENSITIVE and then redone non-sensitive.**
`vercel env add` defaults to sensitive on this account, and a sensitive var
reads back as the literal string `[SENSITIVE]` — which makes the verification
above impossible and leaves the founder unable to read the codes in the
dashboard. `--no-sensitive` is the flag. A plan code is not a credential; it
identifies a Plan and authorises nothing. Match the 2026-09-09 vars, which are
non-sensitive for the same reason.

### ⚠️ A correction: "no deploy" is wrong, and it is written into the code

`billing-plans.ts` said *"Set the var and the tier starts being offered with no
deploy"* and called the order of operations "unnecessary". **Vercel snapshots
env vars per deployment**, so a var set after a build does not reach the running
one — production had to be rebuilt before any of the six existed as far as the
app was concerned. That comment is corrected in place.

What the fresh-var-name guarantee actually buys is still real and still worth
the awkward names: shipping the code before minting the Plans **withholds the
tier** instead of charging a stale Plan. That is a guarantee about the failure
MODE, not about deployment mechanics, and the two were conflated.

The rebuild was a `vercel redeploy` of the live production deployment — same
commit `cfe29af`, `builtAt` 20:38 → 23:47 — so no new code shipped, only a fresh
env snapshot. `/api/version` is the cheapest way to confirm one landed.

### The changelog question, left open deliberately

**#580 took no ledger entry and no version bump**, on the recorded reasoning that
a pricing *display* change counts as marketing under the app-only scope rule
(the 2026-08-16 precedent). Production is still v1.41.0.

That was a defensible call at merge, when nothing was purchasable. It is worth a
second look now that activation has landed, because what changed in the app is
not only display: **a monthly option a customer can actually buy now exists on
the wall, and did not before.** By the EPK precedent the entry lands at the flip,
which is this. Flagged rather than decided — minting Plans is not a licence to
mint a version number, and this file already records how perishable a version
bump is when several sessions hold a claim on one.

### Not verified

**No card has been charged and the wall has not been seen.**
`purchasableTiers()` is exposed only through `/api/subscription-status`, which
needs a session, so the chain is proven as far as "the env var resolves to a
correctly priced Plan" and no further. The manual pass is: open the wall, confirm
three cards and a monthly/yearly toggle, buy Solo monthly, confirm Paystack
quotes ₦5,000 and `subscriptions.billing_interval` reads `monthly`.

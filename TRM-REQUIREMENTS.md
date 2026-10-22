# What we need TRM Distro to confirm

Updated October 22, 2026, for pricing v3 (Manager and Label plans include distribution).

Urganize now sells Manager and Label with "Distribution included". For each team on those plans we owe TRM a fee, worked out by `lib/trm/partner-fee.ts` and recorded in `trm_partner_ledger` after every successful payment. We send TRM a monthly statement (CSV from `/admin/billing`) and pay by hand. Nothing is paid automatically.

Before we switch this on, please confirm two things.

## 1. A wholesale fee per team, not per release

We have built a fixed yearly fee per entitled team:

| Urganize plan | TRM plan | Yearly fee per team |
|---|---|---|
| Manager | Single Artist | ₦20,100 |
| Label | Label | ₦101,000 |
| Solo | none | never included |

Can TRM confirm these wholesale figures, per team per year, covering every release that team sends through Urganize?

If TRM prefers a share of what the team pays us instead, we can switch to that with one setting (`TRM_COST_BASIS=percent`, `TRM_REVENUE_SHARE_PCT`). Please tell us the percentage.

## 2. Monthly pro-rata billing, not a year upfront

By default we owe a twelfth of the yearly fee for each month a payment covers:

| Payment | Owed to TRM |
|---|---|
| Manager, 1 month | ₦1,675.00 |
| Label, 1 month | ₦8,416.67 |
| Manager, 6 months | ₦10,050 |
| Manager, 1 year | ₦20,100 |

Most teams pay monthly, and a team that stops paying stops costing either of us. Can TRM accept monthly pro-rata?

If TRM needs the full year upfront, we can switch (`TRM_BILLING_MODE=annual_upfront`): we then owe the whole year's fee the first time a team pays in a registration year (Manager 6 months would owe ₦20,100 at once), and nothing more until that year ends. To limit our risk in that case we can also limit distribution to teams that prepay 6 months or a year (`DISTRIBUTION_REQUIRES_PREPAY=true`).

## Still open from the API work

- Team registration: the Partner API has no account creation. We stamp a team as registered after its first successful payment and send the founder an alert; how should that team be set up on TRM's side?
- Store ids, the rejection payload shape and our release defaults (see `docs/notes/2026-10-19-send-to-trm.md`).

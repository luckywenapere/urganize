import { RiCheckLine } from "react-icons/ri";
import {
  PRICING_TIER_ORDER,
  formatTierPrice,
  getTier,
  tierHighlights,
  type PricingTierId,
} from "@urganize/pricing";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { salesMailto } from "@/lib/sales-mailto";

// The price table.
//
// EVERY NUMBER ON THIS PAGE COMES OUT OF @urganize/pricing, and none of it is
// written here. The prices come from the tier definitions and the ceilings come
// from `tierHighlights`, which builds its lines from the same `limits` field
// apps/web enforces against. So this page cannot advertise a seat count, a
// release count or an UrgAns allowance that the product does not actually
// apply — which is the failure this repo has shipped repeatedly with prices
// (four separate occasions of a page quoting one figure while checkout charged
// another, all recorded in CLAUDE.md).
//
// THE TWO PRICED TIERS SELL THEMSELVES; THE SALES-LED ONE STARTS A CONVERSATION
// (founder call, 2026-08-30). This narrows the 2026-08-24 rule that every CTA
// on this page was a capture, and it splits on who can be served without us in
// the room: a manager on Solo or Manager can sign up, get the free team trial
// and run a release alone, while a roster deal is still scoped and set up by
// hand. So Solo and Manager send people to the trial and Label says "Let's
// talk". (Group said the same until it came off the page the same day.)
//
// The trial CTA points at APP_SIGNUP_URL, which is /onboarding rather than
// /auth: apps/web's /auth is LOGIN-ONLY and has no signup form, so pointing a
// "start" CTA there lands people on a page with no way to create an account.
// The constant is the single definition of that, shared with the header and the
// /signup page.
//
// The mailto subject names the tier the visitor was looking at. That is not
// decoration: it is the only signal the founder gets about which plan someone
// came in on, and it costs nothing to carry.

/** Tiers a visitor can start on their own. Everything else talks to us first.
 *
 *  DERIVED, NOT LISTED, since 2026-09-08. It was a hand-written Set of two ids,
 *  and it went stale the same day Label got a price: the card would have shown
 *  ₦50,000 above a "Let's talk" button. A tier is self-serve exactly when it is
 *  not `contactSales`, which is the same fact `isSelfServeTier` encodes on the
 *  checkout side and the same derivation the in-app wall already makes. */
function isSelfServe(tierId: PricingTierId): boolean {
  return !getTier(tierId).contactSales;
}

export function PricingTierCards() {
  return (
    <section className="relative px-6 pb-20">
      {/* max-w-5xl for three cards — narrower than the max-w-6xl this page used
          while it carried four (Group, removed 2026-09-09). NO INTERVAL SWITCH
          above them since 2026-09-08: there is one interval, so there is
          nothing to switch, and the "2 months free" badge that lived under it
          went with the comparison it described. */}
      <div className="mx-auto max-w-5xl">
        {/* Three cards: one column on a phone (where most of this traffic
            reads it), three from md — the same breakpoint the "how the Group
            plan works" three-step section below already uses for three cards,
            so the two three-up layouts on this page agree. */}
        <div className="grid gap-6 md:grid-cols-3">
          {PRICING_TIER_ORDER.map((tierId) => {
            const tier = getTier(tierId);
            const price = formatTierPrice(tierId);
            const highlights = tierHighlights(tierId);
            const selfServe = isSelfServe(tierId);
            return (
              <div
                key={tierId}
                className={`flex h-full flex-col rounded-[1.5rem] border p-6 ${
                  tier.recommended
                    ? "border-[var(--marketing-accent)]/50 bg-[var(--marketing-accent)]/[0.06]"
                    : "border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                    {tier.label}
                  </p>
                  {tier.recommended ? (
                    <span className="rounded-full bg-[var(--marketing-accent)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--marketing-accent)]">
                      Most teams
                    </span>
                  ) : null}
                </div>

                {/* A sales-led tier has no `prices` at all, so there is no
                    figure to render and no risk of printing one we never
                    quoted. */}
                <p className="mt-4 text-3xl font-black tracking-tighter text-[var(--marketing-text)]">
                  {price ?? "Let's talk"}
                </p>

                <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)]">
                  {tier.audience}
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {highlights.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-sm leading-6 text-[var(--marketing-text-muted)]"
                    >
                      <RiCheckLine
                        className="mt-1 size-4 shrink-0 text-[var(--marketing-accent)]"
                        aria-hidden="true"
                      />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={selfServe ? APP_SIGNUP_URL : salesMailto(tier.label)}
                  data-track={selfServe ? "start_trial_click" : undefined}
                  data-location={selfServe ? `pricing_${tierId}` : undefined}
                  className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium tracking-[-0.02em] transition-colors ${
                    tier.recommended
                      ? "bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
                      : "border border-[var(--marketing-border)] text-[var(--marketing-text)] hover:border-[var(--marketing-accent)]/50"
                  }`}
                >
                  {/* Two outcomes, not three. "Book a demo" used to sit on a
                      priced tier that was not self-serve; since 2026-09-08 the
                      two conditions are exact complements, so that branch was
                      unreachable and is gone rather than left to rot. */}
                  {selfServe ? "Start free" : "Let's talk"}
                </a>
              </div>
            );
          })}
        </div>

        {/* The trial terms belong beside the button that starts one. 3 days and
            no card are the shipped terms (TEAM_TRIAL_DAYS in apps/web, and the
            /signup page says the same) — if either changes, all three move
            together. Shortened from 14 days by a founder call on 2026-09-10.
            "Your whole team" rather than "your workspace": that word is out
            of anything a customer reads. */}
        <p className="mt-8 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          Prices are in Naira. One price covers your whole team, not each person.
          Every plan is paid once a year. The free trial lasts 3 days and needs
          no card.
        </p>
      </div>
    </section>
  );
}

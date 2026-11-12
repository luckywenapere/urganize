"use client";

import { useState } from "react";
import { getTier, type PricingTierId } from "@urganize/pricing";
import { APP_ORIGIN } from "@/lib/app-urls";
import { trackEvent } from "@/lib/analytics";
import { salesMailto } from "@/lib/sales-mailto";
import { VisitorPrice } from "@/app/components/pricing/VisitorPrice";

// "Which plan fits you?" (#1220, from the Coframe review of 11 Nov 2026). The
// page sells five plans to three kinds of buyer, and the limits that tell them
// apart (artists, team size, rollouts at a time) sat in small type on five
// cards. Two taps now name the plan.
//
// The answers are worded from the plans' own limits in @urganize/pricing, so a
// change to a tier's artist ceiling changes the question with it. The result
// links to the same place the plan's card on /pricing does: checkout for a
// self-serve plan, a mailto for Label.

type Who = "artist" | "manager" | "label";

const PRO: PricingTierId = "manager"; // displayed as "Pro"
const PRO_PLUS: PricingTierId = "pro"; // displayed as "Pro Plus"

function artistsLimit(id: PricingTierId): number | null {
  return getTier(id).limits.artists;
}

type Answer = { label: string; match: PricingTierId };

function secondQuestion(who: Who): { question: string; answers: Answer[] } | null {
  if (who === "artist") {
    return {
      question: "How often do you put out music?",
      answers: [
        { label: "A release now and then", match: "solo" },
        { label: "Often, with a few at once", match: "solo_plus" },
      ],
    };
  }
  if (who === "manager") {
    const pro = artistsLimit(PRO) ?? 3;
    const proPlus = artistsLimit(PRO_PLUS) ?? 5;
    return {
      question: "How many artists do you manage?",
      answers: [
        { label: pro === 1 ? "1" : `1 to ${pro}`, match: PRO },
        { label: proPlus === pro + 1 ? `${proPlus}` : `${pro + 1} to ${proPlus}`, match: PRO_PLUS },
        { label: `More than ${proPlus}`, match: "label" },
      ],
    };
  }
  return null;
}

const chipClass = (selected: boolean) =>
  `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-5 text-sm font-medium transition-colors ${
    selected
      ? "border-[var(--marketing-primary)] bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)]"
      : "border-[color:var(--marketing-border-strong)] text-[var(--marketing-text)] hover:bg-[var(--marketing-surface-muted)]"
  }`;

export function PlanPicker() {
  const [who, setWho] = useState<Who | null>(null);
  const [match, setMatch] = useState<PricingTierId | null>(null);

  const pickWho = (next: Who) => {
    setWho(next);
    if (next === "label") {
      setMatch("label");
      trackEvent("plan_picker_answer", { who: next, match: "label" });
    } else {
      setMatch(null);
    }
  };

  const pickMatch = (answer: Answer) => {
    setMatch(answer.match);
    trackEvent("plan_picker_answer", { who: who ?? "", match: answer.match });
  };

  const second = who ? secondQuestion(who) : null;
  const tier = match ? getTier(match) : null;

  return (
    <div className="mx-auto mt-10 max-w-[52rem] rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-5 text-left sm:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:gap-8">
        <div className="space-y-6">
          <fieldset>
            <legend className="text-[1.05rem] font-semibold text-[var(--marketing-text)]">Which plan fits you?</legend>
            <p className="mt-1 text-sm text-[var(--marketing-text-muted)]">Who are you?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["artist", "manager", "label"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={who === option}
                  onClick={() => pickWho(option)}
                  className={chipClass(who === option)}
                >
                  {option === "artist" ? "An artist" : option === "manager" ? "A manager" : "A label"}
                </button>
              ))}
            </div>
          </fieldset>

          {second ? (
            <fieldset>
              <legend className="text-sm text-[var(--marketing-text-muted)]">{second.question}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {second.answers.map((answer) => (
                  <button
                    key={answer.label}
                    type="button"
                    aria-pressed={match === answer.match}
                    onClick={() => pickMatch(answer)}
                    className={chipClass(match === answer.match)}
                  >
                    {answer.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>

        <div aria-live="polite" className="flex flex-col justify-center rounded-2xl bg-[var(--marketing-bg)] p-5 sm:p-6">
          {tier && match ? (
            <>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                Your plan: {tier.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--marketing-text-muted)]">{tier.audience}</p>
              <p className="mt-3 text-[1.6rem] font-semibold tracking-[-0.03em] text-[var(--marketing-text)]">
                <VisitorPrice tierId={match} />
              </p>
              {tier.contactSales ? (
                <a
                  href={salesMailto(tier.label)}
                  data-track="pricing_contact_clicked"
                  data-plan={match}
                  data-location="home_plan_picker"
                  className="mt-4 inline-flex min-h-11 items-center justify-center self-start rounded-full border border-[var(--marketing-border-strong)] px-5 text-sm font-medium text-[var(--marketing-text)] transition-colors hover:bg-[var(--marketing-surface-muted)]"
                >
                  Talk to us
                </a>
              ) : (
                <a
                  href={`${APP_ORIGIN}/checkout?plan=${match}&period=monthly`}
                  data-track="pricing_plan_clicked"
                  data-plan={match}
                  data-period="monthly"
                  data-location="home_plan_picker"
                  className="mt-4 inline-flex min-h-11 items-center justify-center self-start rounded-full bg-[var(--marketing-primary)] px-5 text-sm font-medium text-[var(--marketing-primary-text)] transition-colors hover:bg-[var(--marketing-primary-hover)]"
                >
                  {`Choose ${tier.label}`}
                </a>
              )}
            </>
          ) : (
            <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
              {who ? "One more answer and we will show your plan." : "Answer two quick questions and we will show the plan that fits."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

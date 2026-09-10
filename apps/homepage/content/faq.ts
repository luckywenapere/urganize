import { PRICING_TIERS } from "@urganize/pricing";

// The homepage FAQ, as data (2026-09-02). One list feeds both the visible
// <details> accordion in FaqSection and the FAQPage JSON-LD in app/page.tsx,
// so the structured data can never say something the page does not.
//
// Every answer is a claim about the product AS IT SHIPS TODAY (the /features
// honesty rule): 3 days is TEAM_TRIAL_DAYS (shortened from 14 by a founder
// call on 2026-09-10), the artist ceilings come out of
// @urganize/pricing rather than being typed here, "test release" is the
// one-tap test path (v1.16.0), the Android app is only ever "offered inside
// Urganize" (private beta, no store listing). Plain words, short sentences,
// no Oxford comma — the copy rules every marketing string follows.
export type FaqItem = { question: string; answer: string };

const managerArtists = PRICING_TIERS.manager.limits.artists;

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Do I need a card to start?",
    answer:
      "No. The trial is free for 3 days, you can start with a test rollout and you pick a plan only when it ends.",
  },
  {
    question: "What happens when the 3 days end?",
    answer:
      "Your work is kept and your team is paused until you pick a plan.",
  },
  {
    question: "Is it for one artist or a roster?",
    answer: `Both. Solo covers one artist, Manager up to ${managerArtists ?? "five"} and Label has no limit.`,
  },
  {
    question: "Does my team pay per person?",
    answer:
      "No. One price covers your team and each plan says how many people it includes.",
  },
  {
    question: "Can I change the plan it gives me?",
    answer:
      "Yes. Edit or delete any activity, and UrgAns tailors the draft to your rollout before you approve it.",
  },
  {
    question: "Will UrgAns do things without asking?",
    answer:
      "It asks before anything that cannot be undone, like deleting a rollout, and only runs it after you approve.",
  },
  {
    question: "Does it post for me or distribute my music?",
    answer:
      "No. Urganize plans and tracks the rollout. You still post and distribute.",
  },
  {
    question: "Does it work on my phone?",
    answer:
      "Yes, in your browser. Add it to your home screen, and Android users are offered the app inside Urganize.",
  },
];

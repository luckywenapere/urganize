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
    question: "Can I start using it today?",
    answer:
      "We are letting teams in from the waitlist. Join it and we will reach out when your spot opens.",
  },
  {
    question: "What happens when my spot opens?",
    answer:
      "We set you up with a team trial first, and you pick a plan only after.",
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
      "Yes. UrgAns builds the plan from your answers, and you can edit or delete any activity after.",
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
  // Added 2026-09-30 (global-branding pass). "urganize" is one letter from
  // "urbanize" and a respelling of "organize", and a search for the brand
  // returned dictionary pages for the wrong word. This is the one place the
  // spelling is said as a question a person actually asks, and because this
  // list feeds the FAQPage JSON-LD it is also said to the search engine.
  {
    question: "How do I spell Urganize?",
    answer: "Urganize, with a G, like organize. It is not urbanize.",
  },
];

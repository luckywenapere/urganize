import { EXTRA_RELEASE_PRICE_NAIRA, EXTRA_RELEASE_PRICE_USD, PRICING_TIERS, formatMoney } from "@urganize/pricing";

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
// `answer` is plain text for the JSON-LD and llms.txt, which cannot know where
// the reader is, so a price there names both currencies. `segments`, when
// present, is what the page shows: a `{ price }` part renders in the visitor's
// own currency (#1301).
export type FaqPrice = "single";
export type FaqItem = {
  question: string;
  answer: string;
  segments?: readonly (string | { price: FaqPrice })[];
};

const artistsOn = (value: number | null) => (value === null ? "no limit" : `up to ${value}`);
const managerArtists = artistsOn(PRICING_TIERS.manager.limits.artists);
const proArtists = artistsOn(PRICING_TIERS.pro.limits.artists);
const singlePriceBoth = `${formatMoney(EXTRA_RELEASE_PRICE_NAIRA, "NGN")} in Nigeria, ${formatMoney(EXTRA_RELEASE_PRICE_USD, "USD")} elsewhere`;
const distributionBefore = `It sends your music to stores through our distribution partner. Solo Plus is the first plan that includes it, and ${PRICING_TIERS.pro.label} and Label do too. On Solo and ${PRICING_TIERS.manager.label} a single is `;
const distributionAfter = ". You still post yourself.";

// HOMEPAGE V2 (2026-10-17, URG-334; reworked 2026-10-19, URG-405: WhatsApp
// adoption and no-release questions replace "Do I pay per person?" and "Does it
// work on my phone?", phone folded into the WhatsApp answer): five questions, the real objections a
// manager has before joining a waitlist. Cut from the homepage: "What happens
// when my spot opens?" (folded into the first answer), "Can I change the plan
// it gives me?" (step A says "Change anything"), "Will UrgAns do things
// without asking?" (UrgAns is never introduced on the page, so it read as
// jargon) and "How do I spell Urganize?". Their wording is in git history.
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "When can I start?",
    answer:
      "Today. Create your account and pick a plan.",
  },
  {
    question: "My team lives on WhatsApp. Will they actually use it?",
    answer:
      "Yes, there’s almost nothing to learn. Send them an invite link and each person sees what’s theirs and when it’s due. It works in the phone browser too.",
  },
  {
    question: "Can I use it on my own?",
    answer: "Yes. Use it solo, or invite your team when you need them.",
  },
  {
    question: "What if I don’t have a release right now?",
    answer:
      "You don’t need one. Use it for shows, pitching and press, and start the next release early.",
  },
  {
    question: "Is it for one artist or a roster?",
    // Plan names since pricing v4 (2026-11-08): id manager is "Pro", id pro is "Pro Plus".
    answer: `Both. Solo and Solo Plus cover one artist, ${PRICING_TIERS.manager.label} ${managerArtists}, ${PRICING_TIERS.pro.label} ${proArtists} and Label has no limit.`,
  },
  {
    question: "Does it post or distribute for me?",
    answer: `${distributionBefore}${singlePriceBoth}${distributionAfter}`,
    segments: [distributionBefore, { price: "single" }, distributionAfter],
  },
];

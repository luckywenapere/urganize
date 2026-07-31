// The verbatim source of truth for every real customer quote on the
// marketing site. Previously duplicated between Sections.tsx and
// for-managers/page.tsx; consolidated here so there is exactly one place
// these words can drift from what was signed off.
//
// Same rule everywhere they're used: a testimonial only works because the
// words are really theirs. All four quotes have verbatim sign-off from
// @zaddyfunds_, Antoine, Adenaiye and Tamuno-Tekena (confirmed 2026-07-06).
// Never edit a quote after sign-off without re-approval. Never truncate one
// for a tighter layout — pick whichever quote is already short enough
// instead (see ProofLine.tsx's mount table for that reasoning).

export type TestimonialId = "zaddyfunds" | "antoine" | "adenaiye" | "tamuno";

export interface Testimonial {
  id: TestimonialId;
  quote: string;
  name: string;
  role: string;
  /** Only zaddyfunds carries a public link — the one quote a visitor can
   * independently verify came from a real person. */
  href?: string;
}

export const TESTIMONIALS: Record<TestimonialId, Testimonial> = {
  // Hero quote. A different person from Adenaiye Miracle below — handle
  // used with permission.
  zaddyfunds: {
    id: "zaddyfunds",
    quote: "This solves an actual problem in the industry.",
    name: "@zaddyfunds_",
    role: "Artist Manager",
    href: "https://instagram.com/zaddyfunds_",
  },
  antoine: {
    id: "antoine",
    quote:
      "I manage myself, so every dropped ball is mine. The first time I created a release, the whole rollout was already laid out, week by week, task by task. I stopped planning from memory.",
    name: "Antoine",
    role: "Artist Manager, Creative Business Academy alum",
  },
  adenaiye: {
    id: "adenaiye",
    quote:
      "The master, the artwork, the split sheet, they all live on the release now instead of buried in three different chats. When my artist needs a file, I know exactly where it is.",
    name: "Adenaiye Miracle",
    role: "Artist Manager",
  },
  tamuno: {
    id: "tamuno",
    quote:
      "I open a release and see what's done, what's blocked and what's due this week, without chasing anyone for an update. That's a call I don't have to make anymore.",
    name: "Tamuno-Tekena Ayafa",
    role: "A&R",
  },
};

// Urganize's OWN description of the pre-Urganize workflow, lifted verbatim
// from the already-approved comparison copy on /why-urganize (the "them"
// side of each row there). These are NOT the quoted person's words and must
// never be styled or written as if they were: no quote marks, no name, no
// implication a testimonial person said this. Kept as a separate export
// (not a `before` field on Testimonial) on purpose — a shared object
// invites a future edit to "tidy" the quote to match its pairing, which is
// exactly the drift this file exists to prevent.
export interface TransformationPair {
  testimonialId: TestimonialId;
  kicker: string;
  /** Verbatim from why-urganize/page.tsx's `comparisons[].them`. */
  before: string;
}

export const transformationPairs: readonly TransformationPair[] = [
  {
    testimonialId: "adenaiye",
    kicker: "Files",
    before:
      "Masters in Drive, artwork in the group chat, the contract in email. The night before delivery is an excavation across three apps and four folder-naming schemes.",
  },
  {
    testimonialId: "antoine",
    kicker: "The plan",
    before:
      "The plan lives in a pinned message, a spreadsheet someone made once, and your head. Every release starts from a blank page and whatever you remember from the last one.",
  },
  {
    testimonialId: "tamuno",
    kicker: "Status",
    before:
      "Knowing where a release stands means scrolling back through weeks of chat, or asking someone to repeat what they already told you. Multiply that by every release you're running.",
  },
];

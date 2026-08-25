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
//
// RE-APPROVAL LOG: Antoine's quote reworded "task by task" -> "activity by
// activity" on 2026-08-01, matching the product's tasks->activities rename;
// founder confirmed Antoine's sign-off on the new wording.
//
// ADENAIYE'S REVIEW REPLACED 2026-08-05 (URG-220): the founder relayed a
// new, full review from her directly. Full verbatim text (both paragraphs):
//
//   "Urganize significantly reduces the chaos that often comes with
//   managing multiple music releases, artists, and team members. It
//   streamlines release planning, task management, file organization, and
//   team collaboration, making it easy to keep everything in one place
//   without worrying about losing important information or trying to
//   remember where release materials are stored.
//
//   The platform presents information clearly, with a clean, intuitive
//   interface and straightforward navigation that makes it easy for anyone
//   on the team to get started. Using Urganize has been a great
//   experience, it has improved our workflow, kept everyone aligned, and
//   made collaboration much more efficient. Overall, it has made managing
//   our projects as a team far easier and more organized."
//
// Two complete sentences from it are approved for display (byte-identical
// excerpts, never edited fragments):
//   - the `adenaiye.quote` below ("Urganize significantly reduces the
//     chaos...") — the chaos/multiple-releases-and-artists-and-team
//     sentence, the site's sharpest ICP-match line.
//   - the "team" TransformationPair's `quoteOverride` further down ("Using
//     Urganize has been a great experience...").
// The "file organization... where release materials are stored" sentence
// is DO NOT DISPLAY while NEXT_PUBLIC_FEATURE_FILES is off in production —
// same honesty rule that retired her prior quote below. Every other
// quote is unchanged from the 2026-07-06 sign-off.

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
      "I manage myself, so every dropped ball is mine. The first time I created a release, the whole rollout was already laid out, week by week, activity by activity. I stopped planning from memory.",
    name: "Antoine",
    role: "Artist Manager, Creative Business Academy alum",
  },
  // Superseded 2026-08-05 (URG-220) by her new review — see the log above
  // for the full verbatim text. Her PRIOR quote (retired 2026-07-31 for the
  // same file-storage reason) is kept here in a comment, never deleted:
  //   "The master, the artwork, the split sheet, they all live on the
  //   release now instead of buried in three different chats. When my
  //   artist needs a file, I know exactly where it is."
  adenaiye: {
    id: "adenaiye",
    quote:
      "Urganize significantly reduces the chaos that often comes with managing multiple music releases, artists, and team members.",
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

// Urganize's OWN description of the pre-Urganize workflow. These are NOT
// the quoted person's words and must never be styled or written as if they
// were: no quote marks, no name, no implication a testimonial person said
// this. Kept as a separate export (not a `before` field on Testimonial) on
// purpose — a shared object invites a future edit to "tidy" the quote to
// match its pairing, which is exactly the drift this file exists to prevent.
//
// PROVENANCE CORRECTION (2026-08-19): this comment used to claim every
// `before` was verbatim from /why-urganize's `comparisons[].them`. That
// stopped being true when that page was refolded on 2026-08-05 — after the
// fold only Antoine's matched `comparisons[0].them` and Adenaiye's matched
// `compactComparisons[0].them`; Tamuno's matched nothing. These strings are
// now first-class house copy owned HERE; /why-urganize MIRRORS the Antoine
// and Adenaiye rows (keep those byte-identical when either file changes)
// and Tamuno's row is standalone.
export interface TransformationPair {
  testimonialId: TestimonialId;
  /**
   * House copy owned by THIS file (see the provenance correction above).
   * Plain-language pass 2026-08-25: keep these to one short thought a
   * visitor can read without re-reading. The Antoine row is mirrored
   * byte-identically by why-urganize/page.tsx's `comparisons[0].them` and
   * the Adenaiye row by its `compactComparisons[0].them` — change those
   * together with this file or not at all.
   */
  before: string;
  /**
   * An exact, complete-sentence excerpt from the same person's recorded
   * review, used instead of `TESTIMONIALS[testimonialId].quote` when the
   * canonical pull-quote and the best before->after line differ (e.g.
   * Adenaiye's canonical quote is her ICP-headline sentence, but this row's
   * strongest fit is a different sentence from the same review). Must
   * match the verbatim text recorded in the sign-off log above.
   */
  quoteOverride?: string;
}

// Row order is the section's reading order: plan -> team -> status. The
// rows carry NO visible title (removed 2026-08-25, founder call) — that
// grouping lives only here, as the reason each pairing sits where it does.
export const transformationPairs: readonly TransformationPair[] = [
  {
    testimonialId: "antoine",
    before:
      "Your plan is spread across a pinned chat, an old spreadsheet and your memory. Every new release starts from scratch.",
  },
  {
    testimonialId: "adenaiye",
    before:
      "Work gets assigned in a chat message that gets scrolled past.",
    quoteOverride:
      "Using Urganize has been a great experience, it has improved our workflow, kept everyone aligned, and made collaboration much more efficient.",
  },
  {
    testimonialId: "tamuno",
    before:
      "To find out where a release stands, you scroll back through weeks of chat or ask someone to repeat themselves.",
  },
];

// Barrel re-export (2026-07-31). This file used to hold all 8 landing
// sections directly; it grew unreviewable once TransformationSection and
// CommunitySection were added, so the sections moved to ./sections/*
// (one file per section + shared.ts for the shared class constants).
// Kept as a re-export, not deleted, so every existing import site
// (`from "./components/landing/Sections"` / `"../components/landing/Sections"`)
// keeps working unchanged — the same pattern the repo already uses for
// auth-helper consolidation (app/api/_shared/auth.ts).
//
// Removal ledger (rebuild any of these from git history if a beat is ever
// wanted back):
// - TestimonialSection: replaced by TransformationSection (before→after
//   pairs of the same four signed-off quotes).
// - MirrorSection, AskAISection: REMOVED 2026-08-13 (landing-page tone-down,
//   founder call).
// - CommunitySection: REMOVED 2026-08-19 (founder call: nobody clicked it).
// - TransformationSection: REMOVED 2026-08-25 (founder call: too bulky). Its
//   content ledger (transformationPairs) stays in content/testimonials.ts
//   and, since 2026-09-02, has a renderer again: StorySection opens each of
//   its three steps with the matching `before` line.
// - TemplatePlanSection: REMOVED 2026-08-25 (founder call, same pass).
// - StatsSection: REMOVED 2026-09-02 (homepage overhaul, URG-240). Its three
//   founder-supplied facts survive where they now do the most work: "3 days
//   free" in the CTA micro-copy (14 originally, shortened 2026-09-10), the
//   Founding Member line in the pricing
//   strip (content/founding-member.ts), and the one-team-all-artists offer,
//   which lived in RosterSection until that section itself was removed
//   2026-09-11 (see below) — that fact no longer survives anywhere on the
//   site.
// - ThreeFeaturesSection: REMOVED 2026-09-02 (URG-240). Its three claims —
//   assigned activities, UrgAns, status at a glance — are steps 2 and 3 of
//   StorySection and the UrgAnsSection.
// - RosterSection: REMOVED 2026-09-11 (founder call). Its claims — running
//   several artists on one team, a teammate scoped to one artist, a
//   self-service sign-in link for an external collaborator like a designer
//   or DJ — are not restated anywhere else on the site: /for-managers,
//   /for-labels and /for-executives all touch the broader roster idea but
//   none reproduce the per-artist-scoped-invite or sign-in-link mechanic,
//   and /signup, /login and /terms describe team-wide (not artist-scoped)
//   invite visibility instead. Antoine's testimonial, mounted here, is
//   unaffected — its other, independent mount is /features' features_cta
//   row (see ProofLine.tsx's mount table), so nothing needed to move.
// - WorkspaceShotSection left the landing page 2026-09-02 (the hero carries
//   the catalog shot now) but stays exported: the four persona pages still
//   import it.
export { FaqSection } from "./sections/FaqSection";
export { FeatureGridSection } from "./sections/FeatureGridSection";
export { FinalCTASection } from "./sections/FinalCTASection";
export { HeroSection } from "./sections/HeroSection";
export { PricingStripSection } from "./sections/PricingStripSection";
export { ProofSection } from "./sections/ProofSection";
export { StorySection } from "./sections/StorySection";
export { UrgAnsSection } from "./sections/UrgAnsSection";
export { WorkspaceShotSection } from "./sections/WorkspaceShotSection";

// Barrel re-export (2026-07-31). This file used to hold all 8 landing
// sections directly; it grew unreviewable once TransformationSection and
// CommunitySection were added, so the sections moved to ./sections/*
// (one file per section + shared.ts for the shared class constants).
// Kept as a re-export, not deleted, so every existing import site
// (`from "./components/landing/Sections"` / `"../components/landing/Sections"`)
// keeps working unchanged — the same pattern the repo already uses for
// auth-helper consolidation (app/api/_shared/auth.ts).
//
// TestimonialSection was REMOVED (replaced by TransformationSection, which
// restructures the same four signed-off quotes as before→after pairs
// instead of a standalone quote wall). Anything still importing
// TestimonialSection needs to switch to TransformationSection.
// MirrorSection and AskAISection were REMOVED 2026-08-13 (landing-page
// tone-down, founder call) — files deleted, rebuild from git history if
// either is ever wanted back. CommunitySection was REMOVED 2026-08-19
// (founder call: nobody clicked it) — same deal, git history has it.
// TransformationSection itself was REMOVED 2026-08-25 (founder call: too
// bulky — every quoted voice survives elsewhere: zaddyfunds in the hero
// ProofLine, adenaiye at the final CTA + /for-managers, tamuno on
// /for-executives + /why-urganize, antoine on /for-managers). Its
// content ledger (transformationPairs) stays in content/testimonials.ts
// as the canonical owner of the before-strings /why-urganize mirrors.
export { FinalCTASection } from "./sections/FinalCTASection";
export { HeroSection } from "./sections/HeroSection";
export { StatsSection } from "./sections/StatsSection";
export { TemplatePlanSection } from "./sections/TemplatePlanSection";
export { ThreeFeaturesSection } from "./sections/ThreeFeaturesSection";
export { WorkspaceShotSection } from "./sections/WorkspaceShotSection";

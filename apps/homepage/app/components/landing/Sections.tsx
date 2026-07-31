// Barrel re-export (2026-07-31). This file used to hold all 8 landing
// sections directly; it grew unreviewable once TransformationSection and
// ReleaseRoomSection were added, so the sections moved to ./sections/*
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
export { AskAISection } from "./sections/AskAISection";
export { FinalCTASection } from "./sections/FinalCTASection";
export { HeroSection } from "./sections/HeroSection";
export { MirrorSection } from "./sections/MirrorSection";
export { ReleaseRoomSection } from "./sections/ReleaseRoomSection";
export { TemplatePlanSection } from "./sections/TemplatePlanSection";
export { ThreeFeaturesSection } from "./sections/ThreeFeaturesSection";
export { TransformationSection } from "./sections/TransformationSection";
export { WorkspaceShotSection } from "./sections/WorkspaceShotSection";

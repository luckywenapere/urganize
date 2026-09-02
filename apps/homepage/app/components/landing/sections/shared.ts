// Shared class constants used across multiple landing sections. Split out
// of the old single-file Sections.tsx (2026-07-31) so each section can be
// reviewed on its own.
export const wideContainerClass = "max-w-[84rem] px-6 sm:px-8 lg:px-10";

// Stepped down 2026-08-13 (landing-page tone-down): section h2s used to run
// up to 5rem — the same scale as the hero — so nothing on the page receded.
// The hero h1 keeps its own inline sizing and is now the only huge type.
export const centeredHeadlineClass =
  "text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--marketing-text)] sm:text-[2.6rem] lg:text-[3rem]";

// The lead-paragraph scale that sits under a centeredHeadlineClass h2. Its
// last two consumers (TransformationSection, TemplatePlanSection) came off
// the page on 2026-08-25, so nothing imports it today — kept rather than
// deleted because the next section that needs a lead should reuse this
// scale instead of inventing a third one. Delete it if a section is added
// with a deliberately different lead size.
export const mutedLeadClass =
  "text-balance text-[clamp(1.1rem,2vw,1.4rem)] leading-8 text-[var(--marketing-text-muted)]";

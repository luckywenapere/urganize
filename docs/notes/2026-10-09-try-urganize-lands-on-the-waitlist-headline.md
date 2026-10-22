# "Try Urganize" lands on the waitlist headline (2026-10-09, no flag)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Every marketing "Try Urganize" button goes to `/#waitlist`, and the `id="waitlist"` sat on the div under the section's headline, so the page jumped to a bare email field with "Put your next rollout on plan." scrolled off behind the fixed header. The anchor is on the block that holds the headline now (`FinalCTASection.tsx`) with `scroll-mt-28`.

- **`scroll-mt-28` (112px), not `scroll-mt-24`.** The fixed header is 77px tall on a phone and 81px at 1440px, and the section slides up 20px as `ScrollReveal` shows it, after the browser has already placed the anchor. At 96px the headline sat flush against the header; at 112px it lands about 92px down. If the header height or the reveal's slide changes, re-check this margin.
- The form is still reached by `#waitlist input[type=email]`; the id moved up, nothing was renamed.
- Marketing-site only, so no changelog entry and no version bump.
- **Verified:** at 390px and 1440px, dark and light, the headline reads above the form after tapping the hero button. Homepage lint, build and the positioning and copy guard tests pass. **Not verified:** a real phone's browser (iOS Safari's anchor jump and its dynamic toolbar).

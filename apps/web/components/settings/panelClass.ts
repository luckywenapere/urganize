// Settings section shell — redesigned 2026-07-23 (founder call): the boxed
// "card" look (rounded corners, full borders, per-card shadow) read as
// plastic. Sections are now flat regions in one continuous column, separated
// by hairline rules (the parent wrapper owns `divide-y`), Linear/PostHog
// style, per the Brand Bible's flat-ground + hairline voice. Section titles
// render as mono uppercase kickers (see the h2s in each section).
//
// Textile layer (NEXT_PUBLIC_FEATURE_TEXTILE): `urg-rule-teeth` hangs an
// Adinkra tooth border off the hairline this section already sits above,
// turning the divide-y rule into a woven edge. Deliberately NOT `urg-cartouche`
// — a keyline would re-draw the box the 2026-07-23 call removed. The class is
// inert unless <html> carries `urg-textile`, so flag-off is unchanged, and
// `relative` (which the tooth border needs as its positioning context) was
// already here.
export const panelClass = 'relative py-9 urg-rule-teeth';

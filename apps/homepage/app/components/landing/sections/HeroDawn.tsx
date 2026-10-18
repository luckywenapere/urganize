// "Release Dawn", the dawn arm of the homepage hero A/B (2026-10-18, URG-376;
// founder approved the mock, gen.py in the Urganize Landing Gradient project).
// Both pieces render for every visitor and stay display:none unless
// html[data-hero-variant="dawn"] (lib/hero-variant.ts assigns it before first
// paint), so the flat arm's DOM and layout are exactly what they were. All
// styling is in globals.css under "Release Dawn": CSS only, no image, no JS.
//
// The metaphor: night at the top, so the headline keeps its contrast; a green
// dusk through the middle; the horizon rises right behind the product shot's
// top edge; then the page settles back to base before the affiliations strip,
// so nothing below the hero changes.

/** The sky. Anchored to the product-shot wrapper (not to the section) so the
 *  brightest point lands on the shot's top edge at every width. */
export function HeroSky() {
  return (
    <div aria-hidden="true" className="hero-sky">
      <div className="hero-sky-grain" />
    </div>
  );
}

// Four real Urganize moments, in the app's own words. Invented names only (no
// real artist, station or company: founder, 2026-10-18). Decorative, so the
// whole group is aria-hidden; the hero copy already says all of it.
// Desktop only (>= 1400px, where the gutters clear the headline); none on a
// phone, for cognitive load and paint cost.
export function HeroCards() {
  return (
    <div aria-hidden="true" className="hero-cards hero-fade-in hero-delay-3">
      <div className="hero-card hero-card-ask hero-card-1">
        Plan my single <b>Midnight Drive</b>, out Nov 14.
        <div className="hero-card-meta hero-card-meta-gap">
          <span className="hero-card-dot hero-card-dot-muted" />
          Planning 14 tasks
        </div>
      </div>

      <div className="hero-card hero-card-back hero-card-2 hero-card-row">
        <span className="hero-card-tick">&#10003;</span>
        <div>
          Cover art approved
          <div className="hero-card-meta">Kemi &middot; 2h ago</div>
        </div>
      </div>

      <div className="hero-card hero-card-3 hero-card-row">
        <div className="hero-card-cover" />
        <div>
          <span className="hero-card-chip">Pitch</span>
          Radio stations
          <div className="hero-card-meta">Due Fri &middot; Tolu</div>
        </div>
      </div>

      <div className="hero-card hero-card-back hero-card-4">
        <span className="hero-card-dot" />
        Release in 12 days
        <div className="hero-card-bar">
          <div className="hero-card-bar-fill" />
        </div>
        <div className="hero-card-meta">9 of 14 done</div>
      </div>
    </div>
  );
}

// Home on a computer has no cards (#1305, docs/mocks/home-wallpaper): content
// sits on the page, with one thin line under each heading and thinner lines
// between rows. The two line colours are set in globals.css (--home-line,
// --home-line-strong) so a wallpaper can lighten them.

/** The line under a heading, and the one between the chat and the Next drop. */
export const HOME_RULE = 'border-[color:var(--home-line-strong)]';
/** The line between two rows. */
export const HOME_ROW_RULE = 'border-[color:var(--home-line)]';
/** A row's hover: a soft fill with the family's 16px corners, a little wider
 *  than the text so the text itself stays on the heading's left edge. */
export const HOME_ROW_HOVER = '-mx-3 rounded-2xl px-3 transition-colors hover:bg-bg-hover/60';
/** A quiet "See all" style link on the right of a heading. */
export const HOME_MORE =
  'motion-focus inline-flex shrink-0 items-center gap-1 rounded-full text-[13px] font-medium text-content-secondary hover:text-content-primary';
/** The outlined pill button (Add artist, Customise Home). */
export const HOME_GHOST =
  'motion-focus motion-press inline-flex h-10 items-center gap-1.5 rounded-full border border-stroke-control px-[18px] text-[13px] font-medium text-content-primary hover:bg-bg-hover';

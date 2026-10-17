// Phone crops of the DESKTOP product screenshots (2026-10-10). Hand-written on
// purpose: the manifest beside this file (product-shots.ts) is generated and
// overwritten by `pnpm --filter @urganize/homepage shots`, and a crop must
// survive that.
//
// Why crops exist: a 1920px-wide desktop capture shrunk to a 340px phone
// column is at 0.18x, so the list, the dialog and the timeline turn into dark
// rectangles with grey dots and nobody can read what the section is showing.
// Cropping to the part the section is about and showing that at full column
// width gets it to about 0.5x, which reads. It also leaves out the side menu
// and top bar of the captures, which show the shell the app had before the
// 2026-10 redesign.
//
// Coordinates are SOURCE PIXELS of the capture, and `from` is the size they
// were measured against. ThemedProductShot only applies a crop when the shot's
// width and height still equal `from`, so a retake at a different size falls
// back to the full image instead of showing a wrong window.
//
// RETAKING THE SHOTS DOES NOT UPDATE THESE. A retake at the same 1920x973
// passes that check and the crop would then point at whatever is now at those
// coordinates. After `pnpm --filter @urganize/homepage shots`, open / at 390px
// wide and check the three step shots under "Create the rollout", "Put a name
// on every activity" and "See where every rollout stands", and the activity
// list on /features. The better fix, when the capture script can be run, is a
// real phone capture of each (the way catalogPhone and epkPhone are made), at
// which point this file and the crop prop can go.
//
// The light and dark captures of a shot come from the same DOM, scroll and open
// panel, so one rectangle serves both.

export type ShotCrop = {
  /** Width and height of the capture this rectangle was measured on. */
  from: readonly [number, number];
  x: number;
  y: number;
  w: number;
  h: number;
};

export const PHONE_CROPS = {
  // Re-measured 2026-10-17 on the retake for the homepage v2 (URG-334).
  // The plan UrgAns built for the rollout: its title line and the promo row.
  scopedRelease: { from: [1920, 973], x: 430, y: 365, w: 920, h: 360 },
  // The top of the open activity: its title, status, assignee, due date and
  // phase. The description box below is left out.
  activityDetail: { from: [1920, 973], x: 530, y: 255, w: 880, h: 375 },
  // The activity labels, the week axis with TODAY marked and the first rows
  // of markers and bars, ending between two rows so none is cut in half.
  timeline: { from: [1920, 973], x: 30, y: 440, w: 1000, h: 470 },
} as const satisfies Record<string, ShotCrop>;

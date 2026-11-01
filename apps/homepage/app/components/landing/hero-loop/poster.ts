import type { ProductShot } from "@/content/product-shots";

// The hero loop's poster stills (#952): its last frame (the plan, every task
// owned), captured from HeroLoopDemo itself in both themes with a transparent
// background, so the still and the loop line up pixel for pixel. Desktop is
// the 1000x560 design at 2.7x (sharp up to the frame's 1344px at 2x), phone
// the 358x540 design at 3x. Retake both pairs whenever HeroLoopDemo changes:
// docs/notes/2026-11-01-hero-loop.md has the recipe.
// Kept out of content/product-shots.ts, which the shots script regenerates.
export const HERO_LOOP_POSTER: { desktop: ProductShot; phone: ProductShot } = {
  desktop: {
    light: "/images/hero-loop/hero-loop.webp",
    dark: "/images/hero-loop/hero-loop-dark.webp",
    width: 2700,
    height: 1512,
  },
  phone: {
    light: "/images/hero-loop/hero-loop-phone.webp",
    dark: "/images/hero-loop/hero-loop-phone-dark.webp",
    width: 1074,
    height: 1620,
  },
};

import type { ProductShot } from "@/content/product-shots";

// The UrgAns demo loop's poster stills (#956): its POSTER state (the whole
// exchange, the pitch assigned), captured from DemoLoopScene itself in both
// themes, so the still and the loop line up. Desktop is the 720x440 design at
// 2.5x, phone the 358x580 design at 3x. Retake all four whenever
// DemoLoopScene or demo-loop.css changes; the recipe is in
// docs/notes/2026-11-01-hero-loop.md ("Retaking the stills"), with this
// scene and these sizes.
export const DEMO_LOOP_POSTER: { desktop: ProductShot; phone: ProductShot } = {
  desktop: {
    light: "/images/demo-loop/demo-loop.webp",
    dark: "/images/demo-loop/demo-loop-dark.webp",
    width: 1800,
    height: 1100,
  },
  phone: {
    light: "/images/demo-loop/demo-loop-phone.webp",
    dark: "/images/demo-loop/demo-loop-phone-dark.webp",
    width: 1074,
    height: 1740,
  },
};

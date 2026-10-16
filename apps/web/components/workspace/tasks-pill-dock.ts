// Same flag AppShell/MobileNavBar read. Below `lg` the panel shows the dock at
// the base (search and the release menu — see the 2026-08-16 mobile redesign
// note), and how far up the dock has to sit depends on which fixed surface
// already owns the screen's bottom edge — the nav bar when this is on, the
// floating UrgAns/support launcher when it isn't. Precomputed to a class so the
// dock's className stays a one-token swap, the same shape AppShell uses for
// <main>'s bottom padding. Both rules live in globals.css.
//
// Its own module (URG-314 batch 7) so WorkspaceSkeleton, the /dashboard loading
// fallback, can reserve the same offset without importing TasksPanel: that
// import pulled the whole panel (search, plan controls, rows) into every
// dashboard route's first load through the loading boundary.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
export const TASKS_PILL_DOCK_OFFSET_CLASS = MOBILE_NAV_ENABLED
  ? 'tasks-pill-dock-nav'
  : 'tasks-pill-dock';

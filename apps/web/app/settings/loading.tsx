/**
 * Route-segment fallback for the /settings redirect stub. There is no page to
 * skeleton any more (Settings is a pop-up, and each segment brings its own
 * loading states), so this reserves nothing and simply avoids the root brand
 * mark flashing for a route that is about to redirect.
 */
export default function SettingsLoading() {
  return <div className="min-h-[50dvh]" aria-busy="true" />;
}

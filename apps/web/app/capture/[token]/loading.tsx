// This route is `force-dynamic` (see page.tsx) — `loadPublicCapturePage` runs
// a live DB read plus a signed-URL mint on every request, so there is real
// wait time here, and it is the one surface where a blank tab costs the most:
// a fan arriving from a bio link on a phone gives a page about a second.
// Mirrors the real page's shape (square graphic, eyebrow, headline, field,
// button) and its dark-locked `.capture-island` palette so there is no colour
// flash and nothing shifts when the real page swaps in.
export default function PublicCaptureLoading() {
  const block = { backgroundColor: 'var(--capture-surface)' };

  return (
    <main
      className="capture-island min-h-screen"
      style={{ backgroundColor: 'var(--capture-ground)' }}
      aria-hidden="true"
    >
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col px-5 pb-10 pt-10 sm:pt-16">
        {/* The graphic reserves its exact square, so the headline below it
            doesn't jump a full viewport-width when the image lands. */}
        <div className="skeleton-shimmer aspect-square w-full" style={block} />

        <div className="mt-7 space-y-3">
          <div className="skeleton-shimmer h-2.5 w-28" style={block} />
          <div className="skeleton-shimmer h-8 w-4/5" style={block} />
          <div className="skeleton-shimmer h-4 w-3/5" style={block} />
        </div>

        <div className="mt-8 space-y-3">
          <div className="skeleton-shimmer h-12 w-full" style={block} />
          <div className="skeleton-shimmer h-12 w-full" style={block} />
          <div className="skeleton-shimmer h-3 w-2/3" style={block} />
        </div>
      </div>
    </main>
  );
}

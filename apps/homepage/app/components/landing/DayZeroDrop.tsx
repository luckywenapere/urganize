// Day Zero's backer card, for the one-week drop (2026-11-26 to about
// 2026-12-03, #1401). TEMPORARY: delete this file and its one line in
// app/page.tsx when the drop ends.
//
// The iframe version of Day Zero's widget (dayzero.ltd/dashboard/widget)
// rather than its script, so the card sits where we put it instead of where
// the script lands. Sales from it pay Day Zero 0%. The card's own words
// ("Back this startup", "Remind me" before the drop opens) are Day Zero's.

export function DayZeroDrop() {
  return (
    <section aria-label="Urganize on Day Zero" className="flex justify-center px-4 pb-4 pt-2 sm:pb-8">
      <iframe
        src="https://dayzero.ltd/embed/urganize"
        title="Urganize on Day Zero"
        loading="lazy"
        // Day Zero's page is light and paints no background. Our dark theme
        // sets color-scheme: dark, and when the two differ the browser paints
        // an opaque WHITE backdrop behind the frame. Matching their scheme
        // keeps the backdrop transparent, so only their card shows.
        style={{ colorScheme: 'light' }}
        className="block h-[18rem] w-full max-w-[22rem] border-0 bg-transparent"
      />
    </section>
  );
}

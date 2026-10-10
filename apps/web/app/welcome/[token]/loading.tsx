/**
 * The welcome page is force-dynamic, so a manager on a slow connection would
 * wait on a database round trip with a blank tab. A quiet placeholder in the
 * shape of the page: heading, a card, two fields.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-xl animate-pulse px-5 py-16">
      <span className="sr-only" role="status">
        Loading your profile
      </span>
      <div aria-hidden="true">
        <div className="h-3 w-24 rounded bg-bg-elevated" />
        <div className="mt-6 h-9 w-64 rounded bg-bg-elevated" />
        <div className="mt-8 h-12 w-full rounded-xl bg-bg-elevated" />
        <div className="mt-4 h-28 w-full rounded-xl bg-bg-elevated" />
        <div className="mt-4 h-12 w-full rounded-xl bg-bg-elevated" />
      </div>
    </main>
  );
}

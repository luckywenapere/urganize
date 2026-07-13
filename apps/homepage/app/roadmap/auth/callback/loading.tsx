export default function RoadmapAuthCallbackLoading() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--marketing-bg)] px-4 text-[var(--marketing-text)]"
      role="status"
      aria-live="polite"
    >
      <p className="mono-label text-[var(--marketing-text-subtle)]">Finishing sign-in…</p>
    </main>
  );
}

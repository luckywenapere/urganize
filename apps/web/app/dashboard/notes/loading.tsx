import { NotesPageSkeleton } from '@/components/loading/NotesPageSkeleton';

// Route-segment fallback. Without it this route inherits the root
// app/loading.tsx brand mark, so a navigation would flash two unrelated
// loading UIs — the brand mark, then the page's own skeleton. Rendering the
// SAME skeleton on both sides of the handoff makes it invisible.
//
// NotesPageClient also renders this while its stores hydrate; the two are
// deliberately the same component (see its comment).
export default function NotesLoading() {
  return <NotesPageSkeleton />;
}

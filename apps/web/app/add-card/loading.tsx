import { RootShellSkeleton } from '@/components/loading/RootShellSkeleton';

// The brand-mark fallback app/loading.tsx used to give every route without one
// of its own. There is no root loading.tsx any more (URG-314 batch 7): a root
// boundary would sit above the workspace layouts and swap their chrome in after
// a fallback. So each segment that relied on it carries the same fallback here.
export default function Loading() {
  return <RootShellSkeleton />;
}

'use client';

import { DirectoryProfileSection } from '../DirectoryProfileSection';

/**
 * How other teams can find you: opt-in, who can see it, what you do, and the
 * work requests that come back. It belongs to the person and follows them if
 * they leave the team, which is why it is not part of the team's own segments.
 */
export function DirectorySegment() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <DirectoryProfileSection />
    </div>
  );
}

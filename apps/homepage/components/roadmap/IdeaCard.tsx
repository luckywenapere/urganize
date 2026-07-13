"use client";

import type { RoadmapIdea, RoadmapIdeaStatus } from "@/lib/roadmap/types";

type IdeaCardProps = {
  idea: RoadmapIdea;
  isAdmin: boolean;
  onStatusChange: (ideaId: string, status: RoadmapIdeaStatus) => void;
};

/**
 * Admin moderation card for the pending-review queue. Public voting + status
 * changes on live ideas happen in IdeaRow; this is only the "approve a new
 * submission onto the public board, or decline it" gate.
 */
export function IdeaCard({ idea, isAdmin, onStatusChange }: IdeaCardProps) {
  return (
    <div className="rounded-xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] p-4">
      <h4 className="text-sm font-semibold leading-snug text-[var(--marketing-text)]">
        {idea.title}
      </h4>
      {idea.description ? (
        <p className="mt-1 line-clamp-3 text-sm text-[var(--marketing-text-muted)]">
          {idea.description}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onStatusChange(idea.id, "under_consideration")}
            className="rounded-full bg-[var(--marketing-primary)] px-3 py-1.5 text-xs font-medium text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onStatusChange(idea.id, "declined")}
            className="rounded-full border border-[color:var(--marketing-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--marketing-text)] hover:bg-[var(--marketing-secondary-hover)]"
          >
            Decline
          </button>
        </div>
      ) : null}
    </div>
  );
}

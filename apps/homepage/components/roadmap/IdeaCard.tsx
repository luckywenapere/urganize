"use client";

import { ChevronUp } from "lucide-react";
import type { RoadmapIdea, RoadmapIdeaStatus } from "@/lib/roadmap/types";

const ADMIN_STATUS_OPTIONS: RoadmapIdeaStatus[] = [
  "under_consideration",
  "planned",
  "in_progress",
  "shipped",
  "declined",
];

type IdeaCardProps = {
  idea: RoadmapIdea;
  isSignedIn: boolean;
  isAdmin: boolean;
  onVoteToggle: (idea: RoadmapIdea) => void;
  onRequestSignIn: () => void;
  onStatusChange: (ideaId: string, status: RoadmapIdeaStatus) => void;
  /** 'review' renders the private pending-moderation controls (Approve/Decline)
   * instead of the public vote button. */
  variant?: "board" | "review";
};

export function IdeaCard({
  idea,
  isSignedIn,
  isAdmin,
  onVoteToggle,
  onRequestSignIn,
  onStatusChange,
  variant = "board",
}: IdeaCardProps) {
  const handleVoteClick = () => {
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }
    onVoteToggle(idea);
  };

  return (
    <div className="rounded-xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug text-[var(--marketing-text)]">
            {idea.title}
          </h4>
          {idea.description ? (
            <p className="mt-1 line-clamp-3 text-sm text-[var(--marketing-text-muted)]">
              {idea.description}
            </p>
          ) : null}
        </div>

        {variant === "board" ? (
          <button
            type="button"
            onClick={handleVoteClick}
            aria-pressed={idea.has_voted}
            aria-label={idea.has_voted ? "Remove vote" : "Vote for this idea"}
            className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              idea.has_voted
                ? "border-[color:var(--marketing-primary)] bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)]"
                : "border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] text-[var(--marketing-text)] hover:border-[color:var(--marketing-text)]"
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            {idea.vote_count}
          </button>
        ) : null}
      </div>

      {variant === "review" && isAdmin ? (
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

      {variant === "board" && isAdmin ? (
        <div className="mt-3">
          <label className="mono-label text-[var(--marketing-text-subtle)]">
            Admin: move to
          </label>
          <select
            value={idea.status}
            onChange={(e) => onStatusChange(idea.id, e.target.value as RoadmapIdeaStatus)}
            className="mt-1 w-full rounded-lg border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] px-2 py-1.5 text-xs text-[var(--marketing-text)]"
          >
            {ADMIN_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

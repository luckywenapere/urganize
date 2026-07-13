"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  ADMIN_STATUS_OPTIONS,
  ROADMAP_STATUS_LABELS,
  type RoadmapIdea,
  type RoadmapIdeaStatus,
} from "@/lib/roadmap/types";

// Length past which the details get a "Show more" toggle (PostHog truncates
// long descriptions inline the same way).
const TRUNCATE_AT = 180;

type IdeaRowProps = {
  idea: RoadmapIdea;
  isSignedIn: boolean;
  isAdmin: boolean;
  onVoteToggle: (idea: RoadmapIdea) => void;
  onRequestSignIn: () => void;
  onStatusChange: (ideaId: string, status: RoadmapIdeaStatus) => void;
};

/**
 * One row of the vote-ranked roadmap list (PostHog layout): a prominent vote
 * control on the left, then the idea title + expandable details, with a status
 * pill. Rows are ranked by vote_count globally by the parent -- the ranking is
 * the whole point, so nothing fragments it.
 */
export function IdeaRow({
  idea,
  isSignedIn,
  isAdmin,
  onVoteToggle,
  onRequestSignIn,
  onStatusChange,
}: IdeaRowProps) {
  const [expanded, setExpanded] = useState(false);

  const description = idea.description ?? "";
  const isLong = description.length > TRUNCATE_AT;
  const shownDescription =
    isLong && !expanded ? `${description.slice(0, TRUNCATE_AT).trimEnd()}…` : description;

  const handleVoteClick = () => {
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }
    onVoteToggle(idea);
  };

  return (
    <div className="flex items-start gap-4 border-b border-[color:var(--marketing-border)] py-5">
      {/* Vote control -- left-aligned, stacked icon + count, like PostHog. */}
      <button
        type="button"
        onClick={handleVoteClick}
        aria-pressed={idea.has_voted}
        aria-label={
          idea.has_voted ? `Remove your vote from ${idea.title}` : `Vote for ${idea.title}`
        }
        className={`flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${
          idea.has_voted
            ? "border-[color:var(--marketing-primary)] bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)]"
            : "border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] text-[var(--marketing-text)] hover:border-[color:var(--marketing-text)]"
        }`}
      >
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
        {idea.vote_count}
      </button>

      {/* Idea title + details + status. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-base font-semibold text-[var(--marketing-text)]">{idea.title}</h3>
          <StatusPill status={idea.status} />
        </div>

        {description ? (
          <p className="mt-1.5 text-sm leading-6 text-[var(--marketing-text-muted)]">
            {shownDescription}
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 font-medium text-[var(--marketing-text)] underline underline-offset-2"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </p>
        ) : null}

        {isAdmin ? (
          <div className="mt-2.5 flex items-center gap-2">
            <label className="mono-label text-[var(--marketing-text-subtle)]">Move to</label>
            <select
              value={idea.status}
              onChange={(e) => onStatusChange(idea.id, e.target.value as RoadmapIdeaStatus)}
              className="rounded-md border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] px-2 py-1 text-xs text-[var(--marketing-text)]"
            >
              {ADMIN_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {ROADMAP_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RoadmapIdeaStatus }) {
  // under_consideration is the neutral "open for votes" state; planned /
  // in_progress get the brand accent to signal committed work.
  const isCommitted = status === "planned" || status === "in_progress";
  return (
    <span
      className={`mono-label rounded-full border px-2.5 py-0.5 text-[0.6rem] ${
        isCommitted
          ? "border-[color:var(--marketing-accent)] text-[var(--marketing-accent)]"
          : "border-[color:var(--marketing-border-strong)] text-[var(--marketing-text-subtle)]"
      }`}
    >
      {ROADMAP_STATUS_LABELS[status]}
    </span>
  );
}

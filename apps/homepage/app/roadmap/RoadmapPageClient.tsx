"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { supabase } from "@/lib/supabase/client";
import { isRoadmapAdmin } from "@/lib/roadmap/admin";
import { listIdeas, castVote, removeVote, updateIdeaStatus } from "@/lib/roadmap/queries";
import {
  PUBLIC_ROADMAP_STATUSES,
  ROADMAP_STATUS_LABELS,
  type RoadmapIdea,
  type RoadmapIdeaStatus,
} from "@/lib/roadmap/types";
import { AuthPanel } from "@/components/roadmap/AuthPanel";
import { IdeaSubmissionModal } from "@/components/roadmap/IdeaSubmissionModal";
import { IdeaCard } from "@/components/roadmap/IdeaCard";

export function RoadmapPageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [ideas, setIdeas] = useState<RoadmapIdea[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isAuthPanelOpen, setIsAuthPanelOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const isAdmin = isRoadmapAdmin(user?.email);

  const loadIdeas = useCallback(async () => {
    const { ideas: loaded, error } = await listIdeas();
    if (error) {
      setLoadError(error);
      return;
    }
    setLoadError("");
    setIdeas(loaded);
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.session?.user ?? null);
      setIsAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas, user]);

  const handleVoteToggle = async (idea: RoadmapIdea) => {
    if (!user) return;
    setActionError("");

    // Optimistic update.
    setIdeas((current) =>
      current.map((candidate) =>
        candidate.id === idea.id
          ? {
              ...candidate,
              has_voted: !candidate.has_voted,
              vote_count: candidate.has_voted
                ? Math.max(0, candidate.vote_count - 1)
                : candidate.vote_count + 1,
            }
          : candidate
      )
    );

    const { error } = idea.has_voted
      ? await removeVote(idea.id, user.id)
      : await castVote(idea.id, user.id);

    if (error) {
      setActionError(error);
      void loadIdeas(); // roll back to server truth
    }
  };

  const handleStatusChange = async (ideaId: string, status: RoadmapIdeaStatus) => {
    setActionError("");
    const { error } = await updateIdeaStatus(ideaId, status);
    if (error) {
      setActionError(error);
      return;
    }
    void loadIdeas();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const pendingReviewIdeas = useMemo(
    () => (isAdmin ? ideas.filter((idea) => idea.status === "pending") : []),
    [ideas, isAdmin]
  );

  const ownPendingOrDeclined = useMemo(
    () =>
      !isAdmin && user
        ? ideas.filter(
            (idea) =>
              idea.submitted_by === user.id &&
              (idea.status === "pending" || idea.status === "declined")
          )
        : [],
    [ideas, isAdmin, user]
  );

  const columns = useMemo(() => {
    return PUBLIC_ROADMAP_STATUSES.map((status) => ({
      status,
      label: ROADMAP_STATUS_LABELS[status],
      items: ideas
        .filter((idea) => idea.status === status)
        .sort((a, b) => b.vote_count - a.vote_count || a.created_at.localeCompare(b.created_at)),
    }));
  }, [ideas]);

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="mono-label text-[var(--marketing-text-subtle)]">Roadmap</p>
              <h1 className="mt-6 text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.05em] sm:text-[3rem]">
                Help us decide what to build next
              </h1>
              <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
                Suggest an idea, vote on what matters to you, and watch it move from
                consideration to shipped.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {!isAuthLoading && user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsSubmitModalOpen(true)}
                    className="rounded-full bg-[var(--marketing-primary)] px-5 py-2.5 text-sm font-medium text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
                  >
                    Suggest an idea
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-xs text-[var(--marketing-text-subtle)] hover:text-[var(--marketing-text)]"
                  >
                    Sign out ({user.email})
                  </button>
                </>
              ) : !isAuthLoading ? (
                <button
                  type="button"
                  onClick={() => setIsAuthPanelOpen(true)}
                  className="rounded-full bg-[var(--marketing-primary)] px-5 py-2.5 text-sm font-medium text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
                >
                  Sign in to vote
                </button>
              ) : null}
            </div>
          </div>

          {isAuthPanelOpen && !user ? (
            <div className="mt-8 max-w-md">
              <AuthPanel onClose={() => setIsAuthPanelOpen(false)} />
            </div>
          ) : null}

          {loadError ? (
            <p className="mt-8 text-sm text-red-600">{loadError}</p>
          ) : null}
          {actionError ? (
            <p className="mt-4 text-sm text-red-600">{actionError}</p>
          ) : null}

          {ownPendingOrDeclined.length > 0 ? (
            <section className="mt-10">
              <h2 className="mono-label text-[var(--marketing-text-subtle)]">Your submissions</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {ownPendingOrDeclined.map((idea) => (
                  <div
                    key={idea.id}
                    className="rounded-xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--marketing-text)]">
                      {idea.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--marketing-text-subtle)]">
                      {idea.status === "pending" ? "Under review by the team" : "Not moving forward"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {isAdmin && pendingReviewIdeas.length > 0 ? (
            <section className="mt-10">
              <h2 className="mono-label text-[var(--marketing-text-subtle)]">
                Needs review ({pendingReviewIdeas.length})
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {pendingReviewIdeas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    isSignedIn={Boolean(user)}
                    isAdmin={isAdmin}
                    variant="review"
                    onVoteToggle={handleVoteToggle}
                    onRequestSignIn={() => setIsAuthPanelOpen(true)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-12 grid gap-6 lg:grid-cols-4">
            {columns.map((column) => (
              <section key={column.status}>
                <h2 className="mono-label text-[var(--marketing-text-subtle)]">
                  {column.label} ({column.items.length})
                </h2>
                <div className="mt-3 space-y-3">
                  {column.items.length === 0 ? (
                    <p className="text-sm text-[var(--marketing-text-subtle)]">Nothing here yet.</p>
                  ) : (
                    column.items.map((idea) => (
                      <IdeaCard
                        key={idea.id}
                        idea={idea}
                        isSignedIn={Boolean(user)}
                        isAdmin={isAdmin}
                        onVoteToggle={handleVoteToggle}
                        onRequestSignIn={() => setIsAuthPanelOpen(true)}
                        onStatusChange={handleStatusChange}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />

      {isSubmitModalOpen && user ? (
        <IdeaSubmissionModal
          userId={user.id}
          onClose={() => setIsSubmitModalOpen(false)}
          onSubmitted={() => {
            setIsSubmitModalOpen(false);
            void loadIdeas();
          }}
        />
      ) : null}
    </div>
  );
}

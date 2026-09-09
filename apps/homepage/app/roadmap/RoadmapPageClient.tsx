"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { supabase } from "@/lib/supabase/client";
import { isRoadmapAdmin } from "@/lib/roadmap/admin";
import { listIdeas, castVote, removeVote, updateIdeaStatus } from "@/lib/roadmap/queries";
import { BOARD_STATUSES, type RoadmapIdea, type RoadmapIdeaStatus } from "@/lib/roadmap/types";
import { AuthPanel } from "@/components/roadmap/AuthPanel";
import { IdeaSubmissionModal } from "@/components/roadmap/IdeaSubmissionModal";
import { IdeaRow } from "@/components/roadmap/IdeaRow";
import { IdeaCard } from "@/components/roadmap/IdeaCard";

const BOARD_STATUS_SET = new Set<RoadmapIdeaStatus>(BOARD_STATUSES);

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

  // The vote-ranked list: every board-status idea in ONE list, sorted by votes
  // desc (created_at asc as the tiebreak). This global ranking is the point --
  // the single most-wanted idea sits at the top, unmissable.
  const rankedIdeas = useMemo(
    () =>
      ideas
        .filter((idea) => BOARD_STATUS_SET.has(idea.status))
        .sort((a, b) => b.vote_count - a.vote_count || a.created_at.localeCompare(b.created_at)),
    [ideas]
  );

  // Shipped ideas: shown as a muted footer strip, no vote control. Canonical
  // shipped history lives in /changelog; this just closes the loop for ideas
  // that originated here.
  const shippedIdeas = useMemo(
    () =>
      ideas
        .filter((idea) => idea.status === "shipped")
        .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")),
    [ideas]
  );

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-[36rem]">
              <p className="mono-label text-[var(--marketing-text-subtle)]">Roadmap</p>
              <h1 className="mt-6 text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.05em] sm:text-[3rem]">
                Help us decide what to build next
              </h1>
              <p className="mt-4 text-[var(--marketing-text-muted)]">
                Vote on what matters to you. The most-wanted ideas rise to the top. To see what
                we&apos;ve delivered recently,{" "}
                <Link href="/changelog" className="text-[var(--marketing-text)] underline underline-offset-2">
                  visit the changelog
                </Link>
                .
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

          {loadError ? <p className="mt-8 text-sm text-red-600">{loadError}</p> : null}
          {actionError ? <p className="mt-4 text-sm text-red-600">{actionError}</p> : null}

          {/* Non-admin: your own pending/declined submissions. */}
          {ownPendingOrDeclined.length > 0 ? (
            <section className="mt-10">
              <h2 className="mono-label text-[var(--marketing-text-subtle)]">Your submissions</h2>
              <div className="mt-3 space-y-2">
                {ownPendingOrDeclined.map((idea) => (
                  <div
                    key={idea.id}
                    className="rounded-xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface-muted)] px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-[var(--marketing-text)]">{idea.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--marketing-text-subtle)]">
                      {idea.status === "pending" ? "Under review by the team" : "Not moving forward"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Admin: pending moderation queue. */}
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
                    isAdmin={isAdmin}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* The vote-ranked list. */}
          <section className="mt-12">
            {rankedIdeas.length === 0 ? (
              <p className="rounded-xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] px-4 py-8 text-center text-sm text-[var(--marketing-text-subtle)]">
                No ideas on the board yet. Be the first to suggest one.
              </p>
            ) : (
              <div className="border-t border-[color:var(--marketing-border)]">
                {rankedIdeas.map((idea) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    isSignedIn={Boolean(user)}
                    isAdmin={isAdmin}
                    onVoteToggle={handleVoteToggle}
                    onRequestSignIn={() => setIsAuthPanelOpen(true)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Delivered: muted footer strip, no voting. */}
          {shippedIdeas.length > 0 ? (
            <section className="mt-12">
              <h2 className="mono-label text-[var(--marketing-text-subtle)]">Delivered</h2>
              <ul className="mt-3 space-y-1.5">
                {shippedIdeas.map((idea) => (
                  <li
                    key={idea.id}
                    className="flex items-center gap-2 text-sm text-[var(--marketing-text-muted)]"
                  >
                    <span className="text-[var(--marketing-accent)]">✓</span>
                    {idea.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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

# "<Name> added an idea" review prompt (2026-10-26, flag NEXT_PUBLIC_FEATURE_IDEA_REVIEW_PROMPT, OFF)

Slice 3 of the founder-approved idea-flow mock. Founder decision: **suggest, don't change**. A new idea from someone else never rewrites the plan or briefs; the owner reviews suggested changes and taps Apply.

## What it does
On a rollout that already has a plan, when someone other than the owner adds a note, the owner's Ideas card shows "<First name> added an idea" (or "N new ideas"), the note text, **Review changes** and **Dismiss**. Review changes opens the existing suggested-changes panel (`IdeaChangesPanel`, see "New ideas update an existing plan" in `2026-10-26-rollout-team-brief.md`): adds and moves, "Not saved yet", Apply changes / Not now. Dismiss only hides the prompt.

## Where things are
- Pure rules, tested: `lib/rollout-ideas.ts` (`isIdeaReviewPromptEnabled`, `notesToReview`, `reviewBaseline`, `ideaReviewTitle`).
- UI: `RolloutIdeasCard.tsx` (the prompt returns before the "New idea for this plan?" row). Analytics `idea_review_prompt` {count, action}.
- No server change and no migration: it reuses `ideas/changes` (owner only, needs the planner on).

## Traps
- **"Last looked" is kept in localStorage on the owner's device** (`urganize:idea-reviewed:<releaseId>`). Another device or a cleared browser starts from a fresh baseline, so ideas that arrived before that first look there are not prompted. A server-side marker is the follow-up if this matters.
- The first look only sets the baseline (the newest note's time), so old rollouts never open with a pile of old notes.
- The owner already gets a push and email when someone chimes in (`ideaNoteRecipients`); this prompt is the in-app half.
- Not rendered in a browser; the suggest call was not run against the real AI gateway.

'use client';

import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { buildAttentionItems } from '@/lib/home/attention';
import { pickChappiSpeaks } from '@/lib/home/chappi-speaks';
import { buildOnboardingProgress } from '@/lib/home/onboarding';
import { HOME_BLOCK_LABELS, orderHomeBlocks, type HomeBlockKey } from '@/lib/home/sections';
import { buildPlacementItems, buildTaskStack, buildWaitingItems } from '@/lib/home/stack-items';
import { pickUpNext } from '@/lib/home/up-next';
import type { HomePayload } from '@/lib/home/types';
import { AttentionStack } from './AttentionStack';
import { ChappiSpeaksCard } from './ChappiSpeaksCard';
import { HomeStack } from './HomeStack';
import { OpportunitiesCard } from './OpportunitiesCard';
import { OPPORTUNITIES_ENABLED } from '@/lib/paused-features';
import { OnboardingBar } from './OnboardingBar';
import { PlacementsStack } from './PlacementsStack';
import { RolloutsStack } from './RolloutsStack';
import { SpendCard } from './SpendCard';
import { TasksStack } from './TasksStack';
import { TeamPresenceCard } from './TeamPresenceCard';
import { UpNextCard } from './UpNextCard';
import { WaitingStack } from './WaitingStack';
import { useHomeFocusData } from './useHomeFocusData';
import { NextMovesStack } from './NextMovesStack';
import { useHomeNextMoves } from './useHomeNextMoves';
import { useSpendRollouts } from './useSpendRollouts';
import { useSpendSummary } from './useSpendSummary';

/**
 * Home's groups in the decided order (lib/home/sections.ts), each one only when
 * it has something in it. The same blocks on a phone and a desktop, on a busy
 * day and a quiet one. The artist chosen in the top bar narrows them, through
 * useHomeFocusData, so Home and Catalogue agree.
 */
export function HomeBlocks({
  home,
  viewerId,
  hideStartUpNext = false,
}: {
  home: HomePayload;
  viewerId: string;
  /** Leave out the "Plan your next rollout" card where a start button already sits. */
  hideStartUpNext?: boolean;
}) {
  const { live, releases, yourTasks, waitingTasks, placements } = useHomeFocusData(home, viewerId);
  // The money card is for managers (a label is a team of them). The server adds
  // up only what this person may see, so anyone else gets nothing and no card.
  const isManager = home.role === 'manager' || home.role === 'label';
  const spend = useSpendSummary(isManager);
  // The rollouts the card can open (2026-10-11): it opens a rollout's Spend
  // scene, and shows with no spend yet once there is one to add to.
  const spendRollouts = useSpendRollouts(releases, isManager);

  const taskStack = buildTaskStack(yourTasks);
  const upNext = pickUpNext(releases);
  const attention = buildAttentionItems({
    yourTasks,
    waiting: { tasks: waitingTasks },
    placements,
  });
  const waitingItems = buildWaitingItems(waitingTasks);
  const placementItems = buildPlacementItems(placements);
  const onboarding = buildOnboardingProgress(live.releases);
  // What to do next on each rollout (URG-259): rules over what Home already
  // loaded, no model call. Dismissed ones never come back.
  const nextMoves = useHomeNextMoves({ releases, viewerId, placements });

  const blocks = orderHomeBlocks({
    onboardingVisible: live.releases.length > 0 && !onboarding.complete,
    taskCount: taskStack ? 1 + taskStack.rest.length : 0,
    upNext: upNext.kind === 'start' && hideStartUpNext ? null : upNext.kind,
    nextMoveCount: nextMoves.moves.length,
    attentionCount: attention.length,
    waitingCount: waitingItems.length,
    rolloutCount: releases.length,
    placementCount: placementItems.length,
    showSpend: spend !== null && (spend.totalKobo > 0 || spendRollouts.length > 0),
    lateCount: yourTasks.late.length,
  });

  const render = (key: HomeBlockKey) => {
    switch (key) {
      case 'onboarding':
        return <OnboardingBar progress={onboarding} />;
      case 'tasks':
        return taskStack ? <TasksStack stack={taskStack} /> : null;
      case 'up-next':
        return (
          <HomeStack
            label={HOME_BLOCK_LABELS['up-next']}
            items={[upNext]}
            showCount={false}
            getKey={(next) => next.kind}
            renderItem={(next) => <UpNextCard next={next} />}
          />
        );
      case 'next-moves':
        return (
          <NextMovesStack
            moves={nextMoves.moves}
            showRollout={releases.length > 1}
            onDismiss={nextMoves.dismiss}
          />
        );
      case 'attention':
        return <AttentionStack items={attention} />;
      case 'waiting':
        return <WaitingStack items={waitingItems} onTimeCount={live.waitingOnTimeCount} />;
      case 'rollouts':
        return <RolloutsStack rollouts={releases} />;
      case 'placements':
        return <PlacementsStack items={placementItems} />;
      case 'spend':
        return spend ? <SpendCard summary={spend} rollouts={spendRollouts} /> : null;
      case 'daily-line':
        return <ChappiSpeaksCard line={pickChappiSpeaks({ releases })} />;
    }
  };

  return (
    <>
      {/* No wrapper per block: a block that draws nothing (the getting-started
          bar once closed) must not leave an empty gap in the page's spacing. */}
      {/* Each block is fenced (2026-10-09): one card that throws on odd data
          goes quiet instead of taking the whole of Home to the crash screen,
          which is what a bad block did before, and "Try again" could not help
          because the same data threw again. ErrorBoundary adds no element. */}
      {/* Opportunities first (URG-266, 2026-10-14): the newest open grants and
          deals that fit the team, ahead of every other group. It reads its own
          data, so it sits outside orderHomeBlocks, and unlike the groups below
          it shows an empty state. */}
      {/* Paused Oct 27, 2026 (lib/paused-features.ts). */}
      {OPPORTUNITIES_ENABLED ? (
        <ErrorBoundary name="home-block-opportunities" onError={reportBoundaryError}>
          <OpportunitiesCard />
        </ErrorBoundary>
      ) : null}
      {blocks.map((key) => (
        <ErrorBoundary key={key} name={`home-block-${key}`} onError={reportBoundaryError}>
          {render(key)}
        </ErrorBoundary>
      ))}
      {/* Your team (URG-250, 2026-10-15): when each teammate was last in the
          app. Reads its own data, so it sits outside orderHomeBlocks, last,
          and draws nothing until someone else has joined the team. */}
      <ErrorBoundary name="home-block-team" onError={reportBoundaryError}>
        <TeamPresenceCard />
      </ErrorBoundary>
    </>
  );
}

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
import { NextShowCard } from './NextShowCard';
import { OnboardingBar } from './OnboardingBar';
import { PlacementsStack } from './PlacementsStack';
import { RolloutsStack } from './RolloutsStack';
import { SpendCard } from './SpendCard';
import { TasksStack } from './TasksStack';
import { UpNextCard } from './UpNextCard';
import { WaitingStack } from './WaitingStack';
import { useHomeFocusData } from './useHomeFocusData';
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
  const spend = useSpendSummary(home.role === 'manager' || home.role === 'label');

  const taskStack = buildTaskStack(yourTasks);
  const upNext = pickUpNext(home.nextShow, releases);
  const attention = buildAttentionItems({
    yourTasks,
    waiting: { tasks: waitingTasks, djLinks: home.waiting.djLinks },
    placements,
    nextShow: home.nextShow,
  });
  const waitingItems = buildWaitingItems(waitingTasks, home.waiting.djLinks);
  const placementItems = buildPlacementItems(placements);
  const onboarding = buildOnboardingProgress(live.releases);

  const blocks = orderHomeBlocks({
    onboardingVisible: live.releases.length > 0 && !onboarding.complete,
    taskCount: taskStack ? 1 + taskStack.rest.length : 0,
    upNext: upNext.kind === 'start' && hideStartUpNext ? null : upNext.kind,
    attentionCount: attention.length,
    waitingCount: waitingItems.length,
    hasNextShow: home.nextShow !== null,
    rolloutCount: releases.length,
    placementCount: placementItems.length,
    hasSpend: (spend?.totalKobo ?? 0) > 0,
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
      case 'attention':
        return <AttentionStack items={attention} />;
      case 'waiting':
        return <WaitingStack items={waitingItems} onTimeCount={live.waitingOnTimeCount} />;
      case 'next-show':
        return home.nextShow ? <NextShowCard nextShow={home.nextShow} /> : null;
      case 'rollouts':
        return <RolloutsStack rollouts={releases} />;
      case 'placements':
        return <PlacementsStack items={placementItems} />;
      case 'spend':
        return spend ? <SpendCard summary={spend} /> : null;
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
      {blocks.map((key) => (
        <ErrorBoundary key={key} name={`home-block-${key}`} onError={reportBoundaryError}>
          {render(key)}
        </ErrorBoundary>
      ))}
    </>
  );
}

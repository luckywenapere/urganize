import { setup } from 'xstate';
import {
  RELEASE_PIPELINE_STATES,
  type ReleasePipelineState,
} from '@/lib/execution-types';

export type ReleaseMachineContext = {
  readinessByState: Record<ReleasePipelineState, number>;
};

export type ReleaseMachineEvent =
  | { type: 'ADVANCE' }
  | { type: 'JUMP'; state: ReleasePipelineState }
  | { type: 'SYNC'; state: ReleasePipelineState; readinessByState: Record<ReleasePipelineState, number> };

export const releaseMachine = setup({
  types: {
    context: {} as ReleaseMachineContext,
    events: {} as ReleaseMachineEvent,
  },
  guards: {
    stateReady: ({ context, event }) => {
      if (event.type !== 'ADVANCE') return false;
      return Object.values(context.readinessByState).some((value) => value >= 0);
    },
  },
}).createMachine({
  id: 'releasePipeline',
  initial: 'idea',
  context: {
    readinessByState: {
      idea: 0,
      planning: 0,
      asset_prep: 0,
      distribution: 0,
      campaign: 0,
      post_release: 0,
    },
  },
  states: {
    idea: {
      on: {
        ADVANCE: { target: 'planning', guard: ({ context }) => context.readinessByState.idea >= 100 },
        JUMP: [
          { target: 'idea', guard: ({ event }) => event.state === 'idea' },
        ],
      },
    },
    planning: {
      on: {
        ADVANCE: { target: 'asset_prep', guard: ({ context }) => context.readinessByState.planning >= 100 },
        JUMP: [
          { target: 'idea', guard: ({ event }) => event.state === 'idea' },
          { target: 'planning', guard: ({ event }) => event.state === 'planning' },
        ],
      },
    },
    asset_prep: {
      on: {
        ADVANCE: { target: 'distribution', guard: ({ context }) => context.readinessByState.asset_prep >= 100 },
        JUMP: [
          { target: 'idea', guard: ({ event }) => event.state === 'idea' },
          { target: 'planning', guard: ({ event }) => event.state === 'planning' },
          { target: 'asset_prep', guard: ({ event }) => event.state === 'asset_prep' },
        ],
      },
    },
    distribution: {
      on: {
        ADVANCE: { target: 'campaign', guard: ({ context }) => context.readinessByState.distribution >= 100 },
        JUMP: [
          { target: 'idea', guard: ({ event }) => event.state === 'idea' },
          { target: 'planning', guard: ({ event }) => event.state === 'planning' },
          { target: 'asset_prep', guard: ({ event }) => event.state === 'asset_prep' },
          { target: 'distribution', guard: ({ event }) => event.state === 'distribution' },
        ],
      },
    },
    campaign: {
      on: {
        ADVANCE: { target: 'post_release', guard: ({ context }) => context.readinessByState.campaign >= 100 },
        JUMP: [
          { target: 'idea', guard: ({ event }) => event.state === 'idea' },
          { target: 'planning', guard: ({ event }) => event.state === 'planning' },
          { target: 'asset_prep', guard: ({ event }) => event.state === 'asset_prep' },
          { target: 'distribution', guard: ({ event }) => event.state === 'distribution' },
          { target: 'campaign', guard: ({ event }) => event.state === 'campaign' },
        ],
      },
    },
    post_release: {
      on: {
        JUMP: RELEASE_PIPELINE_STATES.map((state) => ({
          target: state,
          guard: ({ event }: { event: ReleaseMachineEvent }) => event.type === 'JUMP' && event.state === state,
        })),
      },
    },
  },
});

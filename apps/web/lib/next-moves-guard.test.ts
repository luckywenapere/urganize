import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Next moves (URG-259) are rules only: no model, no credits. If a model is ever
// added to rank or phrase them, it must be metered through the usual path
// (lib/credits + ai_usage_events with a feature label), and this guard is the
// reminder to do that on purpose.
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('next moves stay rules-only', () => {
  const files = [
    'lib/next-moves.ts',
    'lib/next-moves-server.ts',
    'app/api/next-moves/route.ts',
    'stores/useNextMovesStore.ts',
    'components/next-moves/useNextMoves.ts',
    'components/next-moves/NextMoveCard.tsx',
    'components/next-moves/RolloutNextMoves.tsx',
    'components/home/useHomeNextMoves.ts',
    'components/home/NextMovesStack.tsx',
  ];

  it.each(files)('%s makes no model call', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/lib\/ai\/|lib\/chappi\/runner|generate\w*AiOutput|routed/);
  });

  it('is mounted on Home and on the rollout page', () => {
    expect(read('components/home/HomeBlocks.tsx')).toContain('<NextMovesStack');
    expect(read('components/workspace/WorkspaceView.tsx')).toContain('<RolloutNextMoves');
  });
});

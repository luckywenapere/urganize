// Customise Home, on a computer (#1182, mock docs/mocks/home-tighter, note 9).
// One person's choice of which blocks Home shows and in what order. Saved per
// user, never per team, in ui_state_drafts (scope and key below), the per-user
// store that already exists. Pure: the store in stores/useHomeLayoutStore.ts
// does the reading and writing.

// 'next_drop' is the chat card since #1295 (the Next drop sits inside it); the
// id stays so saved layouts keep its place. The separate 'ask' box it
// replaced is gone: a saved layout that names it simply drops it.
export const HOME_BLOCK_IDS = ['out_now', 'next_drop', 'my_tasks', 'delegated', 'team', 'artists'] as const;

export type HomeBlockId = (typeof HOME_BLOCK_IDS)[number];

export type HomeLayout = {
  /** Blocks on Home, top to bottom. */
  order: HomeBlockId[];
  /** Blocks waiting under "Add to Home". */
  removed: HomeBlockId[];
};

/** Home is never empty: the artists list stays. */
export const LOCKED_HOME_BLOCK: HomeBlockId = 'artists';

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  // The chat card leads Home (#1295, mock home-chat-desktop note 1).
  order: ['next_drop', 'out_now', 'my_tasks', 'delegated', 'team', 'artists'],
  removed: [],
};

export const HOME_LAYOUT_SCOPE = 'home';
export const HOME_LAYOUT_KEY = 'home-layout';
const VERSION = 1;

export const HOME_BLOCK_COPY: Record<HomeBlockId, { title: string; about: string }> = {
  out_now: { title: 'Out now', about: 'Songs that just came out and their streaming links. Shows only when there is one.' },
  next_drop: { title: 'Ask AI and Next drop', about: 'The box to ask AI, beside the rollout that drops soonest.' },
  my_tasks: { title: 'My tasks', about: 'Tasks assigned to you.' },
  delegated: { title: 'Delegated', about: 'Tasks you gave to someone else.' },
  team: { title: 'Team', about: 'Each person and how much is on them.' },
  artists: { title: 'Artists', about: 'Every artist and their next rollout.' },
};

const isBlockId = (value: unknown): value is HomeBlockId =>
  typeof value === 'string' && (HOME_BLOCK_IDS as readonly string[]).includes(value);

const unique = (values: unknown): HomeBlockId[] =>
  Array.isArray(values) ? Array.from(new Set(values.filter(isBlockId))) : [];

const copyOf = (layout: HomeLayout): HomeLayout => ({ order: [...layout.order], removed: [...layout.removed] });

/**
 * A saved layout, made safe to draw. Anything unreadable is the default.
 * Unknown blocks are dropped, the artists list is always on, and a block the
 * save never mentions (one added to the app later) lands where the default
 * puts it, so a new block is not silently hidden from people who customised.
 */
export function readLayout(raw: unknown): HomeLayout {
  if (!raw || typeof raw !== 'object') return copyOf(DEFAULT_HOME_LAYOUT);
  const saved = raw as { order?: unknown; removed?: unknown };
  const order = unique(saved.order);
  if (order.length === 0) return copyOf(DEFAULT_HOME_LAYOUT);
  const removed = unique(saved.removed).filter((id) => !order.includes(id) && id !== LOCKED_HOME_BLOCK);
  if (!order.includes(LOCKED_HOME_BLOCK)) order.push(LOCKED_HOME_BLOCK);

  for (const id of HOME_BLOCK_IDS) {
    if (order.includes(id) || removed.includes(id)) continue;
    const at = DEFAULT_HOME_LAYOUT.order.indexOf(id);
    if (at === -1) {
      removed.push(id);
      continue;
    }
    // After the nearest default neighbour above it that is on Home.
    const before = DEFAULT_HOME_LAYOUT.order.slice(0, at).reverse().find((other) => order.includes(other));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  }
  return { order, removed };
}

export const toPayload = (layout: HomeLayout) => ({ v: VERSION, order: [...layout.order], removed: [...layout.removed] });

export function moveBlock(layout: HomeLayout, id: HomeBlockId, toIndex: number): HomeLayout {
  const from = layout.order.indexOf(id);
  if (from === -1) return layout;
  const order = layout.order.filter((other) => other !== id);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
  return { order, removed: [...layout.removed] };
}

export function removeBlock(layout: HomeLayout, id: HomeBlockId): HomeLayout {
  if (id === LOCKED_HOME_BLOCK || !layout.order.includes(id)) return layout;
  return { order: layout.order.filter((other) => other !== id), removed: [...layout.removed, id] };
}

export function addBlock(layout: HomeLayout, id: HomeBlockId): HomeLayout {
  if (layout.order.includes(id)) return layout;
  return { order: [...layout.order, id], removed: layout.removed.filter((other) => other !== id) };
}

export const isDefaultLayout = (layout: HomeLayout): boolean =>
  layout.order.join() === DEFAULT_HOME_LAYOUT.order.join() &&
  [...layout.removed].sort().join() === [...DEFAULT_HOME_LAYOUT.removed].sort().join();

const HALF_WIDTH: readonly HomeBlockId[] = ['my_tasks', 'delegated'];

/** The two task lists share a row when they are neighbours; all else is full width. */
export function layoutRows(order: readonly HomeBlockId[]): HomeBlockId[][] {
  const rows: HomeBlockId[][] = [];
  for (let index = 0; index < order.length; index += 1) {
    const id = order[index];
    const next = order[index + 1];
    if (HALF_WIDTH.includes(id) && next && HALF_WIDTH.includes(next)) {
      rows.push([id, next]);
      index += 1;
    } else {
      rows.push([id]);
    }
  }
  return rows;
}

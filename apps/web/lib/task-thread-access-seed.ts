/**
 * First-frame guess at whether the viewer can post in an activity's Chat
 * (2026-10-18, the "double pop"). The task pop-up opens instantly from the
 * store-seeded task and the server's real `canComment` lands a moment later.
 * Seeding a flat `false` meant the Chat card first said "Only the assignee and
 * your team's managers can post here." with no composer, then swapped to the
 * composer, so the content changed size right after the sheet arrived.
 *
 * This mirrors hasTaskThreadAccess (lib/tasks-server.ts) with what the client
 * already knows: the assignee or creator can always post; otherwise the answer
 * depends only on the viewer's team role (owner/admin), which we learn from the
 * first server answer for an activity that is neither theirs nor created by
 * them and remember per user + workspace. The server answer still wins when it
 * arrives; this only makes the first frame right in the common cases.
 */

type ThreadAccessTask = {
  workspaceId: string;
  assignedToUserId: string | null;
  createdBy: string;
};

const STORAGE_KEY = 'urganize.task-thread-role-access.v1';
const memory = new Map<string, boolean>();

const keyFor = (userId: string, workspaceId: string) => `${userId}:${workspaceId}`;

function readStored(): Record<string, boolean> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function roleGrantsThreadAccess(userId: string, workspaceId: string): boolean | null {
  const key = keyFor(userId, workspaceId);
  if (memory.has(key)) return memory.get(key) ?? null;
  const stored = readStored()[key];
  if (typeof stored === 'boolean') {
    memory.set(key, stored);
    return stored;
  }
  return null;
}

/** The composer state to render before the server answers. */
export function seedTaskCanComment(task: ThreadAccessTask, userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (task.assignedToUserId && task.assignedToUserId === userId) return true;
  if (task.createdBy && task.createdBy === userId) return true;
  return roleGrantsThreadAccess(userId, task.workspaceId) ?? false;
}

/**
 * Learn the role half of the rule from a server answer. Only an activity the
 * viewer neither owns nor created says anything about their role.
 */
export function rememberTaskCanComment(
  task: ThreadAccessTask & { canComment: boolean },
  userId: string | null | undefined
): void {
  if (!userId) return;
  if (task.assignedToUserId === userId || task.createdBy === userId) return;
  const key = keyFor(userId, task.workspaceId);
  if (memory.get(key) === task.canComment) return;
  memory.set(key, task.canComment);
  try {
    if (typeof window === 'undefined') return;
    const stored = readStored();
    stored[key] = task.canComment;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or blocked: the in-memory answer still covers this session.
  }
}

/** Test seam. */
export function resetTaskThreadAccessSeed(): void {
  memory.clear();
}

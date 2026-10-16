'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { TaskCreateSource } from '@/lib/tasks';
import { isTaskUiEngineRequested, subscribeTaskUiEngineRequest } from '@/lib/task-ui-demand';

// TaskUIProvider is mounted by AppShell for every page, /auth included. Since
// URG-314 batch 6 (2026-10-16) it is only the context: openTask,
// openQuickCreate, closeTask and isTaskOpen. The engine behind them (task
// detail pop-up, quick create, completion sheets, undo toast, the task store
// and the offline queue they use) is components/tasks/TaskUIEngine.tsx, a
// separate chunk loaded only where it can be needed:
// - on /dashboard* and /settings, right after hydration (the C shortcut, the
//   undo toast and the warm-up of the task surfaces all live there);
// - anywhere else, the first time something calls openTask/openQuickCreate,
//   or the task store asks for a completion's undo toast or sheet
//   (lib/task-ui-demand.ts).
// A call made before the engine arrives is queued and replayed in order when
// it registers, so nothing a user taps is lost. The engine renders nothing on
// the server, so the server HTML is unchanged.
const TaskUIEngine = dynamic(
  () => import('@/components/tasks/TaskUIEngine').then((m) => m.TaskUIEngine),
  { ssr: false }
);

export const TASKS_CHANGED_EVENT = 'urganize:tasks-changed';

export type QuickCreateDefaults = {
  releaseId?: string | null;
  groupId?: string | null;
  source?: TaskCreateSource;
  /**
   * Seeds the title field. The input is focused AND selected on open, so a
   * prefill is accepted by pressing Enter and replaced by simply typing —
   * which is what makes seeding it non-intrusive rather than something to
   * clear first.
   */
  title?: string;
};

type TaskUIHandlers = {
  openTask: (taskId: string) => void;
  openQuickCreate: (defaults?: QuickCreateDefaults) => void;
  closeTask: () => void;
};

type TaskUIContextValue = TaskUIHandlers & {
  /** True while the task detail pop-up is open. Since 2026-07-23 the detail
   * renders as a centered modal mounted BY THIS PROVIDER — consumers no
   * longer swap their layout; they just call openTask and the pop-up
   * appears over whatever surface they're on. */
  isTaskOpen: boolean;
};

/** How the lazily loaded engine talks back to the provider. */
export type TaskUIEngineBridge = {
  /** Hands over the real handlers; returns the unregister function. */
  register: (handlers: TaskUIHandlers) => () => void;
  setIsTaskOpen: (open: boolean) => void;
};

const TaskUIContext = createContext<TaskUIContextValue | null>(null);

export function useTaskUI() {
  const context = useContext(TaskUIContext);
  if (!context) {
    throw new Error('useTaskUI must be used inside TaskUIProvider.');
  }

  return context;
}

const getServerEngineRequested = () => false;

export function TaskUIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldShowTaskShell = pathname?.startsWith('/dashboard') || pathname === '/settings';
  const engineRequested = useSyncExternalStore(
    subscribeTaskUiEngineRequest,
    isTaskUiEngineRequested,
    getServerEngineRequested
  );
  const [isTaskOpen, setIsTaskOpen] = useState(false);

  // Latch: once the engine has been asked for it stays mounted, so an open
  // pop-up or a pending sheet survives moving to a page that would not have
  // loaded it. Set from an effect, never during render, so the server HTML and
  // the hydration pass are exactly what they were with the engine inline (it
  // rendered nothing there either).
  const [engineWanted, setEngineWanted] = useState(false);
  const wantsEngine = shouldShowTaskShell || engineRequested;
  useEffect(() => {
    if (wantsEngine) setEngineWanted(true);
  }, [wantsEngine]);

  const engineRef = useRef<TaskUIHandlers | null>(null);
  const pendingRef = useRef<Array<(handlers: TaskUIHandlers) => void>>([]);

  const call = useCallback((run: (handlers: TaskUIHandlers) => void) => {
    if (engineRef.current) {
      run(engineRef.current);
      return;
    }
    pendingRef.current.push(run);
    setEngineWanted(true);
  }, []);

  const openTask = useCallback((taskId: string) => call((h) => h.openTask(taskId)), [call]);
  const openQuickCreate = useCallback(
    (defaults?: QuickCreateDefaults) => call((h) => h.openQuickCreate(defaults)),
    [call]
  );
  const closeTask = useCallback(() => {
    // Nothing can be open before the engine exists, so there is nothing to
    // queue: just drop any open request still waiting for it.
    if (engineRef.current) {
      engineRef.current.closeTask();
      return;
    }
    pendingRef.current = [];
  }, []);

  const bridge = useMemo<TaskUIEngineBridge>(
    () => ({
      register(handlers) {
        engineRef.current = handlers;
        const queued = pendingRef.current;
        pendingRef.current = [];
        for (const run of queued) run(handlers);
        return () => {
          if (engineRef.current === handlers) engineRef.current = null;
        };
      },
      setIsTaskOpen,
    }),
    []
  );

  const contextValue = useMemo<TaskUIContextValue>(
    () => ({ openTask, openQuickCreate, closeTask, isTaskOpen }),
    [closeTask, isTaskOpen, openQuickCreate, openTask]
  );

  return (
    <TaskUIContext.Provider value={contextValue}>
      {children}
      {engineWanted ? <TaskUIEngine bridge={bridge} /> : null}
    </TaskUIContext.Provider>
  );
}

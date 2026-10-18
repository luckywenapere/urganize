import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// URG-314 batch 6 (2026-10-16). The root layout's chain (AppShell,
// TaskUIProvider, auth-store) ships to every route, /auth included. These
// modules were taken off it; a static import of any of them puts it, and what
// it imports, back into every route's first load. Use import() or
// next/dynamic instead (see PERFORMANCE.md, "Root layout is the shared
// bundle").

const APP_ROOT = join(__dirname, '..');
const code = (path: string) => readFileSync(join(APP_ROOT, path), 'utf8');

/** Static (non type-only) import specifiers of a file. */
function staticImports(path: string): string[] {
  const source = code(path);
  const out: string[] = [];
  const re = /^\s*import\s+(?!type\b)[^'"]*?['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) out.push(match[1]);
  return out;
}

describe('the shared first-load chain stays light', () => {
  it('TaskUIProvider is the context only; the engine and the task store load on demand', () => {
    const imports = staticImports('components/tasks/TaskUIProvider.tsx');
    expect(imports).not.toContain('@/stores/useTaskStore');
    expect(imports).not.toContain('@/components/tasks/TaskUIEngine');
    expect(code('components/tasks/TaskUIProvider.tsx')).toContain(
      "import('@/components/tasks/TaskUIEngine')"
    );
  });

  it('AppShell loads the release and planner stores and the share offer on demand', () => {
    const imports = staticImports('components/app/AppShell.tsx');
    for (const heavy of [
      '@/stores/useReleaseStore',
      '@/stores/usePlannerStore',
      '@/stores/useTaskStore',
      '@/components/share/withFirstShareOffer',
      '@/lib/social-share',
    ]) {
      expect(imports).not.toContain(heavy);
    }
  });

  it('auth-store clears first-run records and reads the paywall flag without their owners', () => {
    const imports = staticImports('lib/auth-store.ts').map((spec) => spec.replace(/^\.\//, '@/lib/'));
    for (const heavy of ['@/lib/first-session', '@/lib/social-share-offer', '@/lib/team-billing']) {
      expect(imports).not.toContain(heavy);
    }
  });

  it('the composers load voice only when it is switched on', () => {
    for (const path of ['components/home/HomeAskBar.tsx', 'components/chappi/ChappiConversation.tsx']) {
      const imports = staticImports(path);
      expect(imports).not.toContain('@/components/chappi/useVoiceInput');
      expect(imports).not.toContain('@/components/chappi/voice/TalkButton');
      expect(imports).not.toContain('@/stores/useVoiceCallStore');
    }
  });

  // URG-314 batch 7: the workspace chrome is mounted by the /dashboard and
  // /settings layouts (components/app/WorkspaceFrame.tsx), not by AppShell.
  it('AppShell carries none of the workspace chrome', () => {
    const imports = staticImports('components/app/AppShell.tsx');
    for (const chrome of [
      '@/components/shell/TopNav',
      '@/components/shell/SubNav',
      '@/components/shell/Sidebar',
      '@/components/shell/PageBar',
      '@/components/shell/BottomBar',
      '@/components/shell/KeyboardShortcuts',
      '@/components/app/TeamTrialStrip',
      '@/components/app/TeamReadOnlyStrip',
      '@/components/app/UrgansUsageStrip',
      '@/components/app/OfflineBanner',
      '@/components/app/WorkspaceFrame',
    ]) {
      expect(imports).not.toContain(chrome);
    }
    const shell = code('components/app/AppShell.tsx');
    expect(shell).not.toContain("import('@/components/shell/CommandBar')");
    expect(shell).not.toContain("import('@/components/shell/FloatingUrgAns')");
  });

  it('the workspace layouts mount the chrome', () => {
    for (const layout of ['app/dashboard/layout.tsx', 'app/settings/layout.tsx']) {
      expect(staticImports(layout)).toContain('@/components/app/WorkspaceFrame');
      expect(code(layout)).toContain('<WorkspaceFrame>{children}</WorkspaceFrame>');
    }
  });

  it('no Suspense boundary sits above the workspace layouts', () => {
    // A root loading.tsx wraps every top-level segment, layouts included: the
    // chrome would be swapped in after a brand-mark fallback instead of being
    // in the first paint. Segments that need the brand mark carry their own.
    expect(existsSync(join(APP_ROOT, 'app/loading.tsx'))).toBe(false);
    // A segment error.tsx here made pages wait on its code during the server
    // render and fall back to the brand mark; the frame has its own boundary.
    expect(existsSync(join(APP_ROOT, 'app/dashboard/error.tsx'))).toBe(false);
    expect(existsSync(join(APP_ROOT, 'app/settings/error.tsx'))).toBe(false);
    const frame = code('components/app/WorkspaceFrame.tsx');
    expect(frame).toContain('<WorkspacePageErrorBoundary>');
    // The page sits in MainMorph (its 180ms settle-in, lib/morph.ts) inside the
    // same boundary.
    expect(frame).toMatch(/<Suspense fallback=\{<RootShellSkeleton \/>\}>\s*<MainMorph>\{children\}<\/MainMorph>\s*<\/Suspense>/);
  });

  // URG-314 option C (Oyin approved Oct 16, 2026): the chat history store
  // starts in the workspace layout; AppShell only warms the two history
  // requests after sign-in, and reads the flag from lib/chappi/history-flag
  // (importing conversation-history for it put that whole module back on
  // /auth, ~1.3 KB gzip, measured).
  it('AppShell warms chat history without the history store', () => {
    const imports = staticImports('components/app/AppShell.tsx');
    for (const heavy of [
      '@/components/chappi/ChappiHistoryBridge',
      '@/stores/useChappiHistoryStore',
      '@/lib/chappi/conversation-history',
    ]) {
      expect(imports).not.toContain(heavy);
    }
    expect(imports).toContain('@/lib/chappi/history-warm');
    expect(staticImports('lib/chappi/history-warm.ts')).not.toContain('@/stores/useChappiHistoryStore');
    expect(staticImports('components/app/WorkspaceFrame.tsx')).toContain('@/components/chappi/ChappiHistoryBridge');
    // auth-store wipes the browser copy on sign-out through the key-only module.
    const authImports = staticImports('lib/auth-store.ts');
    expect(authImports).not.toContain('@/lib/chappi/conversation-cache');
    expect(authImports).toContain('@/lib/chappi/conversation-cache-clear');
  });
});

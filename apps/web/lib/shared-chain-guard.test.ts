import { readFileSync } from 'node:fs';
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
});

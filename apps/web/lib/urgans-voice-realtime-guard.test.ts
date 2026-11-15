import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guard on Talk to UrgAns (the urgans-voice-guard.test.ts pattern).
// It scans the real route files, so a NEW voice route that breaks a rule fails too.
//
//  1. Every voice route is dark when the flag is off: it opens with
//     openVoiceGate, which checks the flag before auth.
//  2. A voice call ACTS only through the typed UrgAns handler. No voice route
//     runs a tool, reads the tool registry or calls a model for chat itself.
//  3. A minute is charged in one place (settleVoiceMinutes, from the server
//     module), and no voice route touches the ledger.

const ROUTES_DIR = join(process.cwd(), 'app/api/urgans/voice');
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const routeFiles = readdirSync(ROUTES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(ROUTES_DIR, entry.name, 'route.ts'));
const routes = new Map(routeFiles.map((file) => [relative(ROUTES_DIR, file).split(sep).join('/'), strip(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))]));
const shared = strip(readFileSync(join(ROUTES_DIR, '_shared.ts'), 'utf8').replace(/\r\n/g, '\n'));
const server = strip(readFileSync(join(process.cwd(), 'lib/urgans-voice-realtime-server.ts'), 'utf8').replace(/\r\n/g, '\n'));

describe('the voice routes', () => {
  it('are the six the spec and the cascade need', () => {
    expect([...routes.keys()].sort()).toEqual(
      ['end/route.ts', 'hear/route.ts', 'session/route.ts', 'speak/route.ts', 'tick/route.ts', 'tool/route.ts'].sort()
    );
  });

  it('each open with the voice gate, which checks the flag before auth', () => {
    for (const [file, source] of routes) {
      const handler = source.slice(source.search(/export async function POST/));
      expect(handler, file).toMatch(/^export async function POST\(request: NextRequest\) \{\s*const gate = await openVoiceGate\(request\);/);
    }
    const flagAt = shared.search(/voiceFlagOff\(\);/);
    const authAt = shared.search(/requireUrgansAccess\(request\)/);
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(authAt);
    expect(shared).toMatch(/isUrgansRealtimeEnabled\(\)/);
    expect(shared).toMatch(/error:\s*'Not found\.'/);
  });

  it('never run a tool, read the registry or call a chat model themselves', () => {
    for (const [file, source] of routes) {
      expect(source, file).not.toMatch(/executeToolCall|getChappiTool|runChappiAgent|closeConfirmedAction|chat\/completions/);
      expect(source, file).not.toMatch(/@\/lib\/chappi\/(dispatch|runner|tools)/);
    }
    expect(routes.get('tool/route.ts')).toMatch(/import \{ POST as runUrgansTurn \} from '@\/app\/api\/urgans\/route'/);
  });

  it('take a confirmed action only from the stored proposal, never from the request', () => {
    const tool = routes.get('tool/route.ts') ?? '';
    expect(tool).toMatch(/confirmedAction:\s*\{\s*toolName:\s*pending\.toolName,\s*args:\s*pending\.args\s*\}/);
    expect(tool).toMatch(/const pending = session\.pending_action;/);
    expect(tool).not.toMatch(/body\.confirmedAction|body\.toolName|body\.args/);
  });

  it('never touch the credit ledger, and charge minutes only through the server module', () => {
    for (const [file, source] of routes) {
      expect(source, file).not.toMatch(/credit_ledger|settleTurn|settleVoiceMinutes/);
    }
    expect(server).toMatch(/settleVoiceMinutes\(/);
  });
});

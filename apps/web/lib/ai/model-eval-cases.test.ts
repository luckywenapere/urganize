import { describe, expect, it } from 'vitest';

import { CHAPPI_TOOLS } from '@/lib/chappi/tools';
import { ROLE } from '@/lib/chappi/system-prompt';

import { EVAL_TODAY, TOOL_CASES, buildEvalSystemPrompt } from './model-eval-cases';
import { classifyChatTurn } from './model-router';

// The evaluation is only worth running if its cases can still be passed. These
// keep every name in them honest against the tool registry as it is today, so a
// renamed tool fails a normal test run instead of quietly scoring every model
// wrong on a case that no longer has a right answer.

const registry = new Map(CHAPPI_TOOLS.map((tool) => [tool.name as string, tool]));

const propertiesOf = (name: string): string[] => {
  const schema = (registry.get(name) as unknown as { inputSchema?: { properties?: Record<string, unknown> } })
    ?.inputSchema;
  return Object.keys(schema?.properties ?? {});
};

describe('the evaluation cases', () => {
  it('have unique, readable ids and a real prompt each', () => {
    const ids = TOOL_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const testCase of TOOL_CASES) {
      expect(testCase.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(testCase.prompt.trim().length).toBeGreaterThan(5);
      expect(testCase.note.trim().length).toBeGreaterThan(10);
    }
  });

  it('only name tools that exist in the registry', () => {
    const unknown = TOOL_CASES.flatMap((testCase) =>
      [...testCase.expect.tools, ...(testCase.expect.requireArgs ? [testCase.expect.requireArgs.tool] : [])]
        .filter((name) => !registry.has(name))
        .map((name) => `${testCase.id}: ${name}`)
    );
    expect(unknown).toEqual([]);
  });

  it('only require argument keys the tool really takes, and only of a tool the case accepts', () => {
    for (const testCase of TOOL_CASES) {
      const required = testCase.expect.requireArgs;
      if (!required) continue;
      expect(testCase.expect.tools, `${testCase.id} requires args of a tool it does not accept`).toContain(required.tool);
      const known = propertiesOf(required.tool);
      for (const key of required.keys) {
        expect(known, `${testCase.id}: ${required.tool} has no argument called ${key}`).toContain(key);
      }
    }
  });

  it('can be passed, and cannot be passed by anything', () => {
    for (const testCase of TOOL_CASES) {
      // A case with no accepted tool and no way to answer in words has no right answer.
      expect(testCase.expect.tools.length > 0 || testCase.expect.allowNone === true, testCase.id).toBe(true);
      // A case that accepts most of the registry measures nothing.
      expect(testCase.expect.tools.length, testCase.id).toBeLessThanOrEqual(6);
    }
  });

  it('test restraint as well as action', () => {
    const restraint = TOOL_CASES.filter((testCase) => testCase.expect.tools.length === 0);
    const acting = TOOL_CASES.filter((testCase) =>
      testCase.expect.tools.some((name) => (registry.get(name) as unknown as { kind?: string })?.kind === 'mutate')
    );
    const reading = TOOL_CASES.filter(
      (testCase) =>
        testCase.expect.tools.length > 0 &&
        testCase.expect.tools.every((name) => (registry.get(name) as unknown as { kind?: string })?.kind === 'read')
    );
    expect(restraint.length).toBeGreaterThanOrEqual(3);
    expect(acting.length).toBeGreaterThanOrEqual(5);
    expect(reading.length).toBeGreaterThanOrEqual(5);
  });

  it('reach across the product rather than one corner of it', () => {
    const named = new Set(TOOL_CASES.flatMap((testCase) => testCase.expect.tools));
    expect(named.size).toBeGreaterThanOrEqual(20);
  });

  it('are spread across the rungs the router would start them on, so the evaluation can tell the rungs apart', () => {
    const tiers = TOOL_CASES.map((testCase) => classifyChatTurn({ lastUserText: testCase.prompt, userTurns: 1 }).tier);
    expect(new Set(tiers).size).toBeGreaterThanOrEqual(3);
    // The long pasted request is the case for the long-input rule; it must not start on the cheapest rung.
    const longCase = TOOL_CASES.find((testCase) => testCase.id === 'label-feedback-to-tasks');
    expect(longCase).toBeDefined();
    expect(classifyChatTurn({ lastUserText: longCase!.prompt, userTurns: 1 }).tier).not.toBe('quick');
  });
});

describe('the evaluation system prompt', () => {
  const prompt = buildEvalSystemPrompt();

  it("is UrgAns's real instructions followed by a workspace snapshot in the real format", () => {
    expect(prompt.startsWith(ROLE)).toBe(true);
    expect(prompt).toContain('Current rollouts (3):');
    expect(prompt).toContain('Midnight EP');
    expect(prompt).toContain('Lagos Nights');
    expect(prompt).toContain('Overdue');
    expect(prompt).toContain('Brief the cover artist');
    expect(prompt).toContain(EVAL_TODAY);
  });

  it('is as heavy as a real one, since cost and caching are part of what the evaluation measures', () => {
    expect(prompt.length).toBeGreaterThan(15_000);
    expect(prompt.length).toBeLessThan(40_000);
  });

  it('is the same every time, so runs can be compared', () => {
    expect(buildEvalSystemPrompt()).toBe(prompt);
  });
});

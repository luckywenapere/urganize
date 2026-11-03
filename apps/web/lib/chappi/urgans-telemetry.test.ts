import { beforeEach, describe, expect, it, vi } from 'vitest';

const crumbs: Array<{ category: string; message: string; data?: Record<string, unknown> }> = [];
const reports: Array<{ error: Error; context?: Record<string, string> }> = [];

vi.mock('@/lib/monitoring/report', () => ({
  addMonitoringBreadcrumb: (crumb: (typeof crumbs)[number]) => crumbs.push(crumb),
  reportErrorToMonitoring: (error: Error, context?: Record<string, string>) => reports.push({ error, context }),
}));

import { startUrgansTelemetry } from './urgans-telemetry';

describe('AI telemetry', () => {
  beforeEach(() => {
    crumbs.length = 0;
    reports.length = 0;
  });

  it('leaves sent, response, first byte and done, with timings and no content', () => {
    let t = 1000;
    const telemetry = startUrgansTelemetry(() => t);
    telemetry.sent({ streamed: true, scoped: true, attachments: false });
    t = 1300;
    telemetry.response(200, true);
    t = 1450;
    telemetry.firstByte();
    telemetry.firstByte();
    t = 4000;
    telemetry.done('agent');
    expect(crumbs.map((crumb) => crumb.message)).toEqual(['request sent', 'response headers', 'first byte', 'done']);
    expect(crumbs[2].data).toEqual({ ms: 450 });
    expect(crumbs[3].data).toEqual({ mode: 'agent', ms: 3000, firstByte: true });
    expect(reports).toEqual([]);
  });

  it('a dropped reply leaves an error crumb and one tagged report, only once', () => {
    const telemetry = startUrgansTelemetry(() => 0);
    telemetry.sent({ streamed: true, scoped: false, attachments: false });
    telemetry.failed('stream_dropped', { status: 200, reachedServer: true });
    telemetry.failed('unexpected', { reachedServer: true, error: new TypeError('x') });
    telemetry.done('agent');
    expect(reports).toHaveLength(1);
    expect(reports[0].error.name).toBe('UrgansReplyDropped');
    expect(reports[0].context).toMatchObject({ feature: 'urgans', stage: 'stream_dropped', status: '200', reached_server: 'true' });
    expect(crumbs.filter((crumb) => crumb.message === 'error')).toHaveLength(1);
    expect(crumbs.some((crumb) => crumb.message === 'done')).toBe(false);
  });

  it('carries only an error class name, never its message', () => {
    const telemetry = startUrgansTelemetry(() => 0);
    telemetry.failed('network', { reachedServer: false, error: new TypeError('secret prompt text') });
    const data = crumbs[0].data!;
    expect(data.error).toBe('TypeError');
    expect(JSON.stringify(crumbs)).not.toContain('secret');
    expect(JSON.stringify(reports.map((r) => [r.error.message, r.context]))).not.toContain('secret');
  });
});

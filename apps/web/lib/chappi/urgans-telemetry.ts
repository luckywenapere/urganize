// Breadcrumbs around one UrgAns turn (POST /api/urgans), so a reply that never
// arrives leaves a trail in Sentry: request sent, first byte, done, or where it
// failed. Content-free on purpose: no message text, no release titles, no
// names, no tokens. Only the stage, the HTTP status, timings and an error's
// class name travel.

import { addMonitoringBreadcrumb, reportErrorToMonitoring } from '@/lib/monitoring/report';

export type UrgansFailureStage = 'before_send' | 'network' | 'stream_dropped' | 'bad_response' | 'unexpected';

const CATEGORY = 'urgans';

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = String((error as { name?: unknown }).name || '').slice(0, 40);
    if (/^[A-Za-z]+$/.test(name)) return name;
  }
  return 'unknown';
}

export function startUrgansTelemetry(now: () => number = () => Date.now()) {
  let sentAt = 0;
  let sawFirstByte = false;
  let finished = false;
  const elapsed = () => (sentAt ? Math.max(0, now() - sentAt) : 0);

  return {
    sent(details: { streamed: boolean; scoped: boolean; attachments: boolean }) {
      sentAt = now();
      addMonitoringBreadcrumb({ category: CATEGORY, message: 'request sent', data: { ...details } });
    },
    response(status: number, streamed: boolean) {
      addMonitoringBreadcrumb({
        category: CATEGORY,
        message: 'response headers',
        level: status >= 400 ? 'warning' : 'info',
        data: { status, streamed, ms: elapsed() },
      });
    },
    firstByte() {
      if (sawFirstByte) return;
      sawFirstByte = true;
      addMonitoringBreadcrumb({ category: CATEGORY, message: 'first byte', data: { ms: elapsed() } });
    },
    done(mode: string) {
      if (finished) return;
      finished = true;
      addMonitoringBreadcrumb({
        category: CATEGORY,
        message: 'done',
        data: { mode: String(mode || 'unknown').slice(0, 20), ms: elapsed(), firstByte: sawFirstByte },
      });
    },
    /** The turn ended without a reply. Leaves a breadcrumb and reports one event
     *  to Sentry, tagged, so dropped replies can be counted and read. */
    failed(stage: UrgansFailureStage, details: { status?: number; error?: unknown; reachedServer: boolean }) {
      if (finished) return;
      finished = true;
      const data = {
        stage,
        status: details.status ?? null,
        error: details.error === undefined ? null : errorName(details.error),
        reachedServer: details.reachedServer,
        online: typeof navigator === 'undefined' ? null : navigator.onLine !== false,
        firstByte: sawFirstByte,
        ms: elapsed(),
      };
      addMonitoringBreadcrumb({ category: CATEGORY, message: 'error', level: 'error', data });
      const event = new Error(`AI reply dropped (${stage})`);
      event.name = 'UrgansReplyDropped';
      reportErrorToMonitoring(event, {
        feature: 'urgans',
        stage,
        status: String(data.status ?? 'none'),
        reached_server: String(details.reachedServer),
        online: String(data.online),
      });
    },
  };
}

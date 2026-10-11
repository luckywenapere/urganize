// A local stand-in for the search vendor, for the rehearsal and the opt-in
// evaluation's dry run. It listens on 127.0.0.1 on a free port, answers each request
// with whatever the test's `reply` says for that call number, and records what it
// was sent (path, headers, body) so a test can check where the key went.
//
// Test support only: nothing in the app imports it.

import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeExaReply = { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number };

export type FakeExaRequest = { method: string; path: string; headers: IncomingHttpHeaders; body: string };

export type FakeExa = { url: string; requests: FakeExaRequest[]; close: () => Promise<void> };

export async function startFakeExa(reply: (call: number, request: FakeExaRequest) => FakeExaReply): Promise<FakeExa> {
  const requests: FakeExaRequest[] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const request: FakeExaRequest = { method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      requests.push(request);
      const answer = reply(requests.length, request);
      const send = () => {
        if (res.destroyed) return;
        res.writeHead(answer.status, { 'content-type': 'application/json', ...(answer.headers ?? {}) });
        res.end(answer.body === undefined ? '' : typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
      };
      if (answer.delayMs && answer.delayMs > 0) setTimeout(send, answer.delayMs);
      else send();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/search`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

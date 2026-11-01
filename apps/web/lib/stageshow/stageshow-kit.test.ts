import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Bar, Stage, Window, type Act } from '@urganize/stageshow';

// Smoke test for the Stageshow kit package (#979). The animated mocks load it
// with next/dynamic and ssr: false, but a server render must still not throw,
// and a scripted stage must render its poster on the server (the script only
// runs in the browser, after mount).

type S = { done: boolean };

function scene(script?: (a: Act<S>) => Promise<void>) {
  return createElement(Stage<S>, {
    width: 480,
    height: 300,
    initial: { done: false },
    poster: { done: true },
    script,
    cursor: { at: 'go' },
    children: (s: S) =>
      createElement(
        Window,
        { title: 'Release plan' },
        createElement('button', { 'data-target': 'go' }, s.done ? 'Delivered' : 'Deliver'),
        createElement(Bar, { w: 120 }),
      ),
  });
}

describe('@urganize/stageshow', () => {
  it('server-renders a still stage with its window', () => {
    const html = renderToString(scene());
    expect(html).toContain('Release plan');
    expect(html).toContain('data-target="go"');
  });

  it('server-renders a scripted stage without running the script', () => {
    let ran = false;
    const html = renderToString(
      scene(async (a) => {
        ran = true;
        await a.click('go');
      }),
    );
    expect(ran).toBe(false);
    expect(html).toContain('Release plan');
  });
});

// A tiny recorder for the standard `Server-Timing` response header, so a slow
// route can say WHERE its time went without a profiler or a redeploy with
// console.time calls. The browser shows it in the network panel and
// `PerformanceResourceTiming.serverTiming` exposes it to page code.
//
// Only step names and millisecond durations ever go in the header. It is
// readable by anyone who can read the response, so a label must never carry
// an id, an email or anything else about the data being loaded.

export type Timings = {
  /** Runs `work`, records how long it took under `name`, and returns its result. */
  time: <T>(name: string, work: () => Promise<T>) => Promise<T>;
  /** The header value, e.g. `access;dur=412.3, tasks;dur=1820.1`. */
  header: () => string;
};

export function createTimings(): Timings {
  const entries: Array<{ name: string; ms: number }> = [];
  return {
    async time(name, work) {
      const start = performance.now();
      try {
        return await work();
      } finally {
        entries.push({ name, ms: performance.now() - start });
      }
    },
    header() {
      return entries.map((entry) => `${entry.name};dur=${entry.ms.toFixed(1)}`).join(', ');
    },
  };
}

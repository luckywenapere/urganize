import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// localhost, NOT 127.0.0.1: Next 16's dev server blocks dev assets requested
// from another origin ("Blocked cross-origin request to Next.js dev resource"),
// so against `next dev` the page never hydrates and every check that needs
// React times out. A production server has no such block.
const baseUrl = process.env.WAITLIST_SMOKE_URL ?? "http://localhost:3000";
// WHAT THIS CHECKS (rewritten 2026-10-10). It used to wait for a hero sentence
// ("runs to plan.") and click a "Not ready yet? Join the waitlist" disclosure,
// and neither exists on the homepage any more: the h1 is the founder's short
// line, and since 2026-10-07 the waitlist form is open on the page (the
// disclosure component is no longer mounted anywhere). So the script now does
// what a visitor does, at a desktop and at a phone size:
//   1. tap the header's "Join waitlist" and land on the form's headline, not
//      behind the fixed header (the 2026-10-09 anchor fix);
//   2. type an email, press "Join now", and reach step 2 (name and phone).
// It stops before submitting, because POST /api/signup needs the waitlist
// database and a smoke test must not add rows to it.
//
// The hero text is matched lower-cased on the founder's short line (the h1
// since 2026-10-17, and the footer tagline), so a copy pass that rewords
// one sentence does not break the test. If the positioning line ever changes,
// change this string with it.
const heroText = "every release, on plan";
const smokeEmail = "smoke-test@example.com";
const viewports = [
  { label: "desktop 1280x900", width: 1280, height: 900, mobile: false },
  { label: "phone 390x844", width: 390, height: 844, mobile: true },
];
// A cold `next dev` compiles each route on first request, so a slow first run
// can need longer: WAITLIST_SMOKE_TIMEOUT_MS=30000.
const waitTimeoutMs = Number(process.env.WAITLIST_SMOKE_TIMEOUT_MS) || 10_000;
const strictConsole = process.env.WAITLIST_SMOKE_STRICT_CONSOLE === "1";

function fail(message) {
  throw new Error(`Waitlist smoke test failed: ${message}`);
}

function findOnPath(command) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean) ?? null;
}

function findBrowserPath() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  const fixedCandidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [];

  const pathCandidates =
    process.platform === "win32"
      ? ["chrome.exe", "msedge.exe"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge"];

  return (
    fixedCandidates.find((candidate) => existsSync(candidate)) ??
    pathCandidates.map(findOnPath).find(Boolean) ??
    null
  );
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not reserve a local debugging port."));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    fail(`${url} returned HTTP ${response.status}`);
  }

  return response.json();
}

async function waitForChrome(port) {
  let lastError;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find(
        (target) => target.type === "page" && target.webSocketDebuggerUrl,
      );

      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(100);
  }

  throw lastError ?? new Error("Chrome did not expose a page target.");
}

function parseWebSocketData(data) {
  if (typeof data === "string") {
    return JSON.parse(data);
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(data).toString("utf8"));
  }

  return JSON.parse(Buffer.from(data).toString("utf8"));
}

function formatRuntimeException(exceptionDetails = {}) {
  const exception = exceptionDetails.exception;
  const message =
    exception?.description ??
    exception?.value ??
    exceptionDetails.text ??
    "Runtime exception";
  const location =
    exceptionDetails.url && typeof exceptionDetails.lineNumber === "number"
      ? ` (${exceptionDetails.url}:${exceptionDetails.lineNumber + 1})`
      : "";

  return `${message}${location}`;
}

function createCdpClient(webSocketUrl) {
  if (typeof WebSocket !== "function") {
    fail("Node.js WebSocket is unavailable. Run this script with Node 22+.");
  }

  const webSocket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const runtimeExceptions = [];

  const opened = new Promise((resolve, reject) => {
    webSocket.addEventListener("open", resolve, { once: true });
    webSocket.addEventListener("error", reject, { once: true });
  });

  webSocket.addEventListener("message", (event) => {
    const message = parseWebSocketData(event.data);

    if (message.method === "Runtime.exceptionThrown") {
      runtimeExceptions.push(formatRuntimeException(message.params?.exceptionDetails));
      return;
    }

    if (!message.id) {
      return;
    }

    const request = pending.get(message.id);
    if (!request) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      request.reject(new Error(JSON.stringify(message.error)));
    } else {
      request.resolve(message.result);
    }
  });

  function send(method, params = {}) {
    const id = ++nextId;

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      webSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      fail(JSON.stringify(result.exceptionDetails));
    }

    return result.result.value;
  }

  async function waitFor(expression, label) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < waitTimeoutMs) {
      const value = await evaluate(expression);

      if (value) {
        return value;
      }

      await sleep(100);
    }

    fail(`timed out waiting for ${label}`);
  }

  async function clickExpression(expression, label) {
    const rect = await evaluate(expression);

    if (!rect) {
      fail(`could not find ${label}`);
    }

    if (rect.covered) {
      fail(`${label} was covered by ${rect.coveredBy ?? "an unknown element"}`);
    }

    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: rect.x,
      y: rect.y,
      button: "left",
    });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: rect.x,
      y: rect.y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: rect.x,
      y: rect.y,
      button: "left",
      clickCount: 1,
    });
  }

  return {
    opened,
    send,
    evaluate,
    waitFor,
    clickExpression,
    close() {
      webSocket.close();
    },
    assertNoRuntimeExceptions() {
      if (runtimeExceptions.length === 0) {
        return;
      }

      if (strictConsole) {
        fail(`browser runtime exceptions: ${runtimeExceptions.join("; ")}`);
      }

      console.warn(
        `WARN: browser runtime exceptions were observed while testing ${baseUrl}. ` +
          "Set WAITLIST_SMOKE_STRICT_CONSOLE=1 to fail on these.",
      );
      runtimeExceptions.length = 0;
    },
  };
}

async function navigateAndWait(client) {
  await client.send("Page.navigate", { url: baseUrl });
  await client.waitFor(
    `document.readyState === "complete" && document.body.innerText.toLowerCase().includes(${JSON.stringify(heroText)})`,
    "homepage content",
  );
  await client.waitFor(
    `!document.querySelector("[data-nextjs-dialog], .nextjs-portal, .vite-error-overlay, #webpack-dev-server-client-overlay")`,
    "absence of framework error overlays",
  );
}

// Finds an element, scrolls it to the middle of the screen, and reports where
// to click plus whether something else is on top of that point. A control that
// is covered (a fixed header, an overlay) is a real bug for a visitor, so the
// click helper fails on it rather than clicking through.
function clickTargetExpression(findExpression) {
  return `(() => {
    const el = ${findExpression};
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    const covered = !(top && (top === el || el.contains(top)));
    return { x, y, covered, coveredBy: covered ? (top?.tagName ?? null) : null };
  })()`;
}

// The headline of the waitlist block sits fully on screen and below the fixed
// header. The block slides up about 20px as it is revealed, so this is checked
// again after that settles.
const headlineVisibleExpression = `(() => {
  const block = document.getElementById("waitlist");
  // h1 since 2026-10-17 (URG-334): #waitlist is the hero form, whose heading
  // is the page's h1. h2 is kept as the fallback for an older build.
  const heading = block && (block.querySelector("h1") || block.querySelector("h2"));
  const header = document.querySelector("header");
  if (!heading || !header) return false;
  const rect = heading.getBoundingClientRect();
  return (
    location.hash === "#waitlist" &&
    rect.top >= header.getBoundingClientRect().bottom &&
    rect.bottom <= window.innerHeight
  );
})()`;

async function assertTrialCtaLandsOnHeadline(client, label) {
  await client.clickExpression(
    clickTargetExpression(`document.querySelector('header a[data-location="header"]')`),
    `${label}: header "Join waitlist"`,
  );
  await client.waitFor(headlineVisibleExpression, `${label}: waitlist headline in view after the tap`);
  await sleep(900);
  if (!(await client.evaluate(headlineVisibleExpression))) {
    fail(`${label}: the waitlist headline ended up hidden behind the header or off screen`);
  }
  console.log(`PASS: ${label}: "Join waitlist" lands on the waitlist headline.`);
}

async function assertFormReachesStepTwo(client, label) {
  const emailInput = `document.querySelector('#waitlist input[type="email"]')`;
  await client.waitFor(`Boolean(${emailInput})`, `${label}: waitlist email field`);
  // Wait for React to take over the form. Pressing "Join now" before that
  // submits the page natively and reloads it, which looks like a flaky test.
  await client.waitFor(
    `(() => { const el = ${emailInput}; return Boolean(el) && Object.keys(el).some((key) => key.startsWith("__reactFiber")); })()`,
    `${label}: the form to hydrate`,
  );
  await client.evaluate(`${emailInput}.focus()`);
  await client.send("Input.insertText", { text: smokeEmail });
  await client.clickExpression(
    clickTargetExpression(
      `[...document.querySelectorAll('#waitlist button')].find((item) => ["Join now", "Join the waitlist"].includes(item.innerText.trim()))`,
    ),
    `${label}: "Join now"`,
  );
  await client.waitFor(
    `Boolean(document.querySelector('#waitlist input[type="tel"]'))`,
    `${label}: step 2 (name and phone) after "Join now"`,
  );
  await client.assertNoRuntimeExceptions();
  console.log(`PASS: ${label}: the form takes an email and reaches step 2.`);
}

async function main() {
  const browserPath = findBrowserPath();

  if (!browserPath) {
    fail("Chrome, Edge, or Chromium was not found. Set CHROME_PATH to your browser executable.");
  }

  const port = await getOpenPort();
  const tempRoot = path.resolve(os.tmpdir());
  const userDataDir = path.join(tempRoot, `urganize-waitlist-smoke-${Date.now()}`);
  const chrome = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ]);

  let client;

  try {
    const webSocketUrl = await waitForChrome(port);
    client = createCdpClient(webSocketUrl);
    await client.opened;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    for (const viewport of viewports) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });

      // Each check starts from a fresh load, so a #waitlist hash left by the
      // first cannot make the second look like it passed.
      await navigateAndWait(client);
      await assertTrialCtaLandsOnHeadline(client, viewport.label);
      await navigateAndWait(client);
      await assertFormReachesStepTwo(client, viewport.label);
    }
  } finally {
    client?.close();
    chrome.kill();

    const resolvedUserDataDir = path.resolve(userDataDir);

    if (resolvedUserDataDir.startsWith(`${tempRoot}${path.sep}`)) {
      await sleep(200);
      await rm(resolvedUserDataDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

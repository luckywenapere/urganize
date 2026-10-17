// Product screenshots for the marketing site, retaken in one command.
//
// The house rule (ThemedProductShot.tsx, WorkspaceShotSection.tsx, CLAUDE.md)
// is that every marketing screenshot shows the CURRENT app, light and dark
// retaken together. That rule was kept by hand until 2026-09-02, which is how
// the homepage sat on an Aug 1 capture while the product moved to v1.18. This
// script makes the retake one command, so the rule costs nothing to keep.
//
//   pnpm --filter @urganize/homepage shots                 capture every shot
//   pnpm --filter @urganize/homepage shots -- --only=catalog,timeline
//   pnpm --filter @urganize/homepage shots -- --mode=seed  seed the demo team (one-off)
//   pnpm --filter @urganize/homepage shots -- --mode=all   seed, then capture
//
// Flags: --base=https://app.urganize.app  --release=<id>  --epk=<token>
//        --hero-title="Golden Hour"  --login-timeout=900000
//        --anonymise="Real Name=Dami Okafor"  (swap the signed-in person's
//        display name for a fictional one in every capture)
//
// How it works: the same raw-CDP driver of the installed, signed Chrome that
// scripts/smoke-waitlist.mjs uses (spawn Chrome with a remote-debugging port,
// talk to it over Node's native WebSocket), but HEADED with a throwaway
// profile so a person can sign in — Supabase sessions live in localStorage,
// so cookie import cannot log a headless browser in, and the app must never
// see a founder's real Chrome profile. Every shot: set the device metrics
// BEFORE navigating (the app's viewport hooks resolve at mount), write the
// theme key the app reads pre-paint, navigate, wait for a stable hook, hide
// the two prompt cards, capture, flip the theme in place exactly the way
// lib/theme.ts's applyTheme does, capture again. Same DOM, same scroll, same
// open panel in both files — which is what lets the pair swap cleanly under
// the site's theme toggle.
//
// Seeding runs from the signed-in page context through the app's own API
// with the browser's own session: the access token is read from localStorage
// INSIDE the page and never returned to this process. Nothing here touches
// the database directly, so every seeded row goes through the same routes,
// caps and validation a real manager's would.
//
// Output: public/images/product/<name>.png + <name>-dark.png (palette PNGs,
// desktop 1920 wide, phone 780 wide, each ≤ ~150 KB) and a generated
// content/product-shots.ts manifest whose dimensions are read back from the
// written files — so a component that spreads an entry can never disagree
// with the PNG it renders (the 970-vs-973 bug class this replaces).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// sharp ships with Next; it resolves from the workspace root's node_modules.
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const OUT_DIR = path.join(appRoot, "public", "images", "product");
const MANIFEST = path.join(appRoot, "content", "product-shots.ts");
const CONTEXT_FILE = path.join(os.tmpdir(), "urganize-shots-context.json");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return match ? [match[1], match[2] ?? "true"] : [arg, "true"];
  }),
);
const MODE = args.mode ?? "capture";
const BASE = (args.base ?? "https://app.urganize.app").replace(/\/$/, "");
const LOGIN_TIMEOUT_MS = Number(args["login-timeout"] ?? 15 * 60 * 1000);
const ONLY = args.only ? new Set(args.only.split(",").map((s) => s.trim())) : null;

// ---------------------------------------------------------------------------
// The demo team. Fictional artists and titles: no real client data may appear
// on the marketing site. Dates are weeks from today so the catalog always
// reads as live work; `done` is the share of activities to tick off (0 to 1),
// in due-date order, so the Motion bars differ from card to card. It was a
// count until 2026-10-17, when plans got shorter and the counts ticked off
// whole plans.
// ---------------------------------------------------------------------------
const DEMO_TEAM = {
  name: "Northline Music",
  artists: ["Ayo Kanmi", "Zainab Oyelaran", "The Harbour Lights"],
  teammates: ["tunde@example.com", "amara@example.com"],
  releases: [
    { title: "Golden Hour", artist: "Ayo Kanmi", type: "single", weeksOut: 6, done: 0.55, ready: ["master", "artwork"], goal: "playlist_adds", budget: "under_100k", colour: "#14643A" },
    { title: "Night Bus", artist: "Ayo Kanmi", type: "single", weeksOut: 13, done: 0.15, ready: ["master"], goal: "new_listeners", budget: "none", colour: "#1D3A7A" },
    { title: "Iyawo Mi", artist: "Zainab Oyelaran", type: "single", weeksOut: 3, done: 0.75, ready: ["master", "artwork", "distributor"], goal: "fan_moment", budget: "100k_500k", colour: "#7A1D3A" },
    { title: "Blue Season", artist: "Zainab Oyelaran", type: "ep", weeksOut: 11, done: 0.4, ready: ["master", "artwork"], goal: "press", budget: "100k_500k", colour: "#5B1D7A" },
    { title: "Salt and Signal", artist: "The Harbour Lights", type: "album", weeksOut: 18, done: 0.1, ready: ["none"], goal: "new_listeners", budget: "over_500k", colour: "#7A3E1D" },
    { title: "Weekend Weather", artist: "The Harbour Lights", type: "single", weeksOut: 1, done: 0.9, ready: ["master", "artwork", "visualizer", "distributor"], goal: "catalog", budget: "none", colour: "#3A5B1D" },
  ],
};

// ---------------------------------------------------------------------------
// The shot list. `$ID`, `$EPK` and `$HERO_TITLE` come from the seed context or
// the --release / --epk / --hero-title flags. `legacy` writes a second copy
// under the filename older pages already import, so /features, /brand and the
// persona pages get the current UI with zero code changes.
// ---------------------------------------------------------------------------
// Hidden in every shot: the two prompt cards that appear a minute into a
// session, and the Admin entry the identity card shows an operator account
// (ADMIN_EMAILS) — real customers never see it, so the marketing site must
// not either.
const PROMPT_CARDS = ['[aria-labelledby="install-prompt-title"]', '[aria-labelledby="push-prompt-title"]', 'a[href="/admin"]', 'nav a[href^="/dashboard?release="]'];
// Buckets default to collapsed; open every live one so activity rows exist
// (a release weeks out has empty Overdue and Due today buckets). Done stays
// shut: a list of struck-through rows says nothing about the work ahead. Run
// twice with a beat between — the first click can land before the panel has
// hydrated its persisted bucket state.
const OPEN_BUCKETS_EXPRESSION = "[...document.querySelectorAll('aside button[aria-expanded=\"false\"][aria-controls]')].filter((b) => !/^Done/.test(b.innerText.trim())).forEach((b) => b.click()); true";
const OPEN_BUCKETS = [
  { type: "eval", expression: OPEN_BUCKETS_EXPRESSION },
  { type: "settle", ms: 700 },
  { type: "eval", expression: OPEN_BUCKETS_EXPRESSION },
  { type: "settle", ms: 400 },
];

// The trial's credits banner across the top of the app belongs to the demo
// account, not to the product, and the activity's Chat block is a cut surface
// (release chat, 2026-10): neither belongs on the marketing site.
const HIDE_CREDITS_BANNER = { type: "eval", expression: "[...document.querySelectorAll('div')].filter((e) => /credits left/.test(e.innerText) && e.innerText.length < 160).forEach((e) => e.style.setProperty('display', 'none', 'important')); true" };
const HIDE_ACTIVITY_CHAT = { type: "eval", expression: "[...document.querySelectorAll('section[aria-label=\"Activity detail\"] h3')].filter((h) => h.innerText.trim() === 'Chat').forEach((h) => h.parentElement.style.setProperty('display', 'none', 'important')); true" };
// A rollout opens on its full-screen timeline; the scoped-release shot wants
// the rollout page around it (the plan UrgAns built, the phases).
const EXIT_FULL_SCREEN = { type: "eval", expression: "(() => { const b = [...document.querySelectorAll('button')].find((el) => /Exit full screen/.test(el.innerText)); if (b) b.click(); return Boolean(b); })()" };

const SHOTS = [
  // The rollout list has no search box since the 2026-10 redesign, so wait for
  // the hero release's title instead.
  { name: "catalog", legacy: "workspace-releases", viewport: "desktop", url: "/dashboard", waitFor: { text: "$HERO_TITLE" }, actions: [{ type: "settle", ms: 800 }, HIDE_CREDITS_BANNER] },
  { name: "catalog-phone", viewport: "phone", url: "/dashboard", waitFor: { text: "$HERO_TITLE" }, actions: [{ type: "settle", ms: 800 }, HIDE_CREDITS_BANNER] },
  {
    name: "scoped-release", legacy: "workspace-tasks", viewport: "desktop", url: "/dashboard?release=$ID",
    waitFor: { text: "$HERO_TITLE" },
    actions: [{ type: "wait", selector: '[data-ph-capture-attribute-section="tasks"]' }, { type: "settle", ms: 800 }, EXIT_FULL_SCREEN, { type: "settle", ms: 1200 }, HIDE_CREDITS_BANNER, { type: "settle", ms: 400 }],
  },
  {
    name: "activity-detail", viewport: "desktop", url: "/dashboard?release=$ID",
    waitFor: { selector: "aside button[aria-expanded][aria-controls]" },
    actions: [
      ...OPEN_BUCKETS,
      { type: "wait", selector: '[data-ph-capture-attribute-section="tasks"]' },
      { type: "click", selector: '[data-ph-capture-attribute-section="tasks"]', nth: 1 },
      { type: "wait", selector: 'section[aria-label="Activity detail"]' },
      { type: "settle", ms: 700 },
      HIDE_ACTIVITY_CHAT,
      HIDE_CREDITS_BANNER,
      { type: "settle", ms: 300 },
    ],
  },
  {
    name: "timeline", viewport: "desktop", url: "/dashboard?release=$ID&scene=timeline",
    waitFor: { selector: ".tl-scene-container" },
    // Phases start collapsed; open the two with live work so the axis shows
    // activities as markers and bars, not four summary strips.
    actions: [
      { type: "settle", ms: 600 },
      { type: "eval", expression: "[...document.querySelectorAll('.tl-scene-container button')].filter((b) => /^(Pre-release|Release week)/.test(b.innerText.trim())).forEach((b) => b.click()); true" },
      { type: "settle", ms: 700 },
      HIDE_CREDITS_BANNER,
    ],
  },
  {
    // The roster has its own page since the 2026-10 redesign.
    name: "artists-roster", viewport: "desktop", url: "/dashboard/artists",
    waitFor: { text: "Ayo Kanmi" },
    actions: [{ type: "settle", ms: 700 }, HIDE_CREDITS_BANNER],
  },
  // The public press kit needs no session and is dark-locked, so one capture
  // serves both themes. Shot BEFORE the UrgAns page: that page holds a typed
  // draft after its shot, and navigating away from it is the one place a
  // beforeunload prompt could stall the run.
  { name: "epk-phone", viewport: "phone", url: "/epk/$EPK", themes: ["dark"], waitFor: { text: "Press kit", timeoutMs: 60_000 }, rail: "keep" },
  {
    name: "urgans-confirmation", viewport: "desktop", url: "/dashboard/urgans", rail: "keep",
    waitFor: { selector: '[aria-label="Message UrgAns"]' },
    // Two turns that mirror the section copy exactly: one thing it just does
    // (completing an activity is not gated) and one it must ask about first
    // (deleting a release is). The model answers the deletion by asking for
    // confirmation in prose before it ever proposes the gated tool, so the
    // card is not guaranteed — the wait for it is optional, and the
    // conversation without it still shows the assistant asking first.
    actions: [
      // Two nudges sit on a fresh account (invite your team, tell UrgAns about
      // the team); dismiss them so the conversation is the whole picture.
      { type: "eval", expression: "for (const sel of ['[aria-label=\"Dismiss invite banner\"]', '[role=\"status\"] [aria-label=\"Dismiss\"]']) document.querySelector(sel)?.click(); true" },
      { type: "settle", ms: 400 },
      { type: "type", selector: '[aria-label="Message UrgAns"]', text: "Mark the cover art activity done for $HERO_TITLE" },
      { type: "settle", ms: 500 },
      { type: "click", selector: '[aria-label="Send"]' },
      { type: "settle", ms: 30_000 },
      { type: "type", selector: '[aria-label="Message UrgAns"]', text: "Delete the release $HERO_TITLE" },
      { type: "settle", ms: 500 },
      { type: "click", selector: '[aria-label="Send"]' },
      { type: "wait", selector: '[aria-label="Confirm this action"]', timeoutMs: 60_000, optional: true },
      { type: "settle", ms: 800 },
      { type: "log", selector: "main", label: "urgans transcript", chars: 900 },
    ],
    // Never leave a live deletion proposal behind: Cancel the card afterwards.
    after: [{ type: "clickText", within: '[aria-label="Confirm this action"]', text: "Cancel" }],
  },
];

// ---------------------------------------------------------------------------
// Chrome + CDP plumbing (the smoke-waitlist.mjs pattern).
// ---------------------------------------------------------------------------
function findOnPath(command) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], { encoding: "utf8", shell: false });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? null;
}

function findBrowserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const fixed = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : [];
  const onPath = process.platform === "win32" ? ["chrome.exe", "msedge.exe"] : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  return fixed.find((c) => existsSync(c)) ?? onPath.map(findOnPath).find(Boolean) ?? null;
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") return reject(new Error("Could not reserve a debugging port."));
        resolve(address.port);
      });
    });
  });
}

async function waitForChrome(port) {
  let lastError;
  // A cold profile on a slow disk can take well over ten seconds to bind the
  // port, so wait up to 45s before giving up.
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Chrome never answered on the debugging port ${port} (${lastError?.cause?.code ?? lastError?.message ?? "no page target"}).`);
}

function createCdpClient(webSocketUrl) {
  if (typeof WebSocket !== "function") throw new Error("Node 22+ is required (native WebSocket).");
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));
    if (message.method === "Page.javascriptDialogOpening") {
      console.warn(`[chrome] dialog: ${message.params?.message ?? ""} (accepted)`);
      socket.send(JSON.stringify({ id: ++nextId, method: "Page.handleJavaScriptDialog", params: { accept: true } }));
      return;
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  // A command Chrome never answers (a page wedged behind a dialog, a target
  // that went away) must fail the shot, not hang the run: 60s per command.
  function send(method, params = {}, timeoutMs = 60_000) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "evaluate failed";
      throw new Error(text);
    }
    return result.result.value;
  }
  async function waitFor(expression, label, timeoutMs = 20_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = await evaluate(expression).catch(() => false);
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${label}`);
  }
  return { opened, send, evaluate, waitFor, close: () => socket.close() };
}

// ---------------------------------------------------------------------------
// Page-side helper. Installed once per page load; the session token is read
// from localStorage INSIDE the page and used only there.
// ---------------------------------------------------------------------------
const PAGE_API = `
window.__urg = window.__urg || {
  token() {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      let raw = localStorage.getItem(key) || "";
      if (raw.startsWith("base64-")) raw = atob(raw.slice(7));
      try { const json = JSON.parse(raw); return json.access_token || (json.currentSession && json.currentSession.access_token) || ""; } catch { return ""; }
    }
    return "";
  },
  async api(method, url, body) {
    const headers = { Authorization: "Bearer " + this.token() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json = null;
    try { json = await response.json(); } catch {}
    return { status: response.status, json };
  },
  async putBytes(url, base64, mime) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": mime }, body: bytes });
    return response.status;
  },
};
true;`;

function makeApi(client) {
  return async function api(method, url, body, { allow = [] } = {}) {
    const result = await client.evaluate(`__urg.api(${JSON.stringify(method)}, ${JSON.stringify(url)}, ${body === undefined ? "undefined" : JSON.stringify(body)})`);
    if (!result || (result.status >= 400 && !allow.includes(result.status))) {
      throw new Error(`${method} ${url} → ${result?.status} ${JSON.stringify(result?.json ?? null).slice(0, 240)}`);
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// Seeding.
// ---------------------------------------------------------------------------
function ymdWeeksOut(weeks) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function escapeXml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function coverArtPng(title, artist, colour) {
  // Plain generated artwork: a flat colour, a soft circle, the title and the
  // artist. No stock photos, no rights to clear.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400">
  <rect width="1400" height="1400" fill="${colour}"/>
  <circle cx="1010" cy="430" r="330" fill="#F5F0E6" fill-opacity="0.14"/>
  <circle cx="1130" cy="330" r="150" fill="#F5F0E6" fill-opacity="0.10"/>
  <text x="96" y="1150" font-family="Georgia, 'Times New Roman', serif" font-size="140" font-weight="600" fill="#F5F0E6">${escapeXml(title)}</text>
  <text x="98" y="1250" font-family="Arial, Helvetica, sans-serif" font-size="52" letter-spacing="10" fill="#F5F0E6" fill-opacity="0.82">${escapeXml(artist.toUpperCase())}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

function collectStrings(value, predicate, found = new Set()) {
  if (typeof value === "string") {
    if (predicate(value)) found.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, predicate, found));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, predicate, found));
  }
  return found;
}

async function seed(client) {
  const api = makeApi(client);
  const log = (...parts) => console.log("[seed]", ...parts);

  log("renaming the team");
  await api("PATCH", "/api/workspace", { name: DEMO_TEAM.name }, { allow: [403] });

  log("artists");
  let artists = (await api("GET", "/api/workspace/artists")).json?.artists ?? [];
  for (const name of DEMO_TEAM.artists) {
    if (artists.some((a) => a.name === name)) continue;
    await api("POST", "/api/workspace/artists", { name });
    log(" +", name);
  }
  artists = (await api("GET", "/api/workspace/artists")).json?.artists ?? [];
  const artistId = (name) => artists.find((a) => a.name === name)?.id;

  log("releases");
  let releases = (await api("GET", "/api/releases")).json?.releases ?? [];
  const seeded = [];
  for (const plan of DEMO_TEAM.releases) {
    let release = releases.find((r) => r.title === plan.title);
    if (!release) {
      const created = await api("POST", "/api/releases", {
        title: plan.title,
        artistId: artistId(plan.artist),
        artistName: plan.artist,
        releaseDate: ymdWeeksOut(plan.weeksOut),
        releaseType: plan.type,
        plan: "template",
      });
      const id = created.json?.releaseId ?? created.json?.release?.id;
      if (!id) throw new Error(`release ${plan.title}: no id in ${JSON.stringify(created.json).slice(0, 200)}`);
      release = { id, title: plan.title };
      log(" +", plan.title, id);
    }
    seeded.push({ ...plan, id: release.id });
  }
  releases = (await api("GET", "/api/releases")).json?.releases ?? [];

  for (const plan of seeded) {
    let tasks = (await api("GET", `/api/tasks?release=${plan.id}`)).json?.tasks ?? [];
    if (tasks.length === 0) {
      // A new release has no activities until its plan is built: POST the
      // intake answers to /plan and the plan lands straight in activities.
      // (Until 2026-10 this was /plan/generate then /plan/approve; both are
      // gone.)
      log(" plan:", plan.title, "(build from intake)");
      await api("POST", `/api/releases/${plan.id}/plan`, {
        intake: {
          version: 2,
          release_type: plan.type,
          artist_name: plan.artist,
          date_mode: "fixed",
          release_date: ymdWeeksOut(plan.weeksOut),
          ready_today: plan.ready,
          goal: plan.goal,
          budget: plan.budget,
        },
      });
      tasks = (await api("GET", `/api/tasks?release=${plan.id}`)).json?.tasks ?? [];
    }
    // Tick off the earliest share of the plan and reopen anything later, so a
    // re-run lands on the same picture whatever state the team was left in.
    const byDue = [...tasks].sort((a, b) => String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? "")));
    const target = Math.round(tasks.length * plan.done);
    let changed = 0;
    for (const [index, task] of byDue.entries()) {
      const want = index < target ? "done" : "todo";
      if ((task.status === "done") === (want === "done")) continue;
      await api("PATCH", `/api/tasks/${task.id}`, { status: want }, { allow: [400, 409] });
      changed += 1;
    }
    log(` ${plan.title}: ${tasks.length} activities, ${target} done (${changed} changed)`);
  }

  log("cover art");
  for (const plan of seeded) {
    const current = releases.find((r) => r.id === plan.id);
    if (current?.coverArtUrl && !/logo/.test(String(current.coverArtUrl))) continue;
    const png = await coverArtPng(plan.title, plan.artist, plan.colour);
    const fileName = `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-cover.png`;
    const signed = await api("POST", `/api/releases/${plan.id}/cover-art/upload-url`, { file_name: fileName, mime_type: "image/png", file_size: png.length });
    const { upload_url, storage_path } = signed.json ?? {};
    if (!upload_url || !storage_path) throw new Error(`cover art: no upload url for ${plan.title}`);
    const status = await client.evaluate(`__urg.putBytes(${JSON.stringify(upload_url)}, ${JSON.stringify(png.toString("base64"))}, "image/png")`);
    if (status >= 400) throw new Error(`cover art upload for ${plan.title} → ${status}`);
    await api("POST", `/api/releases/${plan.id}/cover-art`, { storage_path, file_name: fileName, mime_type: "image/png", file_size: png.length, width: 1400, height: 1400 });
    log(" +", fileName);
  }

  log("teammates");
  const members = await api("GET", "/api/workspace/members", undefined, { allow: [404] });
  const knownEmails = collectStrings(members.json, (s) => /@/.test(s));
  for (const email of DEMO_TEAM.teammates) {
    if ([...knownEmails].some((e) => e.toLowerCase() === email)) continue;
    await api("POST", "/api/workspace/members/invite", { email }, { allow: [409] });
    log(" +", email);
  }

  const hero = seeded[0];
  log("press kit link for", hero.title);
  // The release-scoped press kit was retired for one standing kit per artist
  // (/k/{slug}); with the old route gone (404) the epk-phone shot is skipped.
  let epk = (await api("GET", `/api/releases/${hero.id}/epk`, undefined, { allow: [404] })).json?.epk ?? null;
  if (!epk) epk = (await api("POST", `/api/releases/${hero.id}/epk`, undefined, { allow: [404, 405] })).json?.epk ?? null;
  const epkToken = epk?.shareToken ?? "";

  const context = { base: BASE, releaseId: hero.id, heroTitle: hero.title, epkToken, releases: seeded.map(({ title, id }) => ({ title, id })) };
  writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
  log("done. context →", CONTEXT_FILE);
  log(`hero release ${hero.id}; press kit ${BASE}/epk/${epkToken}`);
  return context;
}

// ---------------------------------------------------------------------------
// Capture.
// ---------------------------------------------------------------------------
const VIEWPORTS = {
  desktop: { metrics: { width: 1440, height: 730, deviceScaleFactor: 2, mobile: false }, outputWidth: 1920 },
  phone: { metrics: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, outputWidth: 780 },
};
const MAX_BYTES = 150_000;

function fill(template, context) {
  return template
    .replaceAll("$ID", context.releaseId ?? "")
    .replaceAll("$EPK", context.epkToken ?? "")
    .replaceAll("$HERO_TITLE", context.heroTitle ?? "");
}

async function runAction(client, action, context) {
  const selector = action.selector ? JSON.stringify(fill(action.selector, context)) : null;
  switch (action.type) {
    case "eval":
      return client.evaluate(action.expression);
    case "settle":
      return sleep(action.ms ?? 500);
    case "wait": {
      const pending = action.selector
        ? client.waitFor(`Boolean(document.querySelector(${selector}))`, action.selector, action.timeoutMs)
        : action.text
          ? client.waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(fill(action.text, context).toLowerCase())})`, action.text, action.timeoutMs)
          : sleep(action.ms ?? 500);
      if (!action.optional) return pending;
      return pending.catch((error) => console.warn(`[shot] optional wait skipped: ${error.message}`));
    }
    case "log": {
      const text = await client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(action.selector ?? "main")}) || document.body; return el.innerText.slice(0, ${action.chars ?? 600}); })()`);
      console.log(`[shot] ${action.label ?? "page text"}: ${JSON.stringify(text)}`);
      return;
    }
    case "click": {
      const ok = await client.evaluate(`(() => { const els = [...document.querySelectorAll(${selector})]; const el = els[${action.nth ?? 0}]; if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`);
      if (!ok) throw new Error(`nothing to click for ${action.selector}`);
      return;
    }
    case "clickText": {
      const ok = await client.evaluate(`(() => { const scope = document.querySelector(${JSON.stringify(fill(action.within, context))}) || document; const el = [...scope.querySelectorAll("button, a")].find((b) => b.innerText.trim() === ${JSON.stringify(action.text)}); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`no "${action.text}" control inside ${action.within}`);
      return;
    }
    case "type": {
      const ok = await client.evaluate(`(() => {
        const el = document.querySelector(${selector});
        if (!el) return false;
        el.focus();
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(fill(action.text, context))});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`nothing to type into for ${action.selector}`);
      return sleep(400);
    }
    default:
      throw new Error(`unknown action ${action.type}`);
  }
}

async function setTheme(client, mode) {
  await client.evaluate(`(() => { localStorage.setItem("urganize.theme", ${JSON.stringify(mode)}); const root = document.documentElement; root.dataset.theme = ${JSON.stringify(mode)}; root.classList.remove("dark", "light"); root.classList.add(${JSON.stringify(mode)}); return true; })()`);
}

// The account behind the demo team belongs to a real person, and the app
// prints their display name (the assignee on every activity, the greeting on
// the assistant page). --anonymise="Real Name=Dami Okafor" swaps that string
// in every text node before each capture, so the marketing site never shows
// a real name. The UI is untouched; only the identity string changes.
const ANONYMISE = (args.anonymise ?? "").split("=");
async function anonymise(client) {
  if (ANONYMISE.length !== 2 || !ANONYMISE[0]) return;
  await client.evaluate(`(() => {
    const from = ${JSON.stringify(ANONYMISE[0])}, to = ${JSON.stringify(ANONYMISE[1])};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node; let count = 0;
    while ((node = walker.nextNode())) { if (node.nodeValue.includes(from)) { node.nodeValue = node.nodeValue.split(from).join(to); count += 1; } }
    return count;
  })()`);
}

async function hideChrome(client, selectors) {
  await client.evaluate(`(() => { for (const s of ${JSON.stringify(selectors)}) document.querySelectorAll(s).forEach((el) => { el.style.setProperty("display", "none", "important"); }); return true; })()`);
}

async function encodePng(buffer, width) {
  let colours = 256;
  let out;
  for (;;) {
    out = await sharp(buffer)
      .resize({ width, withoutEnlargement: true, kernel: "lanczos3" })
      .png({ palette: true, colours, dither: 1, compressionLevel: 9, effort: 10 })
      .toBuffer();
    if (out.length <= MAX_BYTES || colours <= 64) break;
    colours = colours === 256 ? 192 : colours === 192 ? 128 : 64;
  }
  const meta = await sharp(out).metadata();
  return { out, width: meta.width, height: meta.height };
}

async function captureShot(client, shot, context) {
  const viewport = VIEWPORTS[shot.viewport];
  const themes = shot.themes ?? ["light", "dark"];
  const url = BASE + fill(shot.url, context);

  await client.send("Emulation.setDeviceMetricsOverride", viewport.metrics);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: shot.viewport === "phone", maxTouchPoints: 5 });
  await client.send("Emulation.setScrollbarsHidden", { hidden: true }).catch(() => {});

  // The first theme is written before navigation so the app paints it from
  // the start (its pre-hydration script reads this key).
  await client.evaluate(`localStorage.setItem("urganize.theme", ${JSON.stringify(themes[0])}); true`);
  await client.send("Page.navigate", { url });
  await client.waitFor('document.readyState === "complete"', "load", 30_000);
  if (shot.waitFor?.selector) await client.waitFor(`Boolean(document.querySelector(${JSON.stringify(fill(shot.waitFor.selector, context))}))`, shot.waitFor.selector, shot.waitFor.timeoutMs ?? 30_000);
  if (shot.waitFor?.text) await client.waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(fill(shot.waitFor.text, context).toLowerCase())})`, shot.waitFor.text, shot.waitFor.timeoutMs ?? 30_000);
  // A transient API failure paints "Could not load …" in the workspace; one
  // reload clears it, and a shot of an error banner is worse than no shot.
  if (await client.evaluate(`document.body.innerText.includes("Could not load")`)) {
    console.warn(`[shot] ${shot.name}: workspace reported a load error, reloading once`);
    await client.send("Page.reload", { ignoreCache: false });
    await client.waitFor('document.readyState === "complete"', "reload", 30_000);
    await sleep(1500);
    if (shot.waitFor?.selector) await client.waitFor(`Boolean(document.querySelector(${JSON.stringify(fill(shot.waitFor.selector, context))}))`, shot.waitFor.selector, shot.waitFor.timeoutMs ?? 30_000);
  }
  await client.evaluate("Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)");
  // Every visible image must have actually decoded (complete is also true for
  // a failed load): cover art and avatars are signed Storage URLs that can
  // take a few seconds on a fresh session, and a card with a blank box where
  // the artwork should be is the one thing a catalog screenshot must not show.
  await client.waitFor("[...document.images].filter((img) => img.getBoundingClientRect().width > 0).every((img) => img.complete && img.naturalWidth > 0)", "images", 25_000).catch(() => console.warn("[shot] some images never decoded"));
  if (shot.rail !== "keep" && shot.viewport === "desktop") {
    // The UrgAns side rail arms itself open once per session; the shots want
    // the product, not the assistant, unless they are about the assistant.
    await client.evaluate(`(() => { const b = document.querySelector('[aria-label="Close UrgAns"]'); if (b) b.click(); return true; })()`);
  }
  for (const action of shot.actions ?? []) await runAction(client, action, context);
  await hideChrome(client, [...PROMPT_CARDS, ...(shot.hide ?? [])]);
  await anonymise(client);
  await sleep(800);

  const files = {};
  for (const [index, theme] of themes.entries()) {
    if (index > 0) {
      await setTheme(client, theme);
      await sleep(450); // the app's 250ms colour transitions
      await hideChrome(client, [...PROMPT_CARDS, ...(shot.hide ?? [])]);
      await anonymise(client);
    }
    const { data } = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const { out, width, height } = await encodePng(Buffer.from(data, "base64"), viewport.outputWidth);
    const suffix = theme === "dark" ? "-dark" : "";
    const fileName = `${shot.name}${suffix}.png`;
    writeFileSync(path.join(OUT_DIR, fileName), out);
    if (shot.legacy) writeFileSync(path.join(OUT_DIR, `${shot.legacy}${suffix}.png`), out);
    files[theme] = { fileName, width, height, bytes: out.length };
    console.log(`[shot] ${fileName} ${width}×${height} ${(out.length / 1024).toFixed(0)} KB`);
  }
  for (const action of shot.after ?? []) await runAction(client, action, context).catch((error) => console.warn(`[shot] after-step failed: ${error.message}`));
  return files;
}

async function writeManifest() {
  const entries = [];
  for (const shot of SHOTS) {
    const light = path.join(OUT_DIR, `${shot.name}.png`);
    const dark = path.join(OUT_DIR, `${shot.name}-dark.png`);
    if (!existsSync(light) && !existsSync(dark)) continue;
    const lightFile = existsSync(light) ? light : dark;
    const darkFile = existsSync(dark) ? dark : light;
    const meta = await sharp(lightFile).metadata();
    const key = shot.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    entries.push(`  ${key}: {\n    light: "/images/product/${path.basename(lightFile)}",\n    dark: "/images/product/${path.basename(darkFile)}",\n    width: ${meta.width},\n    height: ${meta.height},\n  },`);
  }
  const source = `// GENERATED by scripts/capture-product-shots.mjs on ${new Date().toISOString().slice(0, 10)}.
// Do not edit by hand: re-run \`pnpm --filter @urganize/homepage shots\`.
// Dimensions are read back from the written PNGs, so a component that spreads
// an entry into ThemedProductShot can never disagree with the file it renders.
// A dark-locked surface (the public press kit) lists the same file for both.

export type ProductShot = {
  light: string;
  dark: string;
  width: number;
  height: number;
};

export const PRODUCT_SHOTS = {
${entries.join("\n")}
} as const satisfies Record<string, ProductShot>;

export type ProductShotName = keyof typeof PRODUCT_SHOTS;
`;
  mkdirSync(path.dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, source);
  console.log(`[manifest] ${path.relative(appRoot, MANIFEST)} (${entries.length} shots)`);
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function readContext() {
  let context = {};
  if (existsSync(CONTEXT_FILE)) {
    try { context = JSON.parse(readFileSync(CONTEXT_FILE, "utf8")); } catch {}
  }
  if (args.release) context.releaseId = args.release;
  if (args.epk) context.epkToken = args.epk;
  if (args["hero-title"]) context.heroTitle = args["hero-title"];
  return context;
}

async function main() {
  const browserPath = findBrowserPath();
  if (!browserPath) throw new Error("Chrome or Edge was not found. Set CHROME_PATH.");
  mkdirSync(OUT_DIR, { recursive: true });

  const port = await getOpenPort();
  const tempRoot = path.resolve(os.tmpdir());
  const userDataDir = path.join(tempRoot, `urganize-shots-${Date.now()}`);
  console.log(`[chrome] ${browserPath} on port ${port}, profile ${userDataDir}`);
  const chrome = spawn(browserPath, [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=TranslateUI",
    "--window-size=1600,1000",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.on("error", (error) => console.error(`[chrome] failed to start: ${error.message}`));
  chrome.on("exit", (code, signal) => console.error(`[chrome] process exited (code ${code}, signal ${signal})`));
  chrome.stderr.on("data", (chunk) => {
    // Chrome is chatty on stderr; surface only the lines worth reading.
    for (const line of String(chunk).split(/\r?\n/)) {
      if (/DevTools listening|ERROR|FATAL|Failed/.test(line)) console.error(`[chrome] ${line.trim()}`);
    }
  });

  let client;
  let failures = 0;
  try {
    client = createCdpClient(await waitForChrome(port));
    await client.opened;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    await client.send("Page.navigate", { url: `${BASE}/auth` });
    console.log("\nA Chrome window is open at the sign-in page. Sign in to the DEMO account (email + password).");
    console.log("Waiting for the app to land on /dashboard …\n");
    // Sign-in lands on /dashboard/home since the Home tab shipped, so any
    // /dashboard path counts as signed in.
    await client.waitFor(`location.pathname === "/dashboard" || location.pathname.startsWith("/dashboard/")`, "sign-in", LOGIN_TIMEOUT_MS);
    await sleep(1500);
    await client.evaluate(PAGE_API);

    let context = readContext();
    if (MODE === "seed" || MODE === "all") {
      context = { ...context, ...(await seed(client)) };
    }
    if (MODE === "capture" || MODE === "all") {
      if (!context.releaseId) {
        // Fall back to the first release the account has, so a capture run on a
        // team that was seeded by hand still works.
        const api = makeApi(client);
        const first = ((await api("GET", "/api/releases")).json?.releases ?? [])[0];
        if (first) { context.releaseId = first.id; context.heroTitle = first.title; }
      }
      for (const shot of SHOTS) {
        if (ONLY && !ONLY.has(shot.name)) continue;
        if (shot.url.includes("$EPK") && !context.epkToken) { console.warn(`[shot] ${shot.name}: skipped, no --epk token`); continue; }
        try {
          await Promise.race([
            captureShot(client, shot, context),
            sleep(4 * 60 * 1000).then(() => { throw new Error("shot exceeded its 4 minute budget"); }),
          ]);
        } catch (error) {
          failures += 1;
          console.error(`[shot] ${shot.name} FAILED: ${error.message}`);
        }
      }
      await writeManifest();
    }
  } finally {
    client?.close();
    chrome.kill();
    if (path.resolve(userDataDir).startsWith(`${tempRoot}${path.sep}`)) {
      await sleep(500);
      // The profile holds the demo session: it never outlives the run.
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} shot(s) failed.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

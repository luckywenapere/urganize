// The first load must never be a blank or endless-loading screen (2026-11-23,
// #1380).
//
// New people reported that the app "does not load". Production was healthy;
// what was missing is any message when the first load goes wrong. Four ways it
// goes wrong, and what this module does about each:
//
//   1. An engine too old for Next 16 (no Object.hasOwn: iOS before 15.4,
//      Chrome before 93). The framework chunk throws, nothing paints, nothing
//      is said. -> a plain-words "update your browser" notice.
//   2. A page opened before a deploy (a tab kept in a social app's in-app
//      browser) names chunk files the new deployment no longer serves. The
//      script tags 404, React never runs. ChunkRecoveryBridge cannot help: it
//      is itself part of the bundle that failed to load. -> the same bounded
//      reload, from an inline script that needs no bundle.
//   3. Weak data: the bundle is 40 to 60 script tags and some never arrive.
//      -> a watchdog that, after 10 seconds without hydration on the front-door
//      routes, shows "Taking long? Retry" and a way to open the link elsewhere.
//   4. A signed-out visitor on /dashboard downloads the whole workspace to be
//      bounced to /auth. -> if nothing says they ever signed in, leave before
//      the bundle is fetched.
//
// This is a STRING that runs in <head> before React (app/layout.tsx), the same
// shape as the theme probe in lib/appearance.ts, because a decision that has to
// work when the bundle did not arrive cannot live in the bundle. It is plain
// ES5 on purpose: the browsers it exists for cannot parse anything newer.
// cold-load.test.ts runs it against a fake browser, including the budget rule
// it shares with lib/chunk-recovery.ts.
//
// Hydration is signalled by components/app/HydrationBeacon.tsx, which sets
// data-hydrated on <html> and removes the bar. Nothing here is ever a trap: the
// bar has a Retry that reloads and never reloads by itself more than the shared
// budget allows.

import { LEGACY_APP_HOSTS } from './app-hosts';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_MAX_ATTEMPTS,
  CHUNK_RELOAD_STORAGE_KEY,
} from './chunk-recovery';

/** How long a front-door page may go without hydrating before the bar shows. */
export const COLD_LOAD_WATCHDOG_MS = 10_000;

/** Attribute on <html> once React has hydrated. The watchdog reads it. */
export const HYDRATED_ATTRIBUTE = 'data-hydrated';

/** The bar's element id, so the beacon can take it down. */
export const COLD_LOAD_BAR_ID = 'urg-cold-load-bar';

/** Pages where a stuck load is worth a bar: the front doors, /dashboard's
 *  skeleton and the curator invite. The sign-in callback and handoff are
 *  machine steps with their own states and are left alone. */
export const COLD_LOAD_WATCHDOG_PATHS =
  '^/(auth(?!/(callback|handoff)(/|$))|onboarding|invite|join|dashboard|curator/join)(/|$)';

/** The workspace routes that need a signed-in person. */
export const SIGNED_IN_ONLY_PATHS = '^/(dashboard|settings)(/|$)';

const COPY = {
  oldTitle: 'Your browser is too old to open Urganize.',
  oldBody: 'Update it, or open this link in Chrome or Safari.',
  slowBody: 'Urganize is taking long to open. Check your connection, then tap Retry.',
  failedBody: 'Part of Urganize did not load.',
  hint: 'In Instagram, WhatsApp or Facebook? Tap the menu and choose Open in browser.',
  retry: 'Retry',
  copy: 'Copy link',
  copied: 'Link copied',
} as const;

export const COLD_LOAD_BOOT_SCRIPT = `
(function () {
  var w = window, d = document, root = d.documentElement;
  var BAR_ID = ${JSON.stringify(COLD_LOAD_BAR_ID)};
  var HYDRATED = ${JSON.stringify(HYDRATED_ATTRIBUTE)};
  var COPY = ${JSON.stringify(COPY)};
  var path = '';
  try { path = w.location.pathname; } catch (e) { return; }

  function hydrated() { return root.hasAttribute(HYDRATED); }

  // 0. A form tapped before React is running. The front doors are server
  // rendered, so the form is on screen seconds before its handlers exist; on a
  // slow phone link people type and tap in that gap, the browser submits the
  // form itself, the page reloads as /auth? and the email is gone (#1388).
  // Until hydration, swallow the submit of any form with no action of its own
  // (every React-handled form), and mark <html> so CSS can show a waiting state
  // (data-js is also what keeps that state away from visitors with no JS).
  try {
    root.setAttribute('data-js', '1');
    d.addEventListener('submit', function (e) {
      try {
        if (hydrated()) return;
        var f = e.target;
        if (f && f.tagName === 'FORM' && !f.getAttribute('action')) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch (x) {}
    }, true);
  } catch (e) {}

  function make(tag, css, text) {
    var n = d.createElement(tag);
    if (css) n.style.cssText = css;
    if (text) n.appendChild(d.createTextNode(text));
    return n;
  }

  function button(label, onclick) {
    var b = make('button', 'font:inherit;font-weight:600;margin:6px 8px 0 0;padding:10px 16px;border-radius:8px;border:1px solid #6b6b70;background:#f4f4f2;color:#0c0c0d;cursor:pointer;', label);
    b.setAttribute('type', 'button');
    b.onclick = onclick;
    return b;
  }

  function copyLink(btn) {
    var href = w.location.href;
    var done = function () { btn.firstChild.nodeValue = COPY.copied; };
    try {
      if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) {
        w.navigator.clipboard.writeText(href).then(done, function () {});
        return;
      }
    } catch (e) {}
    try {
      var t = make('textarea', 'position:fixed;opacity:0;');
      t.value = href;
      d.body.appendChild(t);
      t.select();
      d.execCommand('copy');
      d.body.removeChild(t);
      done();
    } catch (e) {}
  }

  // kind: 'old' (a full-screen notice, nothing else will ever run),
  //       'slow' / 'failed' (a bar along the bottom that React takes down).
  function showBar(kind) {
    try {
      if (d.getElementById(BAR_ID)) return;
      var full = kind === 'old';
      var bar = make('div', full
        ? 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#0c0c0d;color:#f4f4f2;font:16px/1.5 -apple-system,system-ui,sans-serif;'
        : 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));background:#0c0c0d;color:#f4f4f2;font:15px/1.45 -apple-system,system-ui,sans-serif;box-shadow:0 -4px 24px rgba(0,0,0,.4);');
      bar.id = BAR_ID;
      bar.setAttribute('role', full ? 'alert' : 'status');
      var box = make('div', full ? 'max-width:420px;' : '');
      if (full) box.appendChild(make('p', 'margin:0 0 8px;font-size:20px;font-weight:700;', COPY.oldTitle));
      box.appendChild(make('p', 'margin:0 0 4px;', full ? COPY.oldBody : (kind === 'failed' ? COPY.failedBody + ' ' : COPY.slowBody)));
      box.appendChild(make('p', 'margin:0 0 8px;font-size:13px;color:#a8a8ad;word-break:break-all;', COPY.hint));
      if (!full) box.appendChild(button(COPY.retry, function () { w.location.reload(); }));
      var cp = button(COPY.copy, function () { copyLink(cp); });
      box.appendChild(cp);
      bar.appendChild(box);
      root.appendChild(bar);
    } catch (e) {}
  }

  // 1. An engine Next 16 cannot run on. Checked first: on such a browser
  // nothing below can be relied on, and nothing else will ever paint.
  try {
    var ok = !!(Object.hasOwn && w.fetch && w.Promise && w.URL && w.Symbol && w.Map);
    if (!ok) {
      var onReady = function () { showBar('old'); };
      if (d.body) onReady(); else d.addEventListener('DOMContentLoaded', onReady);
      return;
    }
  } catch (e) { return; }

  // 2. A signed-out visitor on a workspace route: leave before the bundle.
  // Only when nothing at all says this browser ever signed in. The session
  // lives in localStorage (sb-<ref>-auth-token), and the auth store keeps a
  // flag (urganize-auth); either one present means "let the app decide".
  try {
    var legacy = ${JSON.stringify(LEGACY_APP_HOSTS)};
    var l = w.location;
    var native = !!w.__URGANIZE_NATIVE__ || (w.navigator.userAgent || '').indexOf('UrganizeApp/') !== -1;
    var inFlight = /(^|[#&?])(access_token|code|error|error_description|token_hash)=/.test(l.hash + l.search);
    if (new RegExp(${JSON.stringify(SIGNED_IN_ONLY_PATHS)}).test(path) && legacy.indexOf(l.hostname) < 0 && !native && !inFlight) {
      var signedIn = false;
      var store = w.localStorage;
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (k && /^sb-.*-auth-token/.test(k)) { signedIn = true; break; }
      }
      if (!signedIn) {
        // The shared sign-in cookie, set on the other address (music or team).
        var cookies = (d.cookie || '').split(';');
        for (var c = 0; c < cookies.length; c++) {
          var cname = cookies[c].split('=')[0].replace(/ /g, '');
          if (/^sb-.*-auth-token[.]0$/.test(cname)) { signedIn = true; break; }
        }
      }
      if (!signedIn) {
        var raw = store.getItem('urganize-auth');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.state && parsed.state.isAuthenticated === true) signedIn = true;
        }
      }
      if (!signedIn) { l.replace('/auth'); return; }
    }
  } catch (e) { /* storage blocked or odd: let the app decide */ }

  // 3. A page that names chunks the live deployment no longer serves. The
  // budget is the one lib/chunk-recovery.ts keeps (same key, same cooldown,
  // same ceiling), so this and ChunkRecoveryBridge cannot add up to a loop.
  var KEY = ${JSON.stringify(CHUNK_RELOAD_STORAGE_KEY)};
  var COOLDOWN = ${CHUNK_RELOAD_COOLDOWN_MS};
  var MAX = ${CHUNK_RELOAD_MAX_ATTEMPTS};
  var recovering = false;
  function recover() {
    if (recovering || hydrated()) return;
    recovering = true;
    var rec = { at: 0, attempts: 0 };
    try {
      var p = JSON.parse(w.sessionStorage.getItem(KEY) || 'null');
      if (p && typeof p.at === 'number' && isFinite(p.at)) rec.at = p.at;
      if (p && typeof p.attempts === 'number' && isFinite(p.attempts)) rec.attempts = Math.max(0, Math.floor(p.attempts));
    } catch (e) {}
    var now = new Date().getTime();
    if (rec.attempts >= MAX || (rec.at && now - rec.at < COOLDOWN)) {
      // The budget is spent or a reload just happened and it did not help:
      // say so, never loop.
      showBar('failed');
      return;
    }
    try { w.sessionStorage.setItem(KEY, JSON.stringify({ at: now, attempts: rec.attempts + 1 })); } catch (e) {}
    var go = function () { w.location.reload(); };
    var done = false;
    var once = function () { if (done) return; done = true; go(); };
    try {
      // The offline worker serves stale pages, and the stale copy is the HTML
      // that named the missing chunks: drop it first, bounded.
      if (w.caches && w.caches.keys) {
        w.caches.keys().then(function (names) {
          return Promise.all(names.filter(function (n) { return n.indexOf('urganize-offline-html-') === 0 || n.indexOf('urganize-offline-rsc-') === 0; }).map(function (n) { return w.caches.delete(n); }));
        }).then(once, once);
      }
    } catch (e) {}
    w.setTimeout(once, 1000);
  }
  try {
    w.addEventListener('error', function (e) {
      try {
        var t = e.target, url = '';
        if (t && t !== w && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
          url = t.src || t.href || '';
        } else if (e.filename && /Unexpected token '?<|expected expression, got '?</.test(e.message || '')) {
          // A 404 page served where a script was expected.
          url = e.filename;
        }
        if (url.indexOf('/_next/static/') !== -1) recover();
      } catch (err) {}
    }, true);
  } catch (e) {}

  // 4. The watchdog.
  try {
    if (new RegExp(${JSON.stringify(COLD_LOAD_WATCHDOG_PATHS)}).test(path)) {
      var fire = function () {
        if (hydrated()) return;
        if (d.hidden) { w.setTimeout(fire, 5000); return; }
        showBar('slow');
      };
      w.setTimeout(fire, ${COLD_LOAD_WATCHDOG_MS});
    }
  } catch (e) {}
})();
`;

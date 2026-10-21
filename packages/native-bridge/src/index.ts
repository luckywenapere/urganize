/**
 * The message protocol between the website (apps/web) and the Expo native
 * shell (apps/mobile), which shows that website in a react-native-webview.
 *
 * This package is PURE: no DOM, no React Native, no I/O. Both sides import it
 * so the two halves of one protocol cannot drift apart — the reason it is a
 * package rather than a file copied into each app. Tests live in
 * apps/web/lib/native-bridge.test.ts, because that is where vitest runs.
 *
 * Three channels, and each exists for a different reason:
 *
 *  1. SHELL INFO, synchronous. The shell sets `window.__URGANIZE_NATIVE__`
 *     before any page script runs (injectedJavaScriptBeforeContentLoaded), so
 *     code that reads the platform during render — the iOS billing gates, for
 *     one — gets the right answer on the first paint. An async handshake would
 *     flash the wrong UI.
 *  2. REQUESTS, page -> native, each answered once. The page posts
 *     `{ v, id, type, payload }`; the shell replies with a response carrying
 *     the same id.
 *  3. EVENTS, native -> page, unsolicited (a tapped notification, a rotated
 *     push token). They carry no id.
 *
 * Capabilities rather than a version number: a shell advertises the request
 * types it understands, so a page asking an older shell for something it
 * cannot do gets a plain "unsupported" instead of a timeout.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/** Global the shell sets before the page loads. */
export const SHELL_INFO_GLOBAL = '__URGANIZE_NATIVE__';
/** Function the page installs so the shell can deliver responses and events. */
export const RECEIVE_GLOBAL = '__urganizeBridgeReceive';

export type ShellPlatform = 'ios' | 'android';

export type BridgeRequestType =
  | 'ready'
  | 'openExternal'
  | 'oauth'
  | 'push.permission'
  | 'push.request'
  | 'push.register'
  | 'shareFile'
  | 'shareText'
  | 'appearance';

export const BRIDGE_REQUEST_TYPES: readonly BridgeRequestType[] = [
  'ready',
  'openExternal',
  'oauth',
  'push.permission',
  'push.request',
  'push.register',
  'shareFile',
  'shareText',
  'appearance',
];

export type BridgeEventType = 'pushTap' | 'pushToken';

export const BRIDGE_EVENT_TYPES: readonly BridgeEventType[] = ['pushTap', 'pushToken'];

export type PushPermission = 'granted' | 'denied' | 'default';

export type ShareFilePayload =
  | { kind: 'base64'; data: string; fileName: string; mimeType: string; title?: string }
  | { kind: 'text'; data: string; fileName: string; mimeType: string; title?: string };

/** What each request carries, and what its successful answer looks like. */
export interface BridgeRequestMap {
  ready: { payload: Record<string, never>; result: { ok: true } };
  openExternal: { payload: { url: string }; result: { ok: true } };
  oauth: {
    payload: { url: string; redirectPrefix: string };
    result: { outcome: 'success'; redirectUrl: string } | { outcome: 'cancelled' };
  };
  'push.permission': { payload: Record<string, never>; result: { permission: PushPermission } };
  'push.request': { payload: Record<string, never>; result: { permission: PushPermission } };
  'push.register': { payload: Record<string, never>; result: { token: string } };
  shareFile: { payload: ShareFilePayload; result: { outcome: 'shared' | 'cancelled' } };
  /** Plain text to the share sheet, e.g. a message someone can DM. */
  shareText: { payload: { text: string; title?: string }; result: { outcome: 'shared' | 'cancelled' } };
  /** The page's ground colour, so the bars above and below it can match. */
  appearance: { payload: Appearance; result: { ok: true } };
}

export type StatusBarStyle = 'light' | 'dark';

export interface Appearance {
  /** '#rrggbb' */
  background: string;
  /** Light text for a dark ground, dark text for a light one. */
  statusBar: StatusBarStyle;
}

export interface BridgeEventMap {
  pushTap: { url: string };
  pushToken: { token: string };
}

export interface ShellInfo {
  platform: ShellPlatform;
  /** The shell app's own version, e.g. "1.41.0". Informational only. */
  shellVersion: string;
  protocol: number;
  capabilities: BridgeRequestType[];
  /**
   * The colour the native launch screen is painted in, as #rrggbb (shells
   * from v1.157.7). The site's first loading frame paints the same colour so
   * the launch screen hands over to it invisibly. Absent on older shells,
   * whose launch screen is the old ink, #0d120e.
   */
  splashBackground?: string;
  /**
   * The safe-area insets the webview sits inside, in points (shells from
   * v1.157.7). The launch screen centres its mark on the whole screen and the
   * webview is inset, so the site needs these to put its mark in the same
   * spot. Absent on older shells, which leaves the site to estimate them.
   */
  safeAreaInsets?: { top: number; bottom: number };
}

export interface BridgeRequestMessage {
  v: number;
  id: string;
  type: BridgeRequestType;
  payload: unknown;
}

export type BridgeInbound =
  | { kind: 'response'; id: string; ok: true; result: unknown }
  | { kind: 'response'; id: string; ok: false; error: string }
  | { kind: 'event'; event: BridgeEventType; data: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export function isBridgeRequestType(value: unknown): value is BridgeRequestType {
  return typeof value === 'string' && (BRIDGE_REQUEST_TYPES as readonly string[]).includes(value);
}

export function isBridgeEventType(value: unknown): value is BridgeEventType {
  return typeof value === 'string' && (BRIDGE_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Validates whatever sits in the shell-info global. Anything malformed means
 * "not in the shell" — a page that half-believes it is native is worse than
 * one that treats itself as a browser, because the browser paths all work.
 */
export function parseShellInfo(value: unknown): ShellInfo | null {
  if (!isRecord(value)) return null;
  const { platform, shellVersion, protocol, capabilities, splashBackground, safeAreaInsets } = value;
  if (platform !== 'ios' && platform !== 'android') return null;
  if (typeof protocol !== 'number' || !Number.isInteger(protocol) || protocol < 1) return null;
  const caps = Array.isArray(capabilities) ? capabilities.filter(isBridgeRequestType) : [];
  const info: ShellInfo = {
    platform,
    shellVersion: typeof shellVersion === 'string' ? shellVersion : 'unknown',
    protocol,
    capabilities: caps,
  };
  // Both are optional and cosmetic: a malformed value is dropped, never fatal.
  if (typeof splashBackground === 'string' && /^#[0-9a-f]{6}$/i.test(splashBackground)) {
    info.splashBackground = splashBackground.toLowerCase();
  }
  if (
    isRecord(safeAreaInsets) &&
    isInset(safeAreaInsets.top) &&
    isInset(safeAreaInsets.bottom)
  ) {
    info.safeAreaInsets = { top: safeAreaInsets.top, bottom: safeAreaInsets.bottom };
  }
  return info;
}

const isInset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 200;

/**
 * The token the shell appends to its webview's user agent
 * (applicationNameForUserAgent). It is NOT how the website detects the shell —
 * the injected description is, because it also carries the capabilities. It
 * exists for the one question that has to be right before that description is
 * guaranteed to have arrived: "is this a phone BROWSER we should point at the
 * app?" On Android the description is injected as the page starts loading,
 * which is not strictly before its first script, and the answer to that
 * question must never be yes inside the app itself.
 */
export const SHELL_USER_AGENT_TOKEN = 'UrganizeApp';

export function buildShellUserAgentSuffix(shellVersion: string): string {
  return `${SHELL_USER_AGENT_TOKEN}/${shellVersion}`;
}

export function hasShellUserAgent(userAgent: string | undefined | null): boolean {
  return typeof userAgent === 'string' && userAgent.includes(`${SHELL_USER_AGENT_TOKEN}/`);
}

/** The script the shell injects before content loads. */
export function buildShellInfoScript(info: ShellInfo): string {
  // JSON.stringify output is a valid JS expression; the trailing `true;` is
  // what react-native-webview expects an injected script to end with.
  return `window.${SHELL_INFO_GLOBAL} = ${JSON.stringify(info)}; true;`;
}

export function encodeRequest(id: string, type: BridgeRequestType, payload: unknown): string {
  const message: BridgeRequestMessage = { v: BRIDGE_PROTOCOL_VERSION, id, type, payload: payload ?? {} };
  return JSON.stringify(message);
}

/** Parses a page -> native message. Returns null for anything that is not ours. */
export function decodeRequest(raw: unknown): BridgeRequestMessage | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.v !== BRIDGE_PROTOCOL_VERSION) return null;
  if (!isNonEmptyString(parsed.id)) return null;
  if (!isBridgeRequestType(parsed.type)) return null;
  return { v: BRIDGE_PROTOCOL_VERSION, id: parsed.id, type: parsed.type, payload: parsed.payload ?? {} };
}

export function encodeResponse(id: string, outcome: { ok: true; result: unknown } | { ok: false; error: string }): string {
  return JSON.stringify(
    outcome.ok
      ? { v: BRIDGE_PROTOCOL_VERSION, kind: 'response', id, ok: true, result: outcome.result }
      : { v: BRIDGE_PROTOCOL_VERSION, kind: 'response', id, ok: false, error: outcome.error }
  );
}

export function encodeEvent<E extends BridgeEventType>(event: E, data: BridgeEventMap[E]): string {
  return JSON.stringify({ v: BRIDGE_PROTOCOL_VERSION, kind: 'event', event, data });
}

/** Parses a native -> page message. Returns null for anything that is not ours. */
export function decodeInbound(raw: unknown): BridgeInbound | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  if (parsed.v !== BRIDGE_PROTOCOL_VERSION) return null;
  if (parsed.kind === 'response') {
    if (!isNonEmptyString(parsed.id)) return null;
    if (parsed.ok === true) return { kind: 'response', id: parsed.id, ok: true, result: parsed.result };
    if (parsed.ok === false) {
      return {
        kind: 'response',
        id: parsed.id,
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'Unknown error',
      };
    }
    return null;
  }
  if (parsed.kind === 'event') {
    if (!isBridgeEventType(parsed.event)) return null;
    return { kind: 'event', event: parsed.event, data: parsed.data };
  }
  return null;
}

/**
 * The script the shell runs to hand a message to the page. The message is
 * JSON-encoded TWICE on purpose: the outer encoding turns it into a JS string
 * literal, so nothing in the payload can break out of the call — including a
 * U+2028 line separator, which JSON permits and older JS engines do not.
 *
 * Each separator becomes its six-character escape (a backslash, the letter
 * u, then 2028 or 2029), which is why the join strings carry a doubled
 * backslash. With a single one the replacement is the raw character again
 * and the whole step does nothing, which is what an earlier draft did.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function buildDeliverScript(encodedMessage: string): string {
  const literal = JSON.stringify(encodedMessage)
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029');
  return `(function(){var f=window.${RECEIVE_GLOBAL};if(typeof f==='function'){f(${literal});}})(); true;`;
}

/**
 * Is this URL one the shell's webview may show itself? Everything else is
 * handed to the system browser. Exact host or a subdomain of urganize.app,
 * https only — the same allowlist the Capacitor shell carried.
 */
export function isFirstPartyUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'urganize.app' || host.endsWith('.urganize.app');
}

/**
 * Rewrites the custom-scheme redirect Supabase sends after Google sign-in
 * (com.urganize.app://auth/callback?next=/x#access_token=...) into the
 * same-origin path the existing /auth/callback page handles. Returns null for
 * anything that does not start with the expected prefix.
 */
export function oauthRedirectToPath(redirectUrl: string, schemePrefix: string): string | null {
  if (!redirectUrl.startsWith(schemePrefix)) return null;
  const rest = redirectUrl.slice(schemePrefix.length).replace(/^\/+/, '');
  return `/${rest}`;
}

// ---------------------------------------------------------------------------
// The shell's side. Lives here rather than in apps/mobile because it is pure
// (it only builds strings and calls the handlers it is given), which puts it
// within reach of the tests in apps/web/lib/native-bridge.test.ts. The shell
// wires `deliver` to WebView.injectJavaScript and supplies the handlers.
// ---------------------------------------------------------------------------

export type BridgeHandlers = {
  [T in Exclude<BridgeRequestType, 'ready'>]: (
    payload: BridgeRequestMap[T]['payload']
  ) => Promise<BridgeRequestMap[T]['result']>;
};

export interface ShellDispatcher {
  /** Feed every WebView onMessage here. */
  onMessage(data: string, fromUrl: string): void;
  /**
   * Send an event to the page. Held until the first page says it is ready —
   * a notification tapped while the app was closed is read before the site
   * has loaded. After that, events go straight out; one sent during a full
   * page reload finds no receiver and is dropped, which the deliver script
   * makes a no-op rather than an error. Deliberately no reset on navigation:
   * the webview reports client-side route changes inconsistently across
   * platforms, and a reset the page never answers would hold events forever.
   */
  emit<E extends BridgeEventType>(event: E, data: BridgeEventMap[E]): void;
}

/**
 * A page colour as #rrggbb, or null when it cannot be read or cannot be seen
 * (fully transparent). Reads the space-separated triplet the site stores its
 * colour tokens in ("13 18 14"), a computed rgb()/rgba() value in either
 * syntax, and #rgb / #rrggbb.
 */
export function cssColorToHex(color: string): string | null {
  const value = String(color).trim().toLowerCase();
  if (!value) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return `#${digits}`;
  }

  const fn = /^rgba?\((.*)\)$/.exec(value);
  const body = fn ? fn[1] : value;
  const parts = body.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = parts.slice(0, 3).map(Number);
  if (channels.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  if (parts.length === 4) {
    const alpha = parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
    if (!Number.isFinite(alpha) || alpha <= 0) return null;
  }
  return `#${channels.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Light status bar text on a dark ground, dark text on a light one. */
export function statusBarStyleFor(hexColor: string): StatusBarStyle {
  const hex = cssColorToHex(hexColor);
  if (!hex) return 'light';
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? 'dark' : 'light';
}

/** The shell side: a well-formed appearance from the page, or null. */
export function parseAppearance(payload: unknown): Appearance | null {
  if (!isRecord(payload)) return null;
  const { background, statusBar } = payload;
  if (typeof background !== 'string' || !/^#[0-9a-f]{6}$/.test(background)) return null;
  if (statusBar !== 'light' && statusBar !== 'dark') return null;
  return { background, statusBar };
}

/**
 * Should a failed load be retried now? Only when the connection has just come
 * BACK (reachability turning true), never merely because it is true. A load
 * that failed while online — the site down, a certificate problem — would
 * otherwise reload in a tight loop. `null`/`undefined` mean "not known yet",
 * which the OS reports briefly on start.
 */
export function shouldRetryAfterReconnect(state: {
  loadFailed: boolean;
  previous: boolean | null | undefined;
  reachable: boolean | null | undefined;
}): boolean {
  return state.loadFailed && state.reachable === true && state.previous !== true;
}

const SHARE_FILE_NAME_LIMIT = 120;

/**
 * A file name from the page, made safe to use as ONE path segment in the
 * shell's cache folder: no separators of either kind, nothing a file system
 * refuses, no control characters, no leading dots (so no hidden file and no
 * way up a folder), and a length cap that keeps the extension, because the
 * share sheet decides what can open the file partly from it.
 */
export function safeShareFileName(name: string): string {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g, '-')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!cleaned) return 'urganize-file';
  if (cleaned.length <= SHARE_FILE_NAME_LIMIT) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, SHARE_FILE_NAME_LIMIT - extension.length) + extension;
}

/**
 * Is this a path on our own site? A notification or a deep link may only move
 * the page within the app. `//host` and `/\host` both read as another site to
 * a URL parser, so a leading slash alone is not enough.
 */
export function isSameOriginPath(url: unknown): url is string {
  if (typeof url !== 'string' || !url.startsWith('/')) return false;
  if (url.startsWith('//') || url.startsWith('/\\')) return false;
  try {
    const base = 'https://app.urganize.app';
    return new URL(url, base).origin === base;
  } catch {
    return false;
  }
}

/** The in-app path a push notification points at, if it carries a safe one. */
export function notificationPath(data: { url?: unknown } | null | undefined): string | null {
  const url = data?.url;
  return isSameOriginPath(url) ? url : null;
}

export function createShellDispatcher(deps: {
  deliver: (script: string) => void;
  handlers: BridgeHandlers;
}): ShellDispatcher {
  let ready = false;
  const queued: string[] = [];

  const send = (encoded: string) => deps.deliver(buildDeliverScript(encoded));

  return {
    onMessage(data, fromUrl) {
      // Only our own pages may drive native code. A page that is not ours can
      // only be here if navigation escaped the allowlist, and then it must not
      // be able to open browsers or read push tokens.
      if (!isFirstPartyUrl(fromUrl)) return;
      const message = decodeRequest(data);
      if (!message) return;

      if (message.type === 'ready') {
        ready = true;
        send(encodeResponse(message.id, { ok: true, result: { ok: true } }));
        while (queued.length) send(queued.shift() as string);
        return;
      }

      // Every advertised type has a handler by type, but this runs on whatever
      // the page sent, so a missing one answers with an error rather than
      // throwing inside the webview's message callback. The handler is called
      // inside the promise chain so a throw before its first await is caught
      // the same way as a rejection.
      const handler = deps.handlers[message.type] as ((payload: unknown) => Promise<unknown>) | undefined;
      if (typeof handler !== 'function') {
        send(
          encodeResponse(message.id, {
            ok: false,
            error: `This version of the Urganize app cannot do "${message.type}".`,
          })
        );
        return;
      }
      Promise.resolve()
        .then(() => handler(message.payload))
        .then((result) => send(encodeResponse(message.id, { ok: true, result })))
        .catch((error: unknown) =>
          send(
            encodeResponse(message.id, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            })
          )
        );
    },
    emit(event, data) {
      const encoded = encodeEvent(event, data);
      if (ready) send(encoded);
      else queued.push(encoded);
    },
  };
}

// ── Android hardware back ───────────────────────────────────────────────────

export type AndroidBackAction = 'go-back' | 'go-home' | 'exit';

/** Where Android back lands. Must equal `HOME_PATH` in apps/web/lib/home-path.ts
 * (a web test holds the two together). */
export const SHELL_HOME_PATH = '/dashboard/home';

/** Pages Android Back sends to Home even when history exists (tab roots and the paywall flow). */
const GO_HOME_EXACT = ['/dashboard/urgans', '/dashboard/artists'];
const GO_HOME_PREFIXES = [
  '/locked',
  '/start-trial',
  '/payment',
  '/auth',
];

/**
 * What the Android back button does, from the page's current URL alone:
 * the settings pop-up is open (?settings=) -> step back once, which closes it;
 * any page but Home -> go to Home; Home -> leave the app. The shell cannot see
 * open sheets or dialogs, so those are covered only through the URL param.
 */
export function decideAndroidBack(url: string | null | undefined, canGoBack = false): AndroidBackAction {
  if (!url) return 'exit';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'exit';
  }
  if (parsed.searchParams.has('settings')) return 'go-back';
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  if (path === SHELL_HOME_PATH) return 'exit';
  // A page below a tab (a rollout, an artist, a person, onboarding's steps)
  // goes back ONE level through the page's own history, which the web app
  // keeps in order (tabs replace, flow exits replace). The tab roots and the
  // paywall flow keep the old answer: Home, which is also where the wall sends
  // you back to, so Back can never reveal the app behind it.
  const staysHome =
    GO_HOME_EXACT.includes(path) || GO_HOME_PREFIXES.some((entry) => path === entry || path.startsWith(entry + '/'));
  if (canGoBack && !staysHome) return 'go-back';
  return 'go-home';
}

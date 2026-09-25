// The website's half of the bridge to the Expo native shell (apps/mobile).
// Every native capability the site uses goes through here — lib/platform.ts,
// lib/external-link.ts, lib/native-push.ts, lib/share-file.ts, the Google
// sign-in branch in lib/auth-store.ts and NativePushBridge. Nothing else in
// apps/web should read the shell globals or post to the webview directly.
//
// The protocol itself (message shapes, encoders, validators) lives in
// @urganize/native-bridge so the native side reads the same definitions.
//
// In a normal browser, and on the server, every export here is inert:
// getNativeShell() is null, isInShell() is false, request() rejects with a
// NotInShellError. That is what keeps web behaviour byte-identical.

import {
  RECEIVE_GLOBAL,
  SHELL_INFO_GLOBAL,
  decodeInbound,
  encodeRequest,
  parseShellInfo,
  type BridgeEventMap,
  type BridgeEventType,
  type BridgeInbound,
  type BridgeRequestMap,
  type BridgeRequestType,
  type ShellInfo,
} from '@urganize/native-bridge';

export type { ShellInfo, BridgeRequestType, BridgeEventType } from '@urganize/native-bridge';

/** Default ceiling on one request. OAuth and push prompts pass their own. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class NotInShellError extends Error {
  constructor() {
    super('Not running inside the Urganize app.');
    this.name = 'NotInShellError';
  }
}

export class UnsupportedRequestError extends Error {
  constructor(type: string) {
    super(`This version of the Urganize app cannot do "${type}".`);
    this.name = 'UnsupportedRequestError';
  }
}

export class BridgeTimeoutError extends Error {
  constructor(type: string) {
    super(`The Urganize app did not answer "${type}" in time.`);
    this.name = 'BridgeTimeoutError';
  }
}

type Listener<E extends BridgeEventType> = (data: BridgeEventMap[E]) => void;

interface Pending {
  type: BridgeRequestType;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface BridgeClientDeps {
  post: (message: string) => void;
  newId?: () => string;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface BridgeClient {
  request<T extends BridgeRequestType>(
    type: T,
    payload: BridgeRequestMap[T]['payload'],
    options?: { timeoutMs?: number }
  ): Promise<BridgeRequestMap[T]['result']>;
  receive(raw: unknown): void;
  subscribe<E extends BridgeEventType>(event: E, listener: Listener<E>): () => void;
  pendingCount(): number;
}

/**
 * The transport-independent core, exported for tests. The singleton below
 * wires it to window.ReactNativeWebView.postMessage.
 */
export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  let counter = 0;
  const newId = deps.newId ?? (() => `r${Date.now().toString(36)}-${(counter += 1)}`);
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
  const pending = new Map<string, Pending>();
  const listeners = new Map<BridgeEventType, Set<(data: unknown) => void>>();

  function handle(message: BridgeInbound): void {
    if (message.kind === 'event') {
      const set = listeners.get(message.event);
      if (!set) return;
      for (const listener of Array.from(set)) {
        try {
          listener(message.data);
        } catch (error) {
          console.error('[native-bridge] event listener threw', error);
        }
      }
      return;
    }
    const entry = pending.get(message.id);
    // An answer to something we are no longer waiting for (it timed out, or
    // the id is not ours) is dropped, never delivered twice.
    if (!entry) return;
    pending.delete(message.id);
    clearTimer(entry.timer);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error));
  }

  return {
    request(type, payload, options) {
      const id = newId();
      const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
      return new Promise((resolve, reject) => {
        const timer = setTimer(() => {
          if (!pending.delete(id)) return;
          reject(new BridgeTimeoutError(type));
        }, timeoutMs);
        pending.set(id, { type, resolve: resolve as (value: unknown) => void, reject, timer });
        try {
          deps.post(encodeRequest(id, type, payload));
        } catch (error) {
          pending.delete(id);
          clearTimer(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    receive(raw) {
      const message = decodeInbound(raw);
      if (message) handle(message);
    },
    subscribe(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      const wrapped = listener as (data: unknown) => void;
      set.add(wrapped);
      return () => {
        set?.delete(wrapped);
      };
    },
    pendingCount() {
      return pending.size;
    },
  };
}

type ShellWindow = Window & {
  [SHELL_INFO_GLOBAL]?: unknown;
  [RECEIVE_GLOBAL]?: (raw: unknown) => void;
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

function shellWindow(): ShellWindow | null {
  if (typeof window === 'undefined') return null;
  return window as ShellWindow;
}

/** The shell's self-description, or null in a browser / on the server. */
export function getNativeShell(): ShellInfo | null {
  const win = shellWindow();
  if (!win) return null;
  // Both halves are required: the injected description AND a way to post back.
  // Either alone means something other than our shell.
  if (typeof win.ReactNativeWebView?.postMessage !== 'function') return null;
  return parseShellInfo(win[SHELL_INFO_GLOBAL]);
}

export function isInShell(): boolean {
  return getNativeShell() !== null;
}

export function shellSupports(type: BridgeRequestType): boolean {
  return getNativeShell()?.capabilities.includes(type) ?? false;
}

/** How long whenInShell keeps checking for a late description, and how often. */
const LATE_DESCRIPTION_WAIT_MS = 3_000;
const LATE_DESCRIPTION_POLL_MS = 50;

/**
 * Runs `callback` once the shell has described itself: at once when it
 * already has, and otherwise by checking again for a few seconds — but only
 * when this page CAN post to a webview host, so it is almost certainly the
 * shell still injecting. On Android the description is injected as the page
 * starts loading rather than strictly before its first script, so code that
 * runs on mount can occasionally get there first. A plain browser has no post
 * channel and sets no timer at all. Returns a cancel function.
 */
export function whenInShell(callback: () => void): () => void {
  if (isInShell()) {
    callback();
    return () => {};
  }
  if (typeof shellWindow()?.ReactNativeWebView?.postMessage !== 'function') return () => {};

  let stopped = false;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (isInShell()) {
      stop();
      callback();
    } else if (Date.now() - startedAt >= LATE_DESCRIPTION_WAIT_MS) {
      stop();
    }
  }, LATE_DESCRIPTION_POLL_MS);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  }
  return stop;
}

let singleton: BridgeClient | null = null;

function getClient(): BridgeClient | null {
  const win = shellWindow();
  if (!win || !isInShell()) return null;
  if (singleton) return singleton;
  const client = createBridgeClient({
    post: (message) => win.ReactNativeWebView?.postMessage(message),
  });
  win[RECEIVE_GLOBAL] = (raw: unknown) => client.receive(raw);
  singleton = client;
  // Tells the shell a receiver is installed, so it can flush anything it held
  // back — a notification tapped while the app was closed arrives before this
  // page had loaded.
  void client.request('ready', {}).catch(() => {});
  return client;
}

/** Asks the shell to do something. Rejects outside the shell, or when this
 * shell build does not advertise the capability. */
export function request<T extends BridgeRequestType>(
  type: T,
  payload: BridgeRequestMap[T]['payload'],
  options?: { timeoutMs?: number }
): Promise<BridgeRequestMap[T]['result']> {
  const client = getClient();
  if (!client) return Promise.reject(new NotInShellError());
  if (!shellSupports(type)) return Promise.reject(new UnsupportedRequestError(type));
  return client.request(type, payload, options);
}

/** Listens for an event from the shell. A no-op outside the shell. */
export function subscribe<E extends BridgeEventType>(event: E, listener: Listener<E>): () => void {
  const client = getClient();
  if (!client) return () => {};
  return client.subscribe(event, listener);
}

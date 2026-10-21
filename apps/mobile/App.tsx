// The whole shell: one webview showing the live web app, plus the native
// work a web page cannot do on its own (see src/bridge.ts). Every web change
// still reaches phones the moment it deploys; this file only changes with a
// store build or an OTA update of the shell itself.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Appearance as RNAppearance,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import Constants from 'expo-constants';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_REQUEST_TYPES,
  buildShellInfoScript,
  buildShellUserAgentSuffix,
  decideAndroidBack,
  SHELL_HOME_PATH,
  isFirstPartyUrl,
  parseAppearance,
  shouldRetryAfterReconnect,
  type Appearance,
} from '@urganize/native-bridge';
import { createNativeBridge } from './src/bridge';
import { INK, PAPER, OfflineScreen } from './src/OfflineScreen';
import { getPushPermission, getPushToken, requestPushPermission, watchPush } from './src/push';
import { shareFile, shareText } from './src/share';

const APP_URL = 'https://app.urganize.app';
const SHELL_VERSION = Constants.expoConfig?.version ?? 'unknown';

// The splash stays up until the first page finishes loading. This is the
// ceiling on that: a page that is still loading after this long is better
// shown loading than hidden behind a logo that looks frozen.
const SPLASH_CEILING_MS = 8000;

// Until the page says otherwise: the brand's ink ground, which is also the
// splash and the site's default theme.
const LAUNCH_IS_LIGHT = RNAppearance.getColorScheme() === 'light';
const LAUNCH_GROUND = LAUNCH_IS_LIGHT ? PAPER : INK;
const DEFAULT_APPEARANCE: Appearance = {
  background: LAUNCH_GROUND,
  statusBar: LAUNCH_IS_LIGHT ? 'dark' : 'light',
};

void SplashScreen.preventAutoHideAsync().catch(() => {});

const SHELL_INFO_SCRIPT = buildShellInfoScript({
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  shellVersion: SHELL_VERSION,
  protocol: BRIDGE_PROTOCOL_VERSION,
  capabilities: [...BRIDGE_REQUEST_TYPES],
  // So the site's first loading frame is the launch screen exactly: the same
  // ground, and the mark on the same spot (the splash centres it on the whole
  // screen; the webview below sits inside the safe area).
  splashBackground: LAUNCH_GROUND,
  safeAreaInsets: initialWindowMetrics
    ? { top: initialWindowMetrics.insets.top, bottom: initialWindowMetrics.insets.bottom }
    : undefined,
});

/** Opens a link that does not belong in the webview. */
async function openOutside(url: string): Promise<void> {
  if (/^https?:/i.test(url)) {
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  // mailto:, tel:, whatsapp: — whatever the phone has an app for.
  await Linking.openURL(url);
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const currentUrlRef = useRef<string | null>(null);
  const splashHiddenRef = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // The page reports its ground colour (NativeAppearanceBridge on the site),
  // so the bars above and below it match in light mode as well as dark.
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const network = useNetworkState();
  const wasReachableRef = useRef(network.isInternetReachable);

  const hideSplash = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_CEILING_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  const bridge = useMemo(
    () =>
      createNativeBridge({
        deliver: (script) => webRef.current?.injectJavaScript(script),
        handlers: {
          openExternal: async ({ url }) => {
            await openOutside(url);
            return { ok: true };
          },
          oauth: async ({ url, redirectPrefix }) => {
            const result = await WebBrowser.openAuthSessionAsync(url, redirectPrefix);
            if (result.type === 'success' && result.url.startsWith(redirectPrefix)) {
              return { outcome: 'success', redirectUrl: result.url };
            }
            return { outcome: 'cancelled' };
          },
          'push.permission': async () => ({ permission: await getPushPermission() }),
          'push.request': async () => ({ permission: await requestPushPermission() }),
          'push.register': async () => ({ token: await getPushToken() }),
          shareFile: async (payload) => ({ outcome: await shareFile(payload) }),
          shareText: async (payload) => ({ outcome: await shareText(payload) }),
          appearance: async (payload) => {
            const next = parseAppearance(payload);
            if (!next) throw new Error('That is not a colour this app can use.');
            setAppearance(next);
            return { ok: true };
          },
        },
      }),
    []
  );

  useEffect(
    () =>
      watchPush({
        onTap: (url) => bridge.emit('pushTap', { url }),
        onToken: (token) => bridge.emit('pushToken', { token }),
      }),
    [bridge]
  );

  // Android's back button: close the settings pop-up if it is open, else go to
  // Home from any other page, else leave the app. Tabs are peers and do not
  // keep history, so walking the webview's history is no longer the rule.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = decideAndroidBack(currentUrlRef.current);
      if (action === 'exit') return false;
      if (action === 'go-back' && canGoBackRef.current) {
        webRef.current?.goBack();
      } else {
        webRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(SHELL_HOME_PATH)}); true;`);
      }
      return true;
    });
    return () => subscription.remove();
  }, []);

  // A failed load retries on its own when the connection COMES BACK — the
  // moment reachability turns true, not whenever it is true. A load that
  // failed while online (the site down, a certificate problem) would
  // otherwise reload in a tight loop.
  useEffect(() => {
    const reachable = network.isInternetReachable;
    const previous = wasReachableRef.current;
    wasReachableRef.current = reachable;
    if (shouldRetryAfterReconnect({ loadFailed, previous, reachable })) {
      setLoadFailed(false);
      webRef.current?.reload();
    }
  }, [loadFailed, network.isInternetReachable]);

  const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
    const { url } = request;
    // Frames inside our own pages (a video embed) load where they are.
    if (request.isTopFrame === false) return true;
    if (url.startsWith('about:')) return true;
    if (isFirstPartyUrl(url)) return true;
    // Anything else — Paystack checkout, a storage file, a wa.me link — goes
    // to the system browser or the app that owns it, never into this webview.
    void openOutside(url).catch(() => {});
    return false;
  }, []);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    canGoBackRef.current = state.canGoBack;
    currentUrlRef.current = state.url;
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      // The page tells us where it is on every message, which keeps back
      // right after in-page route changes the webview did not report.
      if (event.nativeEvent.url) currentUrlRef.current = event.nativeEvent.url;
      bridge.onMessage(event.nativeEvent.data, event.nativeEvent.url);
    },
    [bridge]
  );

  // The OS can kill the page's process to reclaim memory, most often while
  // the app sits in the background. The webview then shows nothing at all
  // until it is reloaded, so reload straight away.
  const reloadAfterCrash = useCallback(() => webRef.current?.reload(), []);

  const retry = useCallback(() => {
    setRetrying(true);
    setLoadFailed(false);
    webRef.current?.reload();
    setTimeout(() => setRetrying(false), 1500);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={appearance.statusBar} />
      <SafeAreaView
        style={[styles.root, { backgroundColor: appearance.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {/* Android draws the app edge to edge, so the keyboard covers the
            page instead of shrinking it, and a message box at the bottom of
            the screen would sit under it. This shrinks the webview by the
            keyboard's height. iOS moves the page itself, so it is Android
            only there. */}
        <KeyboardAvoidingView
          style={[styles.web, { backgroundColor: appearance.background }]}
          behavior={Platform.OS === 'android' ? 'padding' : undefined}
        >
          <WebView
            ref={webRef}
            source={{ uri: APP_URL }}
            // The page's own ground, so a full page load (after sign-in, say)
            // does not flash the other theme's colour before it paints.
            style={[styles.web, { backgroundColor: appearance.background }]}
            containerStyle={[styles.web, { backgroundColor: appearance.background }]}
            originWhitelist={['https://*']}
            // So the page can bring the keyboard up on its own when UrgAns opens.
            // iOS refuses that unless this is false; Android always allows it.
            keyboardDisplayRequiresUserAction={false}
            injectedJavaScriptBeforeContentLoaded={SHELL_INFO_SCRIPT}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={onNavigationStateChange}
            onLoadEnd={hideSplash}
            onError={() => {
              hideSplash();
              setLoadFailed(true);
            }}
            onContentProcessDidTerminate={reloadAfterCrash}
            onRenderProcessGone={reloadAfterCrash}
            applicationNameForUserAgent={buildShellUserAgentSuffix(SHELL_VERSION)}
            sharedCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            allowsInlineMediaPlayback
            allowsBackForwardNavigationGestures={false}
            setSupportMultipleWindows={false}
            contentInsetAdjustmentBehavior="never"
            webviewDebuggingEnabled={__DEV__}
          />
        </KeyboardAvoidingView>
        {loadFailed ? (
          <SafeAreaView style={StyleSheet.absoluteFill}>
            <OfflineScreen onRetry={retry} retrying={retrying} />
          </SafeAreaView>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LAUNCH_GROUND },
  web: { flex: 1, backgroundColor: LAUNCH_GROUND },
});

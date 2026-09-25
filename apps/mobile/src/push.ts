// Push for the shell. The token is an FCM token on BOTH platforms, via React
// Native Firebase, because the server only sends through FCM HTTP v1
// (apps/web/lib/fcm-server.ts). Expo's own device token would be a raw APNs
// token on iOS, which FCM refuses — that is the whole reason this is not
// expo-notifications.
//
// The website decides WHEN to ask (Settings, or the notification prompt card);
// this module only answers.

import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  hasPermission,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
} from '@react-native-firebase/messaging';
import { notificationPath, type PushPermission } from '@urganize/native-bridge';

const messaging = () => getMessaging();

function fromIosStatus(status: number): PushPermission {
  if (status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL) return 'granted';
  if (status === AuthorizationStatus.DENIED) return 'denied';
  return 'default';
}

// Android 13 (API 33) is where the runtime notification permission starts.
const needsAndroidRuntimePermission = () => Platform.OS === 'android' && Number(Platform.Version) >= 33;

export async function getPushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'ios') return fromIosStatus(await hasPermission(messaging()));
  if (!needsAndroidRuntimePermission()) {
    return (await hasPermission(messaging())) === AuthorizationStatus.AUTHORIZED ? 'granted' : 'denied';
  }
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  // Android cannot tell "never asked" from "said no" without asking, so an
  // ungranted permission reads as 'default'; asking again after a hard no
  // answers never_ask_again at once, which requestPushPermission maps to denied.
  return granted ? 'granted' : 'default';
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'ios') return fromIosStatus(await requestPermission(messaging()));
  if (!needsAndroidRuntimePermission()) return getPushPermission();
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

export async function getPushToken(): Promise<string> {
  if (Platform.OS === 'ios') await registerDeviceForRemoteMessages(messaging());
  const token = await getToken(messaging());
  if (!token) throw new Error('No push token was issued.');
  return token;
}

/** The in-app path a notification carries, if it is a safe one. */
function urlOf(message: { data?: Record<string, unknown> } | null): string | null {
  return notificationPath(message?.data);
}

/** Wires the listeners. `onTap` gets a path; `onToken` gets a rotated token.
 * Returns an unsubscribe. */
export function watchPush(handlers: { onTap: (url: string) => void; onToken: (token: string) => void }): () => void {
  const unsubscribers = [
    onNotificationOpenedApp(messaging(), (message) => {
      const url = urlOf(message);
      if (url) handlers.onTap(url);
    }),
    onTokenRefresh(messaging(), handlers.onToken),
  ];

  // A notification tapped while the app was fully closed launches the app; it
  // is only readable once, here.
  void getInitialNotification(messaging())
    .then((message) => {
      const url = urlOf(message);
      if (url) handlers.onTap(url);
    })
    .catch(() => {});

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

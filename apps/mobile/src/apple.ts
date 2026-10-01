import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { BridgeRequestMap } from '@urganize/native-bridge';

type AppleResult = BridgeRequestMap['appleSignIn']['result'];

/**
 * The iPhone's own Sign in with Apple sheet. Apple's rule 4.8 asks for it in any
 * app that offers a third-party login, and a native sheet (Face ID, no
 * password) is what people expect from it, so this is not a web redirect.
 *
 * The page sends the SHA-256 of a random nonce it keeps. Apple stamps that value
 * into the identity token, and Supabase later checks the token against the raw
 * nonce, so a token captured from one sign-in cannot be replayed for another.
 *
 * Apple returns the person's name only on the very first sign-in for this app,
 * so it is passed back in full and the page decides what to keep. Anything else
 * (no sheet available, Android) throws a message the page can show.
 */
export async function appleSignIn(
  payload: BridgeRequestMap['appleSignIn']['payload']
): Promise<AppleResult> {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: payload.hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return a sign-in token. Try again.');
    }

    return {
      outcome: 'success',
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode ?? null,
      givenName: credential.fullName?.givenName ?? null,
      familyName: credential.fullName?.familyName ?? null,
    };
  } catch (error) {
    // Closing the sheet is an answer, not a failure.
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') {
      return { outcome: 'cancelled' };
    }
    throw error;
  }
}

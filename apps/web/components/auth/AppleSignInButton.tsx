'use client';

import { useState, useSyncExternalStore } from 'react';
import { SiApple } from 'react-icons/si';

import { canSignInWithApple } from '@/lib/apple-sign-in';
import { useAuthStore } from '@/lib/auth-store';

const subscribe = () => () => {};
const serverSnapshot = () => false;

type AppleSignInButtonProps = {
  /** Where to land after sign-in, like loginWithGoogle's argument. */
  nextPath: string;
  /** Another sign-in is running, or this screen is not ready for one. */
  disabled?: boolean;
  /** Runs just before Apple's sheet opens (e.g. save a resume marker). */
  onBeforeStart?: () => void;
  /** Runs when the sign-in did not go through (cancelled or failed). */
  onNotCompleted?: () => void;
  /** Runs with a short message when sign-in failed. */
  onError?: (message: string) => void;
  className?: string;
};

/**
 * "Continue with Apple" (Apple rule 4.8: any app that offers Google must offer
 * this too). It renders ONLY inside the iPhone app, where Apple's own sheet is
 * available through the native bridge, and nowhere else: a browser tab,
 * Android and an old build of the app see nothing rather than a button that
 * cannot work.
 *
 * Styled to Apple's own guidance: the Apple logo, the words "Continue with
 * Apple", and a solid black or white button. `content-primary` on
 * `content-inverse` is black-on-white in the light theme and white-on-black in
 * the dark one, which is exactly the pair Apple allows for each.
 */
export function AppleSignInButton({
  nextPath,
  disabled = false,
  onBeforeStart,
  onNotCompleted,
  onError,
  className,
}: AppleSignInButtonProps) {
  const available = useSyncExternalStore(subscribe, canSignInWithApple, serverSnapshot);
  const loginWithApple = useAuthStore((state) => state.loginWithApple);
  const [isWorking, setIsWorking] = useState(false);

  if (!available) return null;

  const handleClick = async () => {
    setIsWorking(true);
    try {
      onBeforeStart?.();
      const proceeded = await loginWithApple(nextPath);
      if (!proceeded) {
        onNotCompleted?.();
        setIsWorking(false);
      }
      // When it proceeded, the page is navigating away; stay in the busy state.
    } catch (caught) {
      onNotCompleted?.();
      onError?.(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Sign in with Apple did not work. Please try again.'
      );
      setIsWorking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || isWorking}
      className={
        className ??
        'inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-content-primary px-4 py-3 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      <SiApple className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{isWorking ? 'Opening Apple…' : 'Continue with Apple'}</span>
    </button>
  );
}

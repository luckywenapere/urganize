// Sends a visitor who is already signed in to the product app, before the
// marketing page paints.
//
// The app (apps/web/lib/login-cookie.ts) sets a `urganize_in=1` cookie on
// .urganize.app while a session exists and clears it on sign-out. The cookie
// NAME is copied here because this app cannot import from that one; change
// both together.
//
// Why an inline script and not middleware or a cookie read in the page:
// either would make `/` dynamic, and the marketing pages stay static so a weak
// connection gets a CDN hit. A script in the body runs before the content
// below it is painted, and it adds no server work.
//
// It is a HINT. A stale cookie sends someone to the app, which shows its login
// form. It fails open: any error leaves the marketing page exactly as it is.
//
// `?stay` skips the redirect, so a link meant to show the website to a
// signed-in person (for example "Visit the website" from inside the app) does
// not bounce straight back.

import { APP_ORIGIN } from "./app-urls";

export const LOGIN_COOKIE_NAME = "urganize_in";

/** Cookie present, and not asked to stay. Pure, so it can be reasoned about. */
export function shouldRedirectToApp(cookieHeader: string, search: string): boolean {
  if (/(?:^|[?&])stay(?:=|&|$)/.test(search)) return false;
  return cookieHeader
    .split(";")
    .some((part) => part.trim() === `${LOGIN_COOKIE_NAME}=1`);
}

/**
 * The same decision as an IIFE, written out by hand because it has to run in
 * the browser with no imports. Kept deliberately small.
 */
export const LOGIN_REDIRECT_SCRIPT = `(function(){try{var s=location.search;if(/(?:^|[?&])stay(?:=|&|$)/.test(s))return;var c=document.cookie.split(";");for(var i=0;i<c.length;i++){if(c[i].trim()==="${LOGIN_COOKIE_NAME}=1"){location.replace(${JSON.stringify(
  `${APP_ORIGIN}/`,
)});return}}}catch(e){}})();`;

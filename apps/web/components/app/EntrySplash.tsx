import Image from 'next/image';

/**
 * The entry splash (#1365, #1375): every time someone opens the app, the U
 * (the headphone) shows alone in the middle, slides left as "rganize" fades
 * in beside it, and the layer fades away to reveal whatever loaded underneath
 * (the login page, the music side, a rollout).
 *
 * Rendered on every page by the root layout and HIDDEN by default. The
 * pre-paint entry-splash script in app/layout.tsx's <head> switches it on by
 * setting data-entry-splash="play" on <html>, only for a full load of an app
 * page, once per tab session, and never for reduced motion. Inside the phone
 * app a tab session is one app launch, so it plays on every cold open.
 *
 * In the phone app the first frame is the native launch screen exactly (same
 * ground, same mark size and spot), so the launch screen hands over to this
 * with no jump and the motion starts from there. All of that is CSS in
 * globals.css (.entry-splash); this component is only the markup, and needs
 * no client JavaScript, so it can never hold a page back.
 */
export function EntrySplash() {
  return (
    <div className="entry-splash" aria-hidden="true">
      <div className="entry-splash-word">
        <Image
          src="/images/urganize-wordmark-u.png"
          alt=""
          width={161}
          height={231}
          priority
          className="entry-splash-u app-wordmark"
        />
        <Image
          src="/images/urganize-wordmark-rganize.png"
          alt=""
          width={833}
          height={231}
          priority
          className="entry-splash-rest app-wordmark"
        />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import {
  UNSUBSCRIBE_API_PATH,
  UNSUBSCRIBE_SCOPE_LABELS,
  readUnsubscribeSecret,
  verifyUnsubscribeToken,
} from '@/lib/email/unsubscribe';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ t?: string; done?: string; error?: string }>;

// Opened from the footer of an email, usually by someone who is not signed in.
// Plain server-rendered markup with a real form, so it works with scripting off.
// Confirming is a button rather than the act of opening the link, because mail
// scanners open links.
export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const { t, done, error } = await searchParams;
  const secret = readUnsubscribeSecret();
  const verified = secret ? verifyUnsubscribeToken(secret, t) : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-2xl font-semibold text-content-primary">
        {done && verified ? 'You are unsubscribed' : 'Unsubscribe'}
      </h1>

      {!verified ? (
        <p className="mt-3 text-content-secondary">
          This link is not valid any more. If you still get emails you do not want, reply to one and
          we will stop them.
        </p>
      ) : done ? (
        <p className="mt-3 text-content-secondary">
          We will not send {UNSUBSCRIBE_SCOPE_LABELS[verified.scope]} to {verified.email} again.
        </p>
      ) : (
        <>
          <p className="mt-3 text-content-secondary">
            Stop sending {UNSUBSCRIBE_SCOPE_LABELS[verified.scope]} to {verified.email}?
          </p>
          {error ? (
            <p role="alert" className="mt-3 text-status-error">
              That did not save. Please try again.
            </p>
          ) : null}
          <form
            method="post"
            action={`${UNSUBSCRIBE_API_PATH}?t=${encodeURIComponent(t ?? '')}`}
            className="mt-6"
          >
            <input type="hidden" name="redirect" value="1" />
            <button
              type="submit"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-content-inverse"
            >
              Unsubscribe
            </button>
          </form>
          <p className="mt-4 text-sm text-content-tertiary">
            Emails about your account and your team still arrive, since you need those.
          </p>
        </>
      )}
    </main>
  );
}

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOGIN_COOKIE_NAME } from '@/lib/login-cookie';
import { entryPathForRequest } from '@/lib/music-host';

// The site root (#1378, #1380): music.urganize.app opens the music side for
// anyone; team.urganize.app (and every other address) opens the workspace for
// someone who is signed in and sign-in for someone who is not. One server
// redirect from the address and the sign-in hint cookie, so nothing waits on
// the browser and a signed-out person never sees the workspace skeleton first.
export default async function HomePage() {
  const host = (await headers()).get('host');
  const hasHint = (await cookies()).get(LOGIN_COOKIE_NAME)?.value === '1';
  redirect(entryPathForRequest(host, hasHint));
}

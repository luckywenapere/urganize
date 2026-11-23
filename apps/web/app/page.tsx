import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { rootPathForHost } from '@/lib/music-host';

// The site root (#1378): music.urganize.app opens the music side for anyone;
// team.urganize.app (and every other address) opens the workspace, which sends
// a signed-out person on to sign-in. Decided on the server from the address, so
// nothing waits on the browser.
export default async function HomePage() {
  const host = (await headers()).get('host');
  redirect(rootPathForHost(host));
}

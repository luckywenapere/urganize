import { redirect } from 'next/navigation';
import { MUSIC_PATH } from '@/lib/home-path';

// The front door is the music side (founder, 2026-11-21): anyone opening the
// app, signed in or not, lands on the song list. Until then this page waited for
// the auth store and sent a signed-in person to their dashboard and everyone
// else to /auth, which made a stranger's first sight of Urganize a sign-in form.
//
// A server redirect rather than a client one: there is no auth state to wait for
// any more, so nothing needs to run in the browser first. People who already use
// Urganize reach their rollouts and pitches from the music side (the Dashboard
// and Pitches buttons, and Settings), and a guidance card says so.
export default function HomePage() {
  redirect(MUSIC_PATH);
}

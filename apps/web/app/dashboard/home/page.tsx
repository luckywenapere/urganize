import { redirect } from 'next/navigation';

// Home left the menu (founder, 2026-10-29, #876). Its address opens Artists,
// so old links, emails and installed apps still land somewhere real.
export default function HomePage() {
  redirect('/dashboard');
}

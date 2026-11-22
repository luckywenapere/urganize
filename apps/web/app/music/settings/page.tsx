import { permanentRedirect } from 'next/navigation';

// Settings moved into the circle menu (#1364): kept so old links still land somewhere.
export default function Page() {
  permanentRedirect('/music');
}

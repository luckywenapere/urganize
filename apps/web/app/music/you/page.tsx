import { permanentRedirect } from 'next/navigation';

// You became Collection (#1364): kept so old links still land somewhere.
export default function Page() {
  permanentRedirect('/music/collection');
}

import type { Metadata } from 'next';
import ArtistVerificationAdminPageClient from './ArtistVerificationAdminPageClient';

export const metadata: Metadata = {
  title: 'Artist verification',
};

export default function ArtistVerificationAdminPage() {
  return <ArtistVerificationAdminPageClient />;
}

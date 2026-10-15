import { ProfileFace, profileInitials } from '@/components/shared/ProfileFace';

// A face on My People (URG-306): the person's own photo once they have claimed
// and listed their profile, otherwise a quiet grey monogram as the mock draws
// it. No status dot: green dots mean "Online now" elsewhere.

export function PersonFace({
  name,
  photoUrl,
  size,
  className = '',
}: {
  name: string;
  photoUrl: string | null;
  size: number;
  className?: string;
}) {
  if (photoUrl) return <ProfileFace name={name} photoUrl={photoUrl} size={size} className={className} />;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bg-surface font-semibold text-content-secondary ${
        size >= 80 ? 'text-3xl' : 'text-[17px]'
      } ${className}`}
    >
      {profileInitials(name)}
    </span>
  );
}

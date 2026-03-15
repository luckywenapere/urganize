import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function NotesLoading() {
  return (
    <LoadingScreen
      variant="dashboard"
      eyebrow="Notes"
      title="Loading your note board"
      description="Preparing your capture space for ideas, reminders, and launch fragments."
    />
  );
}

// app/releases/create/page.tsx
// Updated with AI Campaign integration - redirects to setup after creation
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore, generateDefaultTasks } from '@/lib/task-store';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import type { ReleaseType } from '@/types';
import { 
  ArrowLeft, 
  Music, 
  Calendar, 
  Check, 
  ChevronRight,
  Disc,
  Album,
  Library,
  Sparkles,
  Rocket
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

const releaseTypes: { type: ReleaseType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: 'single', label: 'Single', icon: <Disc className="w-6 h-6" />, description: '1-2 tracks' },
  { type: 'ep', label: 'EP', icon: <Album className="w-6 h-6" />, description: '3-6 tracks' },
  { type: 'album', label: 'Album', icon: <Library className="w-6 h-6" />, description: '7+ tracks' },
];

interface FormData {
  type: ReleaseType;
  title: string;
  artistName: string;
  releaseDate: string;
}

export default function CreateReleasePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addRelease } = useReleaseStore();
  const { addTask } = useTaskStore();
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    type: 'single',
    title: '',
    artistName: '',
    releaseDate: '',
  });

  // Calculate days until release
  const daysUntilRelease = formData.releaseDate 
    ? differenceInDays(new Date(formData.releaseDate), new Date())
    : null;

  // Step validation
  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.type && formData.title.trim() && formData.artistName.trim();
      case 2:
        return true; // Release date is optional
      case 3:
        return true;
      default:
        return false;
    }
  };

  // Handle form submission
  const handleSubmit = async (startCampaign: boolean = false) => {
    if (!user) return;
    
    setIsSubmitting(true);
    
    try {
      // Create the release
      const releaseId = await addRelease({
        userId: user.id,
        title: formData.title.trim(),
        artistName: formData.artistName.trim(),
        type: formData.type,
        status: 'draft',
        releaseDate: formData.releaseDate ? new Date(formData.releaseDate) : undefined,
      });

      // Generate default tasks (legacy system)
      const defaultTasks = generateDefaultTasks(releaseId, user.id);
      for (const task of defaultTasks) {
        await addTask(task);
      }

      // Redirect based on choice
      if (startCampaign) {
        // Go to AI campaign setup
        router.push(`/releases/${releaseId}/setup`);
      } else {
        // Go to release detail page
        router.push(`/releases/${releaseId}`);
      }
    } catch (error) {
      console.error('Failed to create release:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center gap-2 text-content-secondary hover:text-content-primary">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <Logo size="sm" />
            <div className="w-20" /> {/* Spacer */}
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-bg-surface border-b border-stroke-subtle">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div 
                key={s} 
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-brand' : 'bg-bg-elevated'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-content-tertiary mt-2">
            Step {step} of 3
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6 animate-in">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold text-content-primary mb-2">Create a Release</h2>
              <p className="text-content-secondary">Let&apos;s start with the basics</p>
            </div>

            {/* Release Type Selection */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-3">
                Release Type
              </label>
              <div className="grid grid-cols-3 gap-3">
                {releaseTypes.map((rt) => (
                  <button
                    key={rt.type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: rt.type })}
                    className={`flex flex-col items-center p-4 rounded-xl border transition-all ${
                      formData.type === rt.type
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-stroke-subtle hover:border-stroke-default text-content-secondary'
                    }`}
                  >
                    {rt.icon}
                    <span className="font-medium mt-2">{rt.label}</span>
                    <span className="text-xs mt-1 opacity-70">{rt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Release Title"
              placeholder="Enter the title of your release"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              leftIcon={<Music className="w-4 h-4" />}
              required
            />

            <Input
              label="Artist Name"
              placeholder="Who is releasing this?"
              value={formData.artistName}
              onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
              required
            />
          </div>
        )}

        {/* Step 2: Timeline */}
        {step === 2 && (
          <div className="space-y-6 animate-in">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold text-content-primary mb-2">Set Timeline</h2>
              <p className="text-content-secondary">When are you planning to release?</p>
            </div>

            <Input
              label="Release Date"
              type="date"
              value={formData.releaseDate}
              onChange={(e) => setFormData({ ...formData, releaseDate: e.target.value })}
              leftIcon={<Calendar className="w-4 h-4" />}
              hint="We recommend at least 4-6 weeks of prep time"
            />

            {daysUntilRelease !== null && daysUntilRelease > 0 && (
              <div className="p-4 rounded-xl bg-brand/10 border border-brand/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-brand" />
                  </div>
                  <div>
                    <p className="font-medium text-brand">{daysUntilRelease} days until release</p>
                    <p className="text-sm text-content-secondary">
                      {new Date(formData.releaseDate).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {daysUntilRelease !== null && daysUntilRelease < 14 && daysUntilRelease >= 0 && (
              <div className="p-4 rounded-xl bg-status-warning/10 border border-status-warning/20">
                <p className="text-sm text-status-warning">
                  ⚠️ Less than 2 weeks until release. Consider allowing more time for promotion.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Choose Path */}
        {step === 3 && (
          <div className="space-y-6 animate-in">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold text-content-primary mb-2">Ready to Create</h2>
              <p className="text-content-secondary">Review your release details</p>
            </div>

            {/* Summary Card */}
            <Card padding="lg" className="bg-bg-elevated">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-brand to-purple-500 flex items-center justify-center text-2xl">
                  🎵
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-content-primary">{formData.title}</h3>
                  <p className="text-content-secondary">{formData.artistName}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-2 py-1 bg-bg-surface rounded text-xs font-medium text-content-secondary capitalize">
                      {formData.type}
                    </span>
                    {formData.releaseDate && (
                      <span className="text-xs text-content-tertiary">
                        {new Date(formData.releaseDate).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Choose Your Path */}
            <div className="pt-4">
              <h3 className="text-lg font-semibold text-content-primary mb-4">
                Choose your path
              </h3>
              
              {/* AI Campaign Option - Recommended */}
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                className="w-full p-5 rounded-2xl border-2 border-brand bg-brand/5 hover:bg-brand/10 transition-all mb-4 text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-6 h-6 text-brand" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-brand">AI Marketing Campaign</span>
                      <span className="px-2 py-0.5 bg-brand text-white text-xs font-medium rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-content-secondary mb-3">
                      Get personalized, step-by-step marketing tasks powered by AI. 
                      Tailored to your artist profile, budget, and goals.
                    </p>
                    <div className="flex items-center gap-4 text-xs text-content-tertiary">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-400" />
                        Personalized strategy
                      </span>
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-400" />
                        One task at a time
                      </span>
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-400" />
                        Platform-specific
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-brand flex-shrink-0 mt-1" />
                </div>
              </button>

              {/* Classic Option */}
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="w-full p-5 rounded-2xl border border-stroke-subtle hover:border-stroke-default bg-bg-elevated hover:bg-bg-hover transition-all text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-bg-surface flex items-center justify-center flex-shrink-0">
                    <Rocket className="w-6 h-6 text-content-tertiary" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-content-primary">Classic Mode</span>
                    <p className="text-sm text-content-secondary mt-1">
                      Start with pre-defined tasks organized by release phase. 
                      Good for experienced managers who prefer flexibility.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-content-tertiary flex-shrink-0 mt-1" />
                </div>
              </button>
            </div>

            {isSubmitting && (
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                <span className="text-content-secondary">Creating your release...</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Navigation */}
      {step < 3 && (
        <div className="fixed bottom-0 left-0 right-0 bg-bg-surface/80 backdrop-blur-md border-t border-stroke-subtle p-4">
          <div className="max-w-2xl mx-auto flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="flex-1"
              >
                Back
              </Button>
            )}
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

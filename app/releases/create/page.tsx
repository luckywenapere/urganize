'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore, generateDefaultTasks } from '@/lib/task-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, ArrowRight, Check, Music, Calendar, Disc3 } from 'lucide-react';
import type { ReleaseType } from '@/types';

export default function CreateReleasePage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { addRelease } = useReleaseStore();
  const { addTask } = useTaskStore();
  
  const [step, setStep] = useState(1);
  const [isChecking, setIsChecking] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    artistName: '',
    type: 'single' as ReleaseType,
    releaseDate: '',
  });

  // Paywall: redirect to pricing if not subscribed
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
    } else if (user && !user.is_subscribed) {
      router.push('/pricing?from=create');
    } else if (user && user.is_subscribed) {
      setIsChecking(false);
    }
  }, [isAuthenticated, user, router]);

  const handleSubmit = async () => {
    if (!user) return;

    try {
      const newRelease = {
        title: formData.title,
        artistName: formData.artistName,
        type: formData.type,
        status: 'draft' as const,
        releaseDate: formData.releaseDate ? new Date(formData.releaseDate) : undefined,
        userId: user.id,
      };

      const releaseId = await addRelease(newRelease);
      const tasks = generateDefaultTasks(releaseId, user.id);
      
      for (const task of tasks) {
        await addTask(task);
      }
      
      router.push(`/releases/${releaseId}`);
    } catch (error) {
      console.error('Failed to create release:', error);
    }
  };

  // Show loading while checking subscription
  if (isChecking || !user?.is_subscribed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  const canProceed = step === 1 ? formData.title && formData.artistName : true;

  const daysUntilRelease = formData.releaseDate 
    ? Math.ceil((new Date(formData.releaseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg-base relative">
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand/5 rounded-full blur-[100px]" />
      
      <div className="w-full max-w-[540px] relative z-10">
        <div className="mb-8 animate-in">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : router.back()}
            className="inline-flex items-center gap-2 text-sm text-content-tertiary hover:text-content-primary transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {step > 1 ? 'Back' : 'Dashboard'}
          </button>
          <h1 className="text-2xl font-semibold text-content-primary mb-1">Create New Release</h1>
          <p className="text-content-secondary">Let's get your release organized</p>
        </div>

        <div className="flex items-center gap-2 mb-8 animate-in delay-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold transition-all duration-normal ${
                s < step ? 'bg-brand text-content-inverse' :
                s === step ? 'bg-brand text-content-inverse shadow-glow-sm' :
                'bg-bg-elevated text-content-tertiary border border-stroke-subtle'
              }`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`flex-1 h-0.5 rounded-full transition-colors ${
                  s < step ? 'bg-brand' : 'bg-stroke-subtle'
                }`} />
              )}
            </div>
          ))}
        </div>

        <Card className="animate-in delay-2" padding="lg">
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <h2 className="text-lg font-semibold text-content-primary mb-1">Basic Information</h2>
                <p className="text-sm text-content-tertiary">Tell us about your release</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-3">
                  What are you releasing?
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'single', label: 'Single', desc: '1 track', icon: Music, available: true },
                    { key: 'ep', label: 'EP', desc: '4-6 tracks', icon: Disc3, available: false },
                    { key: 'album', label: 'Album', desc: '7+ tracks', icon: Disc3, available: false },
                  ].map((type) => (
                    <button
                      key={type.key}
                      onClick={() => type.available && setFormData({ ...formData, type: type.key as ReleaseType })}
                      disabled={!type.available}
                      className={`p-4 rounded-xl border transition-all duration-fast relative ${
                        formData.type === type.key && type.available
                          ? 'border-brand bg-brand/10 shadow-glow-sm'
                          : type.available
                          ? 'border-stroke-default bg-bg-elevated hover:bg-bg-hover'
                          : 'border-stroke-subtle bg-bg-surface opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <type.icon className={`w-5 h-5 mx-auto mb-2 ${
                        formData.type === type.key ? 'text-brand' : 'text-content-tertiary'
                      }`} />
                      <div className="font-medium text-sm">{type.label}</div>
                      <div className="text-xs text-content-tertiary">{type.desc}</div>
                      {!type.available && (
                        <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 bg-bg-overlay text-content-quaternary rounded">
                          Soon
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="Release Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Midnight Dreams"
                required
              />

              <Input
                label="Artist Name"
                value={formData.artistName}
                onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
                placeholder="e.g., John Doe"
                required
              />

              <div className="pt-2">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canProceed}
                  className="w-full"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <h2 className="text-lg font-semibold text-content-primary mb-1">Set Timeline</h2>
                <p className="text-sm text-content-tertiary">When are you planning to release?</p>
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

              {!formData.releaseDate && (
                <p className="text-sm text-content-tertiary text-center p-4 bg-bg-elevated rounded-xl">
                  💡 You can skip this step and set the date later
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button onClick={() => setStep(3)} className="flex-1" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <h2 className="text-lg font-semibold text-content-primary mb-1">Review & Create</h2>
                <p className="text-sm text-content-tertiary">Everything look good?</p>
              </div>

              <div className="rounded-xl border border-stroke-subtle divide-y divide-stroke-subtle overflow-hidden">
                {[
                  { label: 'Type', value: formData.type.charAt(0).toUpperCase() + formData.type.slice(1) },
                  { label: 'Title', value: formData.title },
                  { label: 'Artist', value: formData.artistName },
                  ...(formData.releaseDate ? [{
                    label: 'Release Date',
                    value: new Date(formData.releaseDate).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })
                  }] : [])
                ].map((item) => (
                  <div key={item.label} className="flex justify-between p-4 bg-bg-surface">
                    <span className="text-sm text-content-tertiary">{item.label}</span>
                    <span className="text-sm font-medium text-content-primary">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-brand/10 border border-brand/20">
                <p className="font-medium text-brand mb-3 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  We'll automatically create:
                </p>
                <ul className="space-y-2 text-sm text-content-secondary">
                  {[
                    '16 pre-defined tasks across 4 phases',
                    'Organized file folders (Audio, Artwork, Stems)',
                    'Promotion timeline framework'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-brand" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleSubmit} className="flex-1" leftIcon={<Check className="w-4 h-4" />}>
                  Create Release
                </Button>
              </div>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-content-quaternary mt-6">
          Don't worry, you can edit everything later
        </p>
      </div>
    </div>
  );
}

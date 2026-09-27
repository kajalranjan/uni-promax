import { router } from 'expo-router';

import { EventsOnboardingForm } from '@/components/events/EventsOnboardingForm';

// Lets students change their Events answers after onboarding.
export default function EventPreferences() {
  return <EventsOnboardingForm mode="edit" onSaved={() => router.back()} />;
}

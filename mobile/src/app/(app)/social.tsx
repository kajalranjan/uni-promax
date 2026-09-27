import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { EventsOnboardingForm } from '@/components/events/EventsOnboardingForm';
import { EventsToday } from '@/components/events/EventsToday';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

// Social tab.
// First visit (profile.events_onboarded_at is null) → onboarding form.
// After that → the "Events today" page.
export default function Social() {
  const { profile, refreshProfile } = useAuth();

  if (!profile?.events_onboarded_at) {
    return (
      <>
        <Stack.Screen options={{ title: 'Set up Events' }} />
        {/* refreshProfile picks up events_onboarded_at, which switches this screen to the events page */}
        <EventsOnboardingForm mode="onboarding" onSaved={refreshProfile} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Social',
          headerRight: () => (
            <Pressable onPress={() => router.push('/event-preferences')} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.headerLink}>Preferences</Text>
            </Pressable>
          ),
        }}
      />
      <EventsToday />
    </>
  );
}

const styles = StyleSheet.create({
  headerLink: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});

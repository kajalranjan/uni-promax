import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EventsOnboardingForm } from '@/components/events/EventsOnboardingForm';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

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
      {/* Placeholder: the "Events today" list is the next piece to build. */}
      <View style={styles.container}>
        <Text style={styles.heading}>Events today</Text>
        <Text style={styles.text}>You're all set! Events matching your interests will show up here.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  text: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  headerLink: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});

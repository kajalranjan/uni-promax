import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="social" options={{ title: 'Social' }} />

      {/* Academics */}
      <Stack.Screen name="academics/index" options={{ title: 'Academics' }} />
      <Stack.Screen name="academics/onboarding" options={{ title: 'Academics setup' }} />
      <Stack.Screen name="academics/help-canvas" options={{ title: 'Canvas calendar link', presentation: 'modal' }} />
      <Stack.Screen name="academics/help-schedule" options={{ title: 'Class schedule file', presentation: 'modal' }} />
      <Stack.Screen name="academics/calendar" options={{ title: 'Calendar' }} />
      <Stack.Screen name="academics/today" options={{ title: 'Today' }} />
      <Stack.Screen name="academics/priority" options={{ title: 'High priority' }} />
      <Stack.Screen name="academics/assistant" options={{ title: 'AI assistant' }} />
    </Stack>
  );
}

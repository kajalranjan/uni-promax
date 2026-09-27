import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="academics" options={{ title: 'Academics' }} />
      <Stack.Screen name="social" options={{ title: 'Social' }} />
    </Stack>
  );
}

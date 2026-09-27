import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();

  // While we check for a saved login, show a spinner instead of flashing the Welcome screen.
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Logged in: the app itself */}
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      {/* Logged out: welcome, log in, sign up */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" options={{ headerShown: true, title: 'Log in', headerBackTitle: 'Back', headerTintColor: colors.primary }} />
        <Stack.Screen name="signup" options={{ headerShown: true, title: 'Sign up', headerBackTitle: 'Back', headerTintColor: colors.primary }} />
      </Stack.Protected>
    </Stack>
  );
}

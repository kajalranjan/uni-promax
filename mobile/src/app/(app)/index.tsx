import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

export default function Home() {
  const { profile, signOut } = useAuth();
  const firstName = profile?.full_name.trim().split(/\s+/)[0];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <Text style={styles.greeting}>Hi {firstName ?? 'there'}!</Text>

      {/* The top part of the homepage will be designed later. */}
      <View style={styles.flex} />

      <View style={styles.actions}>
        <Button title="Academics" onPress={() => router.push('/academics')} style={styles.flex} />
        <Button title="Social" onPress={() => router.push('/social')} style={styles.flex} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  topBar: { alignItems: 'flex-end', paddingTop: spacing.sm },
  logout: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  greeting: { fontSize: 34, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.lg },
});

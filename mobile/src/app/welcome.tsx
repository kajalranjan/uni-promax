import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, spacing } from '@/theme';

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Welcome to</Text>
        <Text style={styles.title}>Uni Promax</Text>
        <Text style={styles.subtitle}>Your classes, assignments and campus events in one place.</Text>
      </View>
      <View style={styles.actions}>
        <Button title="Log in" onPress={() => router.push('/login')} />
        <Button title="Sign up" variant="secondary" onPress={() => router.push('/signup')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  hero: { flex: 1, justifyContent: 'center' },
  kicker: { fontSize: 20, color: colors.muted, fontWeight: '500' },
  title: { fontSize: 44, fontWeight: '800', color: colors.primary, marginTop: spacing.xs },
  subtitle: { fontSize: 17, color: colors.text, marginTop: spacing.md, lineHeight: 24 },
  actions: { gap: spacing.md, paddingBottom: spacing.md },
});

import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

// Placeholder — the Events section is built on the feature/events branch.
export default function Social() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Events are coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  text: { fontSize: 17, color: colors.muted },
});

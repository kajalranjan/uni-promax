import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

// Placeholder — the Academics section is built on the feature/academics branch.
export default function Academics() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Academics is coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  text: { fontSize: 17, color: colors.muted },
});

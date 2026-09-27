import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  children?: ReactNode;
  style?: ViewStyle;
  tone?: 'light' | 'dark';
};

/** A tappable rounded card on the Academics page; tapping opens its full view. */
export function Bubble({ title, onPress, children, style, tone = 'light' }: Props) {
  const dark = tone === 'dark';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, open`}
      style={({ pressed }) => [
        styles.card,
        dark && { backgroundColor: colors.primary, borderColor: colors.primary },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
        style,
      ]}>
      <View style={styles.header}>
        <Text style={[styles.title, dark && { color: '#fff' }]}>{title}</Text>
        <Text style={[styles.chevron, dark && { color: '#fff' }]}>›</Text>
      </View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: 15, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chevron: { fontSize: 24, color: colors.muted, marginTop: -4 },
});

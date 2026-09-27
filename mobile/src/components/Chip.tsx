import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

type Props = { label: string; selected: boolean; onPress: () => void };

// A tappable pill used for multi-select lists (interests, clubs).
export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.text, selected && styles.selectedText]}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 14, fontWeight: '600', color: colors.text },
  selectedText: { color: '#fff' },
});

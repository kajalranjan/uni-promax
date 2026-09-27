import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Props<T extends string> = {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => void;
  placeholder?: string;
  /** Text for the "clear" row at the top; leave out to make a choice required. */
  noneLabel?: string;
};

// A dropdown that works the same on iOS and Android (no extra packages):
// tapping the field opens a list of options in a bottom sheet.
export function SelectField<T extends string>({ label, value, options, onChange, placeholder = 'Select', noneLabel }: Props<T>) {
  const [open, setOpen] = useState(false);
  const rows: (T | null)[] = noneLabel ? [null, ...options] : [...options];

  function pick(v: T | null) {
    onChange(v);
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? noneLabel ?? placeholder}`}
        style={({ pressed }) => [styles.field, pressed && { borderColor: colors.primary }]}>
        <Text style={[styles.value, !value && { color: colors.muted }]}>{value ?? noneLabel ?? placeholder}</Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <FlatList
            data={rows}
            keyExtractor={(item) => item ?? '__none__'}
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <Pressable
                  onPress={() => pick(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
                  <Text style={[styles.rowText, selected && styles.rowSelected]}>{item ?? noneLabel}</Text>
                  {selected && <Text style={styles.check}>✓</Text>}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  value: { flex: 1, fontSize: 16, color: colors.text },
  caret: { fontSize: 16, color: colors.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
    maxHeight: '60%',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 14 },
  rowText: { flex: 1, fontSize: 16, color: colors.text },
  rowSelected: { color: colors.primary, fontWeight: '700' },
  check: { fontSize: 16, color: colors.primary, fontWeight: '700' },
});

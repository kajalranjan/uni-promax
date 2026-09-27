import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Todo } from '@/lib/academics';
import { formatDue, formatMinutes } from '@/lib/dates';
import { colors, spacing } from '@/theme';

export function TodoRow({ todo, onToggle }: { todo: Todo; onToggle: () => void }) {
  const overdue = !!todo.due && !todo.isDone && todo.due.getTime() < Date.now();
  const meta = [
    todo.due ? formatDue(todo.due) : null,
    todo.estimatedMinutes && !todo.isDone ? `~${formatMinutes(todo.estimatedMinutes)} of work` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onToggle}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: todo.isDone }}
      accessibilityLabel={todo.title}>
      <View style={[styles.box, todo.isDone && styles.boxDone]}>
        {todo.isDone && <Text style={styles.check}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, todo.isDone && styles.titleDone]}>{todo.title}</Text>
        {!!meta && <Text style={[styles.meta, overdue && { color: colors.error }]}>{meta}</Text>}
      </View>
      {todo.priority === 1 && !todo.isDone && <View style={styles.dot} accessibilityLabel="High priority" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxDone: { backgroundColor: colors.success, borderColor: colors.success },
  check: { color: '#fff', fontWeight: '800', fontSize: 14 },
  title: { fontSize: 16, color: colors.text, fontWeight: '500' },
  titleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
});

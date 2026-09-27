import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TodoRow } from '@/components/TodoRow';
import { getEntries, getTodos, setTodoDone, type CalendarEntry, type Todo } from '@/lib/academics';
import { addDays, formatRange, startOfDay } from '@/lib/dates';
import { colors, kindColors, spacing } from '@/theme';

export default function PriorityScreen() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [sessions, setSessions] = useState<CalendarEntry[]>([]);

  const load = useCallback(async () => {
    const start = startOfDay(new Date());
    const [t, e] = await Promise.all([getTodos(), getEntries(start, addDays(start, 1))]);
    setTodos(t);
    setSessions(e.filter((x) => x.kind === 'study'));
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  async function toggle(t: Todo) {
    setTodos((all) => all.map((x) => (x.id === t.id ? { ...x, isDone: !x.isDone } : x)));
    await setTodoDone(t.id, !t.isDone).catch(() => load());
  }

  const weekFromNow = addDays(new Date(), 7).getTime();
  const urgent = todos.filter((t) => !t.isDone && t.priority === 1);
  const comingUp = todos.filter((t) => !t.isDone && t.priority !== 1 && t.due && t.due.getTime() <= weekFromNow);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Section title="Work on today" empty="No study sessions planned for today.">
        {sessions.map((s) => (
          <View key={s.id} style={[styles.session, { backgroundColor: kindColors.study.fill, borderLeftColor: kindColors.study.edge }]}>
            <Text style={styles.sessionTitle}>{s.title}</Text>
            <Text style={styles.sessionTime}>{formatRange(s.start, s.end)}</Text>
          </View>
        ))}
      </Section>

      <Section title="Due in the next 2 days" empty="Nothing urgent. Nice!">
        {urgent.map((t) => <TodoRow key={t.id} todo={t} onToggle={() => toggle(t)} />)}
      </Section>

      <Section title="Coming up this week" empty="Nothing else due this week.">
        {comingUp.map((t) => <TodoRow key={t.id} todo={t} onToggle={() => toggle(t)} />)}
      </Section>
    </ScrollView>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children.length ? children : <Text style={styles.empty}>{empty}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  empty: { color: colors.muted, fontSize: 15 },
  session: { borderLeftWidth: 4, borderRadius: 10, padding: spacing.sm + 2, marginBottom: spacing.sm },
  sessionTitle: { fontSize: 16, fontWeight: '700', color: kindColors.study.text },
  sessionTime: { fontSize: 13, color: kindColors.study.text, marginTop: 2 },
});

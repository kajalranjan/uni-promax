import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bubble } from '@/components/Bubble';
import { getEntries, getTodos, syncAcademics, type CalendarEntry, type Todo } from '@/lib/academics';
import { useAuth } from '@/lib/auth';
import { addDays, formatDue, formatTime, monthName, startOfDay, weekdayName } from '@/lib/dates';
import { colors, kindColors, spacing } from '@/theme';

export default function AcademicsHome() {
  const { profile, session } = useAuth();
  const [today, setToday] = useState<CalendarEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const now = useClock();

  const load = useCallback(async () => {
    const start = startOfDay(new Date());
    const [e, t] = await Promise.all([getEntries(start, addDays(start, 1)), getTodos()]);
    setToday(e);
    setTodos(t);
  }, []);

  const sync = useCallback(async (force: boolean) => {
    if (!session) return;
    try {
      const r = await syncAcademics(session.access_token, force);
      setNotice('');
      if (r.synced || r.replanned) await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't refresh from Canvas");
    }
  }, [session, load]);

  // Every time this page is shown: show saved data right away, then check Canvas.
  useFocusEffect(
    useCallback(() => {
      if (!profile?.academics_onboarded_at) return;
      load().catch(() => {});
      sync(false);
    }, [profile?.academics_onboarded_at, load, sync]),
  );

  if (profile && !profile.academics_onboarded_at) return <Redirect href="/academics/onboarding" />;

  async function onRefresh() {
    setRefreshing(true);
    await sync(true);
    await load().catch(() => {});
    setRefreshing(false);
  }

  const timed = today.filter((e) => !e.allDay && e.kind !== 'assignment');
  const upcoming = timed.filter((e) => (e.end ?? e.start).getTime() > now.getTime());
  const next = upcoming[0];
  const openTodos = todos.filter((t) => !t.isDone);
  const high = openTodos.filter((t) => t.priority === 1);
  const count = (k: CalendarEntry['kind']) => timed.filter((e) => e.kind === k).length;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      <Bubble title="Calendar" tone="dark" onPress={() => router.push('/academics/calendar')}>
        <View style={styles.calRow}>
          <Text style={styles.bigDate}>{now.getDate()}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.weekday}>{weekdayName(now)}</Text>
            <Text style={styles.month}>{monthName(now)} {now.getFullYear()}</Text>
          </View>
          <Text style={styles.clock}>{formatTime(now)}</Text>
        </View>
      </Bubble>

      <Bubble title="Today's schedule & to-do" onPress={() => router.push('/academics/today')}>
        {next ? (
          <View style={[styles.nextItem, { borderLeftColor: kindColors[next.kind].edge }]}>
            <Text style={styles.nextLabel}>{next.start.getTime() <= now.getTime() ? 'Now' : 'Next'} · {formatTime(next.start)}</Text>
            <Text style={styles.nextTitle} numberOfLines={1}>{next.title}</Text>
          </View>
        ) : (
          <Text style={styles.body}>Nothing else scheduled today.</Text>
        )}
        <Text style={styles.meta}>
          {count('class')} classes · {count('study')} study sessions · {openTodos.length} to-dos
        </Text>
      </Bubble>

      <View style={styles.row}>
        <Bubble title="High priority" style={styles.half} onPress={() => router.push('/academics/priority')}>
          <Text style={[styles.count, high.length > 0 && { color: colors.error }]}>{high.length}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            {high[0] ? `${high[0].title} · ${high[0].due ? formatDue(high[0].due, now) : ''}` : 'Nothing urgent'}
          </Text>
        </Bubble>
        <Bubble title="AI assistant" style={styles.half} onPress={() => router.push('/academics/assistant')}>
          <Text style={styles.sparkle}>✦</Text>
          <Text style={styles.meta} numberOfLines={2}>Ask about your week or tell it your plans</Text>
        </Bubble>
      </View>
    </ScrollView>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  notice: { color: colors.error, fontSize: 14, textAlign: 'center' },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bigDate: { fontSize: 64, fontWeight: '800', color: '#fff', lineHeight: 70 },
  weekday: { fontSize: 22, fontWeight: '700', color: '#fff' },
  month: { fontSize: 16, color: '#F3D6DF' },
  clock: { fontSize: 18, fontWeight: '700', color: colors.accent, alignSelf: 'flex-start' },
  nextItem: { borderLeftWidth: 4, paddingLeft: spacing.sm, marginBottom: spacing.sm },
  nextLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  nextTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text, marginBottom: spacing.sm },
  meta: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, minHeight: 140 },
  count: { fontSize: 40, fontWeight: '800', color: colors.text },
  sparkle: { fontSize: 36, color: colors.primary, marginBottom: 2 },
});

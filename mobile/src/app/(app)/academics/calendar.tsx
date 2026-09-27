import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { DayView, Legend, WeekView } from '@/components/CalendarViews';
import { Segmented } from '@/components/Segmented';
import { getEntries, type CalendarEntry } from '@/lib/academics';
import { addDays, formatDay, formatRange, monthName, startOfDay, startOfWeek } from '@/lib/dates';
import { colors, kindColors, spacing } from '@/theme';

type Mode = 'day' | 'week';

export default function CalendarScreen() {
  const [mode, setMode] = useState<Mode>('day');
  const [anchor, setAnchor] = useState(startOfDay(new Date()));
  const [entries, setEntries] = useState<CalendarEntry[]>([]);

  const range = useMemo(() => {
    const from = mode === 'day' ? anchor : startOfWeek(anchor);
    return { from, to: addDays(from, mode === 'day' ? 1 : 7) };
  }, [mode, anchor]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getEntries(range.from, range.to).then((e) => live && setEntries(e)).catch(() => {});
      return () => {
        live = false;
      };
    }, [range]),
  );

  const step = (n: number) => setAnchor((a) => addDays(a, n * (mode === 'day' ? 1 : 7)));
  const title =
    mode === 'day'
      ? formatDay(anchor)
      : `${monthName(range.from, true)} ${range.from.getDate()} – ${monthName(addDays(range.to, -1), true)} ${addDays(range.to, -1).getDate()}`;

  function showEntry(e: CalendarEntry) {
    const lines = [
      kindColors[e.kind].label,
      formatRange(e.start, e.end),
      e.location ? `📍 ${e.location}` : '',
      e.kind === 'study' ? 'Planned by your AI assistant to spread the work out.' : '',
    ].filter(Boolean);
    Alert.alert(e.title, lines.join('\n'));
  }

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Segmented<Mode>
          options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]}
          value={mode}
          onChange={setMode}
        />
        <View style={styles.nav}>
          <NavButton label="‹" onPress={() => step(-1)} a11y="Previous" />
          <Pressable onPress={() => setAnchor(startOfDay(new Date()))} accessibilityRole="button" accessibilityLabel="Go to today">
            <Text style={styles.navTitle}>{title}</Text>
          </Pressable>
          <NavButton label="›" onPress={() => step(1)} a11y="Next" />
        </View>
      </View>
      {mode === 'day' ? (
        <DayView day={anchor} entries={entries} onPressEntry={showEntry} />
      ) : (
        <WeekView
          weekStart={range.from}
          entries={entries}
          onPressEntry={showEntry}
          onPressDay={(d) => {
            setAnchor(d);
            setMode('day');
          }}
        />
      )}
      <Legend />
    </View>
  );
}

function NavButton({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.navBtn} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.navBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  top: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  navBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 28, color: colors.primary, marginTop: -4 },
});
